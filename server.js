// server.js
// Node 18+ (fetch встроен). ESM ("type": "module" в package.json).

import express from "express";
import dotenv from "dotenv";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// --- базовые настройки
app.set("trust proxy", true);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// --- статика из ./public (иконки, index.html, css, js)
app.use(express.static(path.join(__dirname, "public"), {
  extensions: ["html"], // / -> index.html
  setHeaders: (res, filePath) => {
    // правильный тип для .json в public
    if (filePath.endsWith(".json")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
  }
}));

// ====== HEALTH ======
app.get("/health", (req, res) => res.json({ ok: true }));

// ====== TonConnect manifest ======
// Если файл public/tonconnect-manifest.json есть — отдадим его как статику.
// Этот маршрут пригодится, если хочешь генерировать манифест на лету
// (например, под разные домены).
app.get("/tonconnect-manifest.json", (req, res, next) => {
  // Если файл существует в public — отдаст express.static. Иначе сгенерируем.
  const manifestPath = path.join(__dirname, "public", "tonconnect-manifest.json");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.send(JSON.stringify({
    url: process.env.PUBLIC_URL || baseUrlFrom(req),
    name: "Wild Time",
    iconUrl: `${process.env.PUBLIC_URL || baseUrlFrom(req)}/icons/app-icon.png`,
    termsOfUseUrl: `${process.env.PUBLIC_URL || baseUrlFrom(req)}/terms`,
    privacyPolicyUrl: `${process.env.PUBLIC_URL || baseUrlFrom(req)}/privacy`,
    manifestVersion: 1
  }));
});

// ====== Telegram avatar proxy (без CORS/404) ======
app.get("/api/tg/photo/:userId", async (req, res) => {
  try {
    const token = process.env.BOT_TOKEN;
    const userId = req.params.userId;
    if (!token) return res.status(500).send("BOT_TOKEN not set");

    const p1 = await fetch(`https://api.telegram.org/bot${token}/getUserProfilePhotos?user_id=${userId}&limit=1`);
    const j1 = await p1.json();
    const photos = j1?.result?.photos?.[0];
    if (!photos) return res.status(404).send("no photo");

    const fileId = photos[photos.length - 1].file_id; // максимальный размер
    const p2 = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
    const j2 = await p2.json();
    const fpath = j2?.result?.file_path;
    if (!fpath) return res.status(404).send("no file path");

    const fileResp = await fetch(`https://api.telegram.org/file/bot${token}/${fpath}`);
    if (!fileResp.ok) return res.status(502).send("tg file fetch failed");

    res.setHeader("Cache-Control", "public, max-age=3600, immutable");
    res.setHeader("Content-Type", fileResp.headers.get("content-type") || "image/jpeg");
    fileResp.body.pipe(res);
  } catch (e) {
    console.error(e);
    res.status(500).send("error");
  }
});

// ====== DEPOSIT ======
// Клиент отправляет: { amount, initData }
// Мы валидируем initData, при успехе шлём уведомление в Telegram и отвечаем ok.
app.post("/deposit", async (req, res) => {
  try {
    const { amount, initData } = req.body || {};
    const num = Number(amount);
    if (!Number.isFinite(num) || num < 0.5) {
      return res.status(400).json({ ok: false, error: "Minimum deposit 0.5 TON" });
    }

    const check = verifyInitData(initData, process.env.BOT_TOKEN, 300);
    if (!check.ok) return res.status(401).json({ ok: false, error: "unauthorized" });

    // user из initData
    let user = null;
    if (check.params.user) {
      try { user = JSON.parse(check.params.user); } catch {}
    }
    const chatId = user?.id;

    // Отправим уведомление в чат (если токен задан и chatId есть)
    if (process.env.BOT_TOKEN && chatId) {
      await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: `✅ Deposit request sent: ${num} TON\nPlease confirm in your wallet.`
        })
      }).catch(() => {});
    }

    // Здесь же можно логировать транзакции в БД.

    res.json({ ok: true, amount: num, userId: chatId });
  } catch (e) {
    console.error("deposit error:", e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// ====== (опционально) простой API старта раунда ======
app.get("/api/round/start", (_req, res) => {
  res.json({
    ok: true,
    serverSeed: crypto.randomBytes(16).toString("hex"),
    ts: Date.now()
  });
});

// ====== SPA fallback: все прочие GET отдать index.html ======
app.get("*", (req, res, next) => {
  // не перехватываем API/тонконнект
  if (req.path.startsWith("/api") || req.path === "/tonconnect-manifest.json") return next();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ====== старт ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});


// ========== helpers ==========
function baseUrlFrom(req) {
  const proto = (req.get("x-forwarded-proto") || req.protocol || "https").split(",")[0].trim();
  const host  = req.get("x-forwarded-host") || req.get("host");
  return `${proto}://${host}`;
}

// Верификация Telegram initData
function verifyInitData(initDataStr, botToken, maxAgeSeconds = 300) {
  try {
    if (!initDataStr || !botToken) return { ok: false, params: {} };

    const params = new URLSearchParams(initDataStr);
    const hash = params.get("hash");
    params.delete("hash");

    // проверка актуальности
    const authDate = Number(params.get("auth_date"));
    if (!Number.isNaN(authDate)) {
      const age = Date.now() / 1000 - authDate;
      if (age > maxAgeSeconds) return { ok: false, params: {} };
    }

    const dataCheckString = [...params.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const calcHash  = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

    const ok = hash && crypto.timingSafeEqual(Buffer.from(calcHash, "hex"), Buffer.from(hash, "hex"));
    return { ok, params: Object.fromEntries(params.entries()) };
  } catch {
    return { ok: false, params: {} };
  }
}
