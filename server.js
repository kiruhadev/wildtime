// server.js — ESM (Node 18+)
import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

// ====== Конфигурация ======
const ROOT = process.cwd();                             // папка, откуда ты запускаешь `npm start`
const PUBLIC = path.join(ROOT, "public");               // поддерживаем также вариант с /public
const HAS_ROOT_INDEX = fs.existsSync(path.join(ROOT, "index.html"));
const HAS_PUBLIC_INDEX = fs.existsSync(path.join(PUBLIC, "index.html"));
const STATIC_DIR = process.env.STATIC_DIR
  ? path.resolve(process.env.STATIC_DIR)
  : (HAS_ROOT_INDEX ? ROOT : (HAS_PUBLIC_INDEX ? PUBLIC : ROOT));

const PORT = Number(process.env.PORT) || 8080;
// Подпуть деплоя. Примеры: "/" или "/wildtime"
const BASE_PATH = (() => {
  let bp = process.env.BASE_PATH || "/";
  if (!bp.startsWith("/")) bp = "/" + bp;
  if (bp.length > 1 && bp.endsWith("/")) bp = bp.slice(0, -1);
  return bp;
})();

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);

// ====== Хелперы ======
function getBaseUrl(req) {
  const proto = (req.headers["x-forwarded-proto"] || req.protocol || "http").toString().split(",")[0];
  const host  = (req.headers["x-forwarded-host"]  || req.headers.host  || "").toString().split(",")[0];
  return `${proto}://${host}${BASE_PATH === "/" ? "" : BASE_PATH}`;
}

function setCacheHeaders(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") res.setHeader("Cache-Control", "no-store, must-revalidate");
  else if (ext === ".woff" || ext === ".woff2") res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  else res.setHeader("Cache-Control", "public, max-age=3600");
}

const router = express.Router();

// ====== Общие мидлвары ======
router.use(express.json({ limit: "1mb" }));

router.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Раздача статики: сначала корень, затем /public (если есть)
router.use(express.static(ROOT,   { index: false, setHeaders: setCacheHeaders }));
if (fs.existsSync(PUBLIC)) {
  router.use(express.static(PUBLIC, { index: false, setHeaders: setCacheHeaders }));
}

// ====== Служебные эндпоинты ======
router.get("/healthz", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// TonConnect manifest
router.get("/tonconnect-manifest.json", (req, res) => {
  const base = getBaseUrl(req);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.json({
    url: base,
    name: "Wild Time",
    iconUrl: `${base}/icons/app-icon.png`,
    termsOfUseUrl: `${base}/terms`,
    privacyPolicyUrl: `${base}/privacy`,
    manifestVersion: 2
  });
});

// Telegram avatar proxy (нужен BOT_TOKEN в .env)
router.get("/api/tg/photo/:userId", async (req, res) => {
  if (typeof fetch !== "function") {
    return res.status(500).send("Node 18+ required for Telegram proxy (fetch API).");
  }
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
    img.body.pipe(res);
  } catch (e) {
    console.error("photo proxy error:", e);
    res.status(500).send("server error");
  }
});

// ====== Заглушки API ======
router.post("/auth/validate", (_req, res) => res.json({ ok: true, user: { id: "guest" } }));

router.get("/api/round/start", (_req, res) => {
  const ORDER = [
    "Wild Time","1x","3x","Loot Rush","1x","7x","50&50","1x",
    "3x","11x","1x","3x","Loot Rush","1x","7x","50&50",
    "1x","3x","1x","11x","3x","1x","7x","50&50"
  ];
  const idx = Math.floor(Math.random() * ORDER.length);
  res.json({ ok: true, sliceIndex: idx, type: ORDER[idx] });
});

router.post("/deposit", (req, res) => {
  console.log("Deposit:", req.body);
  res.json({ ok: true });
});

// ====== SPA fallback ======
router.get("*", (req, res, next) => {
  const wantsHtml = (req.headers.accept || "").includes("text/html");
  const isAsset   = req.path.includes(".");
  if (!wantsHtml || isAsset) return next();

  const candidate = path.join(STATIC_DIR, "index.html");
  if (!fs.existsSync(candidate)) {
    console.error("❌ index.html not found at:", candidate);
    return res.status(404).send("index.html not found");
  }
  res.sendFile(candidate);
});

// Монтируем на BASE_PATH (поддержка подпутей)
app.use(BASE_PATH, router);

// ====== Старт ======
app.listen(PORT, () => {
  console.log("==============================================");
  console.log(`✅ Server running on:     http://localhost:${PORT}${BASE_PATH}`);
  console.log(`📁 Static directory:      ${STATIC_DIR}`);
  console.log(`🛣  Base path (BASE_PATH): ${BASE_PATH}`);
  console.log(`🩺 Healthcheck:           ${BASE_PATH}/healthz`);
  console.log("==============================================");
});
