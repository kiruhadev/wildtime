// server.js — Wild Time / ESM
import express from "express";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const __dirname = path.resolve();

// --- базовые мидлвары
app.use(express.json());

// Простейший CORS без пакета cors
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Раздача статики
app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: "1h",
    etag: false,
  })
);

// -------- TonConnect manifest (не кешируем) --------
app.get("/tonconnect-manifest.json", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.json({
    url: "https://wildtime-1.onrender.com", // замени, если домен другой
    name: "Wild Time",
    iconUrl: "https://wildtime-1.onrender.com/icons/app-icon.png",
    termsOfUseUrl: "https://wildtime-1.onrender.com/terms",
    privacyPolicyUrl: "https://wildtime-1.onrender.com/privacy",
    manifestVersion: 2,
  });
});

// -------- Прокси аватарки Telegram --------
// требует BOT_TOKEN в .env
app.get("/api/tg/photo/:userId", async (req, res) => {
  try {
    const token = process.env.BOT_TOKEN;
    if (!token) return res.status(500).send("BOT_TOKEN not set");
    const userId = req.params.userId;

    const photos = await fetch(
      `https://api.telegram.org/bot${token}/getUserProfilePhotos?user_id=${userId}&limit=1`
    ).then(r => r.json());

    const first = photos?.result?.photos?.[0];
    if (!first) return res.status(404).send("no photo");

    const bestFileId = first[first.length - 1].file_id;
    const file = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${bestFileId}`
    ).then(r => r.json());

    const filePath = file?.result?.file_path;
    if (!filePath) return res.status(404).send("no file path");

    const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
    const img = await fetch(fileUrl);
    if (!img.ok) return res.status(502).send("tg file fetch failed");

    res.setHeader("Cache-Control", "public, max-age=3600, immutable");
    res.setHeader("Content-Type", img.headers.get("content-type") || "image/jpeg");
    img.body.pipe(res);
  } catch (e) {
    console.error("photo proxy error:", e);
    res.status(500).send("server error");
  }
});

// -------- Приём уведомления о депозите (заглушка) --------
app.post("/deposit", (req, res) => {
  console.log("Deposit:", req.body);
  res.json({ ok: true });
});

// -------- SPA fallback --------
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// -------- start --------
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Wild Time server running on ${PORT}`));
