// server.js (ESM)
import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

dotenv.config();

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // раздаём /public

/* ========= CONFIG ========= */
const RECEIVER_TON = process.env.RECEIVER_TON || ""; // EQ... адрес проекта
const PORT = process.env.PORT || 3000;

/* ========= HELPERS ========= */
function verifyInitData(initDataStr, botToken, maxAgeSeconds = 300) {
  try {
    const params = new URLSearchParams(initDataStr || "");
    const receivedHash = params.get("hash");
    if (!receivedHash) return { ok: false };

    const authDate = Number(params.get("auth_date") || 0);
    if (authDate && (Date.now() / 1000 - authDate > maxAgeSeconds)) {
      return { ok: false };
    }

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

    const ok = crypto.timingSafeEqual(
      Buffer.from(checkHash, "hex"),
      Buffer.from(receivedHash, "hex")
    );

    return { ok, params: Object.fromEntries(params.entries()) };
  } catch {
    return { ok: false };
  }
}

/* ========= API: конфиг для фронта ========= */
app.get("/config", (req, res) => {
  res.json({ receiverTon: RECEIVER_TON });
});

/* ========= API: TonConnect manifest =========
   Файл должен лежать в public/tonconnect-manifest.json
   Этот маршрут просто отдаёт его явно. */
app.get("/tonconnect-manifest.json", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "tonconnect-manifest.json"));
});

/* ========= WHEEL: вероятности/раунд ========= */
const WT_OUTCOMES = [
  { key: "1x",        M: 1  },
  { key: "3x",        M: 3  },
  { key: "7x",        M: 7  },
  { key: "11x",       M: 11 },
  { key: "50&50",     M: 12 },
  { key: "Loot Rush", M: 20 },
  { key: "Wild Time", M: 40 }
];

const WT_WHEEL_ORDER = [
  "Wild Time","1x","3x","Loot Rush","1x","7x","50&50","1x",
  "3x","11x","1x","3x","Loot Rush","1x","7x","50&50",
  "1x","3x","1x","11x","3x","1x","7x","50&50"
];

function computeProbs() {
  const denom = WT_OUTCOMES.reduce((s, o) => s + (1 / o.M), 0);
  const probs = WT_OUTCOMES.map(o => ({ key: o.key, M: o.M, p: (1 / o.M) / denom }));
  return probs;
}
function pickType(probs) {
  const r = Math.random();
  let acc = 0;
  for (const it of probs) { acc += it.p; if (r <= acc) return it.key; }
  return probs[probs.length - 1].key;
}
function pickSliceIndexFor(typeKey) {
  const idxs = [];
  for (let i = 0; i < WT_WHEEL_ORDER.length; i++) if (WT_WHEEL_ORDER[i] === typeKey) idxs.push(i);
  if (!idxs.length) return 0;
  return idxs[Math.floor(Math.random() * idxs.length)];
}

app.get("/api/round/start", (req, res) => {
  try {
    const probs = computeProbs();
    const type = pickType(probs);
    const sliceIndex = pickSliceIndexFor(type);
    res.json({ ok: true, type, sliceIndex, totalSlices: WT_WHEEL_ORDER.length });
  } catch (e) {
    console.error("round/start error:", e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

/* ========= Уведомление в бота после депозита (клиентский сигнал) ========= */
app.post("/notify/deposit", async (req, res) => {
  try {
    const { amount, initData } = req.body || {};
    const num = Number(amount);
    if (!Number.isFinite(num)) return res.status(400).json({ ok: false });

    const v = verifyInitData(initData, process.env.BOT_TOKEN, 300);
    if (!v.ok) return res.status(401).json({ ok: false });

    let user = null;
    if (v.params.user) { try { user = JSON.parse(v.params.user); } catch {} }
    const chatId = user?.id;

    if (chatId && process.env.BOT_TOKEN) {
      await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: `✅Success! ${num} TON added to your Wild Time balance! `
        })
      });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error("/notify/deposit error:", e);
    res.status(500).json({ ok: false });
  }
});

/* ========= (Опционально) старый /deposit ========= */
app.post("/deposit", async (req, res) => {
  try {
    const { amount, initData } = req.body || {};
    const num = Number(amount);
    if (!Number.isFinite(num) || num < 0.1) { // если тестируешь 0.1
      return res.status(400).json({ ok: false, error: "Minimum deposit 0.1 TON" });
    }

    const v = verifyInitData(initData, process.env.BOT_TOKEN, 300);
    if (!v.ok) return res.status(401).json({ ok: false });

    let user = null;
    if (v.params.user) { try { user = JSON.parse(v.params.user); } catch {} }
    const chatId = user?.id;

    if (chatId && process.env.BOT_TOKEN) {
      await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: `✅ Deposit: ${num} TON` })
      });
    }

    res.json({ ok: true, amount: num, userId: chatId });
  } catch (e) {
    console.error("deposit error:", e);
    res.status(500).json({ ok: false });
  }
});

/* ========= SPA index ========= */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* ========= START ========= */
app.listen(PORT, () => {
  console.log(`🚀 Server on http://localhost:${PORT}`);
});
