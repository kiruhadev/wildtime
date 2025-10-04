// server.js (ESM)
import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
// import fetch from "node-fetch"; // НЕ НУЖНО в Node 18+

// если есть роут авторизации — оставляй
// import authRoute from "./routes/auth.js";

dotenv.config();

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   WHEEL CONFIG (должен совпадать с фронтом)
   ========================= */
const WT_OUTCOMES = [
  { key: "1x",        M: 1  },
  { key: "3x",        M: 3  },
  { key: "7x",        M: 7  },
  { key: "11x",       M: 11 },
  { key: "50&50",     M: 12 }, // средняя выплата бонуса
  { key: "Loot Rush", M: 20 }, // средняя выплата бонуса
  { key: "Wild Time", M: 40 }  // средняя выплата бонуса
];

const WT_WHEEL_ORDER = [
  "Wild Time","1x","3x","Loot Rush","1x","7x","50&50","1x",
  "3x","11x","1x","3x","Loot Rush","1x","7x","50&50",
  "1x","3x","1x","11x","3x","1x","7x","50&50"
];

// p ∝ 1/M  ⇒ EV одинаковый для всех ставок, RTP = 1 / Σ(1/M) < 1
function computeProbs() {
  const denom = WT_OUTCOMES.reduce((s, o) => s + (1 / o.M), 0);
  const rtp = 1 / denom;
  const probs = WT_OUTCOMES.map(o => ({
    key: o.key,
    M: o.M,
    p: (1 / o.M) / denom
  }));
  return { probs, rtp };
}

function pickType(probs) {
  const r = Math.random();
  let acc = 0;
  for (const it of probs) {
    acc += it.p;
    if (r <= acc) return it.key;
  }
  return probs[probs.length - 1].key;
}

function pickSliceIndexFor(typeKey) {
  const idxs = [];
  for (let i = 0; i < WT_WHEEL_ORDER.length; i++) {
    if (WT_WHEEL_ORDER[i] === typeKey) idxs.push(i);
  }
  if (!idxs.length) return 0;
  const j = Math.floor(Math.random() * idxs.length);
  return idxs[j];
}

/* =========================
   API: старт раунда (сервер решает исход)
   ========================= */
app.get("/api/round/start", (req, res) => {
  try {
    const { probs, rtp } = computeProbs();
    const type = pickType(probs);
    const sliceIndex = pickSliceIndexFor(type);
    res.json({ ok: true, type, sliceIndex, rtp, totalSlices: WT_WHEEL_ORDER.length });
  } catch (e) {
    console.error("round/start error:", e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

/* =========================
   (опционально) твой роут авторизации
   ========================= */
// app.use("/auth", authRoute);

/* =========================
   verifyInitData для Telegram WebApp
   ========================= */
function verifyInitData(initDataStr, botToken, maxAgeSeconds = 300) {
  const params = new URLSearchParams(initDataStr);
  const receivedHash = params.get("hash");
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort()
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const checkHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const ok =
    receivedHash &&
    crypto.timingSafeEqual(Buffer.from(checkHash, "hex"), Buffer.from(receivedHash, "hex"));

  // (опционально) можно валидировать age= timestamp
  return { ok, params: Object.fromEntries(params.entries()) };
}

/* =========================
   /deposit — пример приёма депозита + уведомление в TG
   ========================= */
app.post("/deposit", async (req, res) => {
  try {
    const { amount, initData } = req.body || {};
    const num = Number(amount);
    if (!Number.isFinite(num) || num < 0.5) {
      return res.status(400).json({ ok: false, error: "Minimum deposit 0.5 TON" });
    }

    const botToken = process.env.BOT_TOKEN;
    const v = verifyInitData(initData, botToken, 300);
    if (!v.ok) return res.status(401).json({ ok: false, error: "unauthorized" });

    let user = null;
    if (v.params.user) {
      try { user = JSON.parse(v.params.user); } catch {}
    }
    const chatId = user?.id;

    if (botToken && chatId) {
      // В Node 18+ fetch встроен
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: `✅ Deposit: ${num} TON`
        })
      });
    }

    res.json({ ok: true, amount: num, userId: chatId });
  } catch (e) {
    console.error("deposit error:", e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

/* =========================
   TON CONNECT MANIFEST
   ========================= */
 
  app.get("/tonconnect-manifest-v2.json", (req, res) => {
    res.json({
      url: "https://wildtime-1.onrender.com",
      name: "Wild Time",
      iconUrl: "https://wildtime-1.onrender.com/icons/app-icon.jpg",
      termsOfUseUrl: "https://wildtime-1.onrender.com/terms",
      privacyPolicyUrl: "https://wildtime-1.onrender.com/privacy",
      manifestVersion: 1
    });
  });
  
  



/* =========================
   Маршрут на фронт
   ========================= */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server on http://localhost:${PORT}`);
});
