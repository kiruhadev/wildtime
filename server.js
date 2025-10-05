// server.js
// Node 18+ (глобальный fetch). ESM ("type": "module" в package.json).

import express from "express";
import dotenv from "dotenv";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ---------- Базовые настройки ----------
app.set("trust proxy", true);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Маленький логгер (вкл. через DEBUG=true)
const DEBUG = process.env.DEBUG === "true";
const log = (...a) => (DEBUG ? console.log("[srv]", ...a) : null);

// ---------- 1) Динамический TonConnect манифест ----------
app.get("/tonconnect-manifest.json", (req, res) => {
  const base = baseUrlFrom(req); // https://your-domain
  const json = {
    manifestVersion: 2,
    name: "Wild Time",
    url: process.env.PUBLIC_URL || base, // ДОЛЖЕН совпадать с доменом, где открыт мини-эпп
    iconUrl: `${process.env.PUBLIC_URL || base}/icons/app-icon.png`
    // Не добавляем terms/privacy, если их нет — кошельки могут валить 404.
  };
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store"); // не кэшируем — избегаем «залипаний»
  return res.send(JSON.stringify(json));
});

// ---------- 2) API: health ----------
app.get("/health", (_req, res) => res.json({ ok: true }));

// ---------- 3) API: прокси аватар Telegram ----------
app.get("/api/tg/photo/:userId", async (req, res) => {
  try {
    const token  = process.env.BOT_TOKEN;
    const userId = req.params.userId;
    if (!token) return res.status(500).send("BOT_TOKEN not set");

    // 1) Получаем фотки
    const p1 = await fetch(`https://api.telegram.org/bot${token}/getUserProfilePhotos?user_id=${userId}&limit=1`);
    const j1 = await p1.json();
    const photos = j1?.result?.photos?.[0];
    if (!photos) return res.status(404).send("no photo");

    // 2) Берём самый большой размер и получаем file_path
    const fileId = photos[photos.length - 1].file_id;
    const p2 = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
    const j2 = await p2.json();
    const fpath = j2?.result?.file_path;
    if (!fpath) return res.status(404).send("no file path");

    // 3) Проксируем сам файл
    const fileResp = await fetch(`https://api.telegram.org/file/bot${token}/${fpath}`);
    if (!fileResp.ok) return res.status(502).send("tg file fetch failed");

    res.setHeader("Cache-Control", "public, max-age=3600, immutable");
    res.setHeader("Content-Type", fileResp.headers.get("content-type") || "image/jpeg");
    fileResp.body.pipe(res);
  } catch (e) {
    console.error("photo proxy error:", e);
    res.status(500).send("error");
  }
});

// ---------- 4) API: депозит (Telegram-нотификация + валидация initData) ----------
app.post("/deposit", async (req, res) => {
  try {
    const { amount, initData } = req.body || {};
    const num = Number(amount);
    if (!Number.isFinite(num) || num < 0.1) { // можно сменить минимум
      return res.status(400).json({ ok: false, error: "Minimum deposit 0.1 TON" });
    }

    const check = verifyInitData(initData, process.env.BOT_TOKEN, 300);
    if (!check.ok) return res.status(401).json({ ok: false, error: "unauthorized" });

    // user из initData (для уведомления)
    let user = null;
    if (check.params.user) {
      try { user = JSON.parse(check.params.user); } catch {}
    }
    const chatId = user?.id;

    // Отправим уведомление в Telegram (не блочим ответ, но ждём промис)
    if (process.env.BOT_TOKEN && chatId) {
      try {
        await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: `✅ Deposit request sent: ${num} TON\nPlease confirm in your wallet.`
          })
        });
      } catch (e) {
        log("tg notify error:", e?.message || e);
      }
    }

    // TODO: тут можно логировать депозит в БД
    return res.json({ ok: true, amount: num, userId: chatId || null });
  } catch (e) {
    console.error("deposit error:", e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

// ---------- 5) (опция) API: старт раунда (заглушка) ----------
app.get("/api/round/start", (_req, res) => {
  res.json({
    ok: true,
    serverSeed: crypto.randomBytes(16).toString("hex"),
    ts: Date.now()
  });
});

// ---------- 6) Статика: public/ ----------
// ВАЖНО: ставим ПОСЛЕ манифеста и API, но ДО SPA-fallback
app.use(express.static(path.join(__dirname, "public"), {
  extensions: ["html"], // / -> index.html
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".json")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
  }
}));

// ---------- 7) SPA fallback (index.html на всё остальное) ----------
app.get("*", (req, res, next) => {
  // Не перехватываем API и манифест
  if (req.path.startsWith("/api")) return next();
  if (req.path === "/tonconnect-manifest.json") return next();

  return res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---------- 8) Старт ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

// ================== helpers ==================
function baseUrlFrom(req) {
  const proto = (req.get("x-forwarded-proto") || req.protocol || "https").split(",")[0].trim();
  const host  = req.get("x-forwarded-host") || req.get("host");
  return `${proto}://${host}`;
}

// Проверка Telegram initData (по доке WebApp)
function verifyInitData(initDataStr, botToken, maxAgeSeconds = 300) {
  try {
    if (!initDataStr || !botToken) return { ok: false, params: {} };

    const params = new URLSearchParams(initDataStr);
    const receivedHash = params.get("hash");
    params.delete("hash");

    const authDate = Number(params.get("auth_date"));
    if (!Number.isNaN(authDate)) {
      const age = Math.floor(Date.now() / 1000) - authDate;
      if (age > maxAgeSeconds) return { ok: false, params: {} };
    }

    const dataCheckString = [...params.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();

    const calcHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    const ok = !!receivedHash &&
      crypto.timingSafeEqual(Buffer.from(calcHash, "hex"), Buffer.from(receivedHash, "hex"));

    return { ok, params: Object.fromEntries(params.entries()) };
  } catch (e) {
    return { ok: false, params: {} };
  }
}
