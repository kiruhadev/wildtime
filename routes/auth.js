import express from "express";
import crypto from "crypto";
const router = express.Router();

function parseInitData(initDataStr) {
  const params = new URLSearchParams(initDataStr);
  const obj = {};
  for (const [k, v] of params.entries()) obj[k] = v;
  return obj;
}

function verifyInitData(initDataStr, botToken, maxAgeSeconds = 300) {
  if (!initDataStr || !botToken) return { ok: false, reason: 'missing' };

  const params = parseInitData(initDataStr);
  const receivedHash = params.hash;
  if (!receivedHash) return { ok: false, reason: 'no_hash' };
  delete params.hash;

  const sortedKeys = Object.keys(params).sort();
  const dataCheckString = sortedKeys.map(k => `${k}=${params[k]}`).join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const checkHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const ok = crypto.timingSafeEqual(Buffer.from(checkHash, 'hex'), Buffer.from(receivedHash, 'hex'));
  if (!ok) return { ok: false, reason: 'hash_mismatch' };

  const authDate = Number(params.auth_date || 0);
  const now = Math.floor(Date.now()/1000);
  if (!Number.isFinite(authDate) || Math.abs(now - authDate) > maxAgeSeconds) {
    return { ok: false, reason: 'stale' };
  }

  return { ok: true, params };
}

router.post('/validate', (req, res) => {
  try {
    const { initData } = req.body || {};
    const result = verifyInitData(initData, process.env.BOT_TOKEN, 300);
    if (!result.ok) return res.status(400).json({ ok:false, reason: result.reason });

    let user = null;
    if (result.params.user) {
      try { user = JSON.parse(result.params.user); } catch {}
    }
    return res.json({ ok: true, user });
  } catch (e) {
    console.error('auth/validate error:', e);
    res.status(500).json({ ok:false, error:'server_error' });
  }
});

export default router;
