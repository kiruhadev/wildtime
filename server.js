// server.js — Wild Time (финальная версия)
// Требуется Node.js 18+ (встроенный fetch)
import express from "express";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const ROOT = process.cwd();
const PORT = Number(process.env.PORT) || 8080;

app.disable("x-powered-by");
app.set("trust proxy", true); // корректная работа за прокси (Render/Vercel/Cloudflare)

// ---------- Helpers ----------
function getBaseUrl(req) {
  const proto = (req.headers["x-forwarded-proto"] || req.protocol || "http").split(",")[0];
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0];
  return `${proto}://${host}`;
}

// ---------- Общие мидлвары ----------
app.use(express.json({ limit: "1mb" }));

// CORS (при необходимости ужесточи Origin)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Статика из корня проекта
app.use(express.static(ROOT, {
  extensions: ["html"],
  index: "index.html",
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    // HTML — не кэшируем (чтобы релизы подтягивались сразу)
    if (ext === ".html") {
      res.setHeader("Cache-Control", "no-store, must-revalidate");
    } else if (ext === ".woff" || ext === ".woff2") {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    } else {
      // остальное кэшируем умеренно
      res.setHeader("Cache-Control", "public, max-age=3600");
    }
  }
}));

// ---------- Служебные эндпоинты ----------

// Healthcheck
app.get("/healthz", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// TonConnect manifest — формируется от текущего хоста
app.get("/tonconnect-manifest.json", (req, res) => {
  const base = getBaseUrl(req);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.json({
    url: base,
    name: "Wild Time",
    iconUrl: `${base}/icons/app-icon.png`,       // положи иконку сюда
    termsOfUseUrl: `${base}/terms`,
    privacyPolicyUrl: `${base}/privacy`,
    manifestVersion: 2
  });
});

// Прокси аватара Telegram (нужен .env: BOT_TOKEN=12345:ABC...)
// Работает только внутри авторизованного бота/у пользователя есть аватар
app.get("/api/tg/photo/:userId", async (req, res) => {
  try {
    const token = process.env.BOT_TOKEN;
    if (!token) return res.status(500).send("BOT_TOKEN is not set");

    const uid = req.params.userId;

    const photos = await fetch(
      `https://api.telegram.org/bot${token}/getUserProfilePhotos?user_id=${uid}&limit=1`
    ).then(r => r.json());

    const first = photos?.result?.photos?.[0];
    if (!first) return res.status(404).send("no photo");

    const bestFileId = first[first.length - 1]?.file_id;
    if (!bestFileId) return res.status(404).send("no file id");

    const file = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${bestFileId}`
    ).then(r => r.json());

    const fp = file?.result?.file_path;
    if (!fp) return res.status(404).send("no file path");

    const img = await fetch(`https://api.telegram.org/file/bot${token}/${fp}`);
    if (!img.ok) return res.status(502).send("tg file fetch failed");

    res.setHeader("Cache-Control", "public, max-age=3600, immutable");
    res.setHeader("Content-Type", img.headers.get("content-type") || "image/jpeg");
    // Стримим ответ напрямую
    img.body.pipe(res);
  } catch (e) {
    console.error("photo proxy error:", e);
    res.status(500).send("server error");
  }
});

// ---------- Бизнес-заглушки (можешь заменить на реальные) ----------

// Валидация телеги (пример)
app.post("/auth/validate", (_req, res) => {
  // сюда обычно присылают initData и проверяют подпись — см. доки Telegram
  res.json({ ok: true, user: { id: "guest" } });
});

// Старт раунда колеса: отдаём индекс сегмента
app.get("/api/round/start", (_req, res) => {
  const ORDER = [
    "Wild Time","1x","3x","Loot Rush","1x","7x","50&50","1x",
    "3x","11x","1x","3x","Loot Rush","1x","7x","50&50",
    "1x","3x","1x","11x","3x","1x","7x","50&50"
  ];
  const idx = Math.floor(Math.random() * ORDER.length);
  res.json({ ok: true, sliceIndex: idx, type: ORDER[idx] });
});

// Фиксация депозита (пример)
app.post("/deposit", (req, res) => {
  // ожидаем { amount: number, address: string }
  console.log("Deposit:", req.body);
  res.json({ ok: true });
});

// ---------- SPA fallback ----------
app.get("*", (_req, res) => {
  res.sendFile(path.join(ROOT, "index.html"));
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`✅ Wild Time server running on http://localhost:${PORT}`);
});
