// server.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import fetch from "node-fetch";
import crypto from "crypto";

dotenv.config();
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BOT_TOKEN = process.env.BOT_TOKEN || "";
const PORT = process.env.PORT || 3000;
const MIN_DEPOSIT = Number(process.env.MIN_DEPOSIT ?? 0.5);

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

// verify Telegram initData (from WebApp)
function verifyInitData(initDataStr = "", botToken = "") {
  // initDataStr expected like: "key1=val1&key2=val2&hash=..."
  const params = new URLSearchParams(initDataStr);
  const receivedHash = params.get("hash");
  if (!receivedHash) return { ok: false };

  params.delete("hash");
  // Build data-check-string
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
    Buffer.from(checkHash, "hex").length === Buffer.from(receivedHash, "hex").length
      ? crypto.timingSafeEqual(Buffer.from(checkHash, "hex"), Buffer.from(receivedHash, "hex"))
      : false;

  const parsed = Object.fromEntries(params.entries());
  return { ok, params: parsed };
}

// POST /deposit -> body: { amount, initData }
app.post("/deposit", async (req, res) => {
  try {
    const { amount, initData } = req.body || {};
    const num = Number(amount);
    if (!Number.isFinite(num) || num < MIN_DEPOSIT) {
      return res.status(400).json({ ok: false, error: `Minimum deposit ${MIN_DEPOSIT}` });
    }

    const ver = verifyInitData(initData || "", BOT_TOKEN);
    if (!ver.ok) {
      return res.status(401).json({ ok: false, error: "unauthorized initData" });
    }

    let user = null;
    if (ver.params.user) {
      try {
        user = JSON.parse(ver.params.user);
      } catch {
        // ignore
      }
    }
    const chatId = user?.id || ver.params.chat_id || null;

    // If we have a chatId and BOT_TOKEN, notify the user in Telegram
    if (BOT_TOKEN && chatId) {
      const text = `✅ Deposit request sent: ${num} TON\nPlease confirm in your wallet.\n\nIf you didn't initiate - ignore.`;
      const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text })
      });
    }

    return res.json({ ok: true, amount: num, userId: chatId || null });
  } catch (err) {
    console.error("Deposit error:", err);
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
