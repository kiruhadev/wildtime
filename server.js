// server.js — Wild Time (без node-fetch)
import express from "express";
import path from "path";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
const __dirname = path.resolve();

// ---- middleware
app.use(express.json());
app.use(cors());
app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: "1h",
    etag: false,
  })
);

// ---- TonConnect manifest (без кеша)
app.get("/tonconnect-manifest.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );

  res.json({
    url: "https://wildtime-1.onrender.com",
    name: "Wild Time",
    iconUrl: "https://wildtime-1.onrender.com/icons/app-icon.png",
    termsOfUseUrl: "https://wildtime-1.onrender.com/terms",
    privacyPolicyUrl: "https://wildtime-1.onrender.com/privacy",
    manifestVersion: 2,
  });
});

// ---- Прокси аватарки Telegram
app.get("/api/tg/photo/:userId", async (req, res) => {
  try {
    const token = process.env.BOT_TOKEN;
    if (!token) return res.status(500).send("BOT_TOKEN not set");
    const userId = req.params.userId;

    const photosResp = await fetch(
      `https://api.telegram.org/bot${token}/getUserProfilePhotos?user_id=${userId}&limit=1`
    );
    const photosJson = await photosResp.json();
    const photo = photosJson?.result?.photos?.[0];
    if (!photo) return res.status(404).send("no photo");

    const fileId = photo[photo.length - 1].file_id;
    const fileResp = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`
    );
    const fileJson = await fileResp.json();
    const filePath = fileJson?.result?.file_path;
    if (!filePath) return res.status(404).send("no file path");

    const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
    const imgResp = await fetch(fileUrl);
    if (!imgResp.ok) return res.status(502).send("tg file fetch failed");

    res.setHeader("Cache-Control", "public, max-age=3600, immutable");
    res.setHeader(
      "Content-Type",
      imgResp.headers.get("content-type") || "image/jpeg"
    );
    imgResp.body.pipe(res);
  } catch (e) {
    console.error("photo proxy error:", e);
    res.status(500).send("server error");
  }
});

// ---- Приём уведомления о депозите (плейсхолдер)
app.post("/deposit", (req, res) => {
  console.log("Deposit:", req.body);
  res.json({ ok: true });
});

// ---- SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---- start
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Wild Time server running on ${PORT}`));
