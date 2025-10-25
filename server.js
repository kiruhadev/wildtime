// server.js — Wild Time (ESM)
import express from "express";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const __dirname = path.resolve();

// базовые мидлвары
app.use(express.json());

// простой CORS
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// статика из КОРНЯ (где index.html, style.css, js-файлы)
app.use(express.static(__dirname, { maxAge: "1h", etag: false }));

// TonConnect manifest — формируем динамически от текущего хоста
app.get("/tonconnect-manifest.json", (req, res) => {
  const base = `${req.protocol}://${req.get("host")}`;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.json({
    url: base,
    name: "Wild Time",
    iconUrl: `${base}/icons/app-icon.png`,
    termsOfUseUrl: `${base}/terms`,
    privacyPolicyUrl: `${base}/privacy`,
    manifestVersion: 2
  });
});

// Прокси аватарки Telegram (нужен BOT_TOKEN в .env)
app.get("/api/tg/photo/:userId", async (req, res) => {
  try {
    const token = process.env.BOT_TOKEN;
    if (!token) return res.status(500).send("BOT_TOKEN not set");
    const uid = req.params.userId;

    const photos = await fetch(
      `https://api.telegram.org/bot${token}/getUserProfilePhotos?user_id=${uid}&limit=1`
    ).then(r => r.json());

    const first = photos?.result?.photos?.[0];
    if (!first) return res.status(404).send("no photo");

    const bestFileId = first[first.length - 1].file_id;
    const file = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${bestFileId}`
    ).then(r => r.json());

    const fp = file?.result?.file_path;
    if (!fp) return res.status(404).send("no file path");

    const img = await fetch(`https://api.telegram.org/file/bot${token}/${fp}`);
    if (!img.ok) return res.status(502).send("tg file fetch failed");

    res.setHeader("Cache-Control", "public, max-age=3600, immutable");
    res.setHeader("Content-Type", img.headers.get("content-type") || "image/jpeg");
    img.body.pipe(res);
  } catch (e) {
    console.error("photo proxy error:", e);
    res.status(500).send("server error");
  }
});

// Заглушка приёма депозита
app.post("/deposit", (req, res) => {
  console.log("Deposit:", req.body);
  res.json({ ok: true });
});

// Заглушки API (чтобы не было 404 в консоли)
app.post("/auth/validate", (req, res) => res.json({ ok: true, user: { id: "guest" } }));
app.get("/api/round/start", (_req, res) => {
  // отдаём случайный исход — фронт всё равно умеет фолбэчить
  const ORDER = [
    'Wild Time','1x','3x','Loot Rush','1x','7x','50&50','1x',
    '3x','11x','1x','3x','Loot Rush','1x','7x','50&50',
    '1x','3x','1x','11x','3x','1x','7x','50&50'
  ];
  const idx = Math.floor(Math.random() * ORDER.length);
  res.json({ ok: true, sliceIndex: idx, type: ORDER[idx] });
});

// SPA fallback
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// start
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Wild Time server running on http://localhost:${PORT}`));
