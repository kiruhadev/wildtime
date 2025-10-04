/* public/js/deposit.js — FINAL */
(() => {
  const MANIFEST_URL = `${location.origin}/tonconnect-manifest.json?v=${Date.now()}`;
  const MIN_DEPOSIT_TON = 0.1;
  // ВСТАВЬ СЮДА адрес-получатель (friendly UQ/EQ):
  const RECEIVER_TON = "UQCtVhhBFPBvCoT8H7szNQUhEvHgbvnX50r8v6d8y5wdr19J";

  // Ждём user.id из Telegram до 10 сек (внутри мини-эппа он есть всегда)
  function waitForTelegramUserId(timeoutMs = 10000) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const tick = () => {
        const id = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
        if (id) return resolve(String(id));
        if (Date.now() - t0 > timeoutMs) return resolve(`guest:${cryptoRandom()}`);
        setTimeout(tick, 50);
      };
      try { window.Telegram?.WebApp?.ready?.(); } catch {}
      tick();
    });
  }
  function cryptoRandom() {
    try {
      const a = new Uint32Array(2); crypto.getRandomValues(a);
      return `${a[0].toString(16)}${a[1].toString(16)}`;
    } catch { return `${Math.random()}`.slice(2); }
  }

  function makeUserScopedStorage(userId) {
    const prefix = `wt:${userId}:tc:`;
    return {
      getItem: (k) => { try { return localStorage.getItem(prefix + k); } catch { return null; } },
      setItem: (k, v) => { try { localStorage.setItem(prefix + k, v); } catch {} },
      removeItem: (k) => { try { localStorage.removeItem(prefix + k); } catch {} }
    };
  }
  function cleanupOldKeys() {
    const toDrop = [];
    for (let i=0;i<localStorage.length;i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith("wt:guest:tc:") || k.startsWith("ton-connect-ui")) toDrop.push(k);
    }
    toDrop.forEach(k => localStorage.removeItem(k));
  }

  // ---------- DOM ----------
  const sheet       = document.getElementById("depositSheet");
  const backdrop    = sheet?.querySelector(".sheet__backdrop");
  const closeBtn    = sheet?.querySelector(".sheet__close");
  const actionsWrap = sheet?.querySelector(".dep-actions");

  const amountInput = document.getElementById("depAmount");
  const hintEl      = document.getElementById("depHint");
  const connectBtn  = document.getElementById("btnConnectTon");
  const depositBtn  = document.getElementById("btnDepositNow");
  const tonPill     = document.getElementById("tonPill");

  // ---------- helpers ----------
  function normalizeAmount(s) {
    if (!s) return NaN;
    let x = String(s).replace(",", ".").replace(/[^\d.]/g, "");
    const i = x.indexOf(".");
    if (i !== -1) x = x.slice(0, i + 1) + x.slice(i + 1).replace(/\./g, "");
    const n = parseFloat(x);
    return Number.isFinite(n) ? n : NaN;
  }
  const toNano = (num) => BigInt(Math.round(num * 1e9)).toString();

  // ---------- TonConnect ----------
  let tc = null, wallet = null;

  async function init() {
    const userId = await waitForTelegramUserId();
    cleanupOldKeys();
    const storage = makeUserScopedStorage(userId);

    // Не создаём второй инстанс
    if (window.__wtTonConnect) {
      tc = window.__wtTonConnect;
    } else {
      tc = new TON_CONNECT_UI.TonConnectUI({
        manifestUrl: MANIFEST_URL,
        uiPreferences: { theme: "SYSTEM" },
        storage,
        restoreConnection: true
      });
      window.__wtTonConnect = tc;
      window.dispatchEvent(new Event("wt-tc-ready"));
    }

    try { await tc.connectionRestored; } catch {}
    wallet = tc.wallet || null;

    if (!tc.__wtDepositBound) {
      tc.__wtDepositBound = true;
      tc.onStatusChange((w) => {
        wallet = w || null;
        renderUI();
        sheet?.classList.remove("sheet--below");
      });
    }
    renderUI();
  }

  function isAmountOk() {
    const n = normalizeAmount(amountInput?.value || "");
    return Number.isFinite(n) && n >= MIN_DEPOSIT_TON;
  }

  function renderUI() {
    const connected = !!wallet;
    if (connectBtn)  connectBtn.style.display = connected ? "none" : "";
    if (actionsWrap) actionsWrap.classList.toggle("single", connected);
    if (depositBtn)  depositBtn.disabled = !(connected && isAmountOk());
    if (hintEl) {
      hintEl.textContent = connected
        ? "Enter amount and confirm in your wallet"
        : "Connect your TON wallet first";
    }
  }

  function openSheet(){ sheet?.classList.add("sheet--open"); renderUI(); }
  function closeSheet(){ sheet?.classList.remove("sheet--open"); }

  tonPill?.addEventListener("click", openSheet);
  backdrop?.addEventListener("click", closeSheet);
  closeBtn?.addEventListener("click", closeSheet);

  amountInput?.addEventListener("input", () => {
    const caret = amountInput.selectionStart;
    amountInput.value = amountInput.value.replace(",", ".").replace(/[^\d.]/g, "");
    const i = amountInput.value.indexOf(".");
    if (i !== -1) {
      amountInput.value = amountInput.value.slice(0, i + 1) +
        amountInput.value.slice(i + 1).replace(/\./g, "");
    }
    try { amountInput.setSelectionRange(caret, caret); } catch {}
    renderUI();
  });

  connectBtn?.addEventListener("click", async () => {
    try { sheet?.classList.add("sheet--below"); await tc.openModal(); }
    catch(e){ console.warn("[deposit] openModal", e); }
    finally { setTimeout(() => sheet?.classList.remove("sheet--below"), 300); }
  });

  depositBtn?.addEventListener("click", async () => {
    const amt = normalizeAmount(amountInput?.value || "");
    if (!wallet) { try { await tc.openModal(); } catch {} return; }
    if (!(amt >= MIN_DEPOSIT_TON)) { if (hintEl) hintEl.textContent = `Minimum is ${MIN_DEPOSIT_TON} TON`; return; }
    if (!RECEIVER_TON || RECEIVER_TON.includes("YOUR_PROJECT_ADDRESS")) { if (hintEl) hintEl.textContent = "Receiver address is not set"; return; }

    try {
      depositBtn.disabled = true;
      await tc.sendTransaction({
        validUntil: Math.floor(Date.now()/1000) + 60,
        messages: [{ address: RECEIVER_TON, amount: toNano(amt) }]
      });
      if (hintEl) hintEl.textContent = "✅ Request sent. Confirm in your wallet";
      if (amountInput) amountInput.value = "";
    } catch (err) {
      console.error("[deposit] sendTransaction", err);
      if (hintEl) hintEl.textContent = "❌ Transaction canceled or failed";
    } finally {
      depositBtn.disabled = false;
      renderUI();
    }
  });

  window.addEventListener("focus", () => {
    setTimeout(() => sheet?.classList.remove("sheet--below"), 300);
    renderUI();
  });

  init();
})();
