// public/js/deposit.js
(() => {
  // ====== КОНФИГ ======
  // Хитро: добавляем ?v=timestamp чтобы КОШЕЛЁК точно взял свежий манифест и увидел ЛОГО
  const MANIFEST_URL = `${location.origin}/tonconnect-manifest.json?v=${Date.now()}`;
  const PROJECT_TON_ADDRESS = "UQCtVhhBFPBvCoT8H7szNQUhEvHgbvnX50r8v6d8y5wdr19J"; // UQ/EQ адрес проекта
  const MIN_DEPOSIT = 0.5; // можно 0.1 для теста

  // ====== DOM ======
  const sheet        = document.getElementById("depositSheet");
  const backdrop     = sheet?.querySelector(".sheet__backdrop");
  const btnClose     = document.getElementById("depClose");
  const amountInput  = document.getElementById("depAmount");
  const btnConnect   = document.getElementById("btnConnectWallet");
  const btnDeposit   = document.getElementById("btnDepositNow");
  const tonPill      = document.getElementById("tonPill");

  // ====== helpers ======
  const tgUserId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || "guest";
  const initData = window.Telegram?.WebApp?.initData || "";

  function makeScopedStorage(prefix) {
    return {
      getItem: (k) => localStorage.getItem(`${prefix}:${k}`),
      setItem: (k, v) => localStorage.setItem(`${prefix}:${k}`, v),
      removeItem: (k) => localStorage.removeItem(`${prefix}:${k}`)
    };
  }
  function cleanupOldTonConnectKeys() {
    const bad = ["ton-connect-ui", "ton-connect-storage_bridge_v2"];
    bad.forEach((k)=> localStorage.removeItem(k));
    // и старые гостевые
    for (let i=0;i<localStorage.length;i++){
      const key = localStorage.key(i);
      if (key && key.startsWith("guest:tc:")) localStorage.removeItem(key);
    }
  }
  function normalize(input) {
    if (!input) return NaN;
    let s = String(input).trim().replace(",", ".").replace(/[^\d.]/g, "");
    const dot = s.indexOf(".");
    if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : NaN;
  }
  function toNanoStr(amountStr) {
    const s = String(amountStr).trim().replace(",", ".");
    const [i="0", f=""] = s.split(".");
    const frac9 = (f + "000000000").slice(0,9);
    return (BigInt(i||"0")*1_000_000_000n + BigInt(frac9)).toString();
  }

  function openSheet(){ sheet?.classList.add("sheet--open"); }
  function closeSheet(){ sheet?.classList.remove("sheet--open"); }

  tonPill?.addEventListener("click", openSheet);
  backdrop?.addEventListener("click", closeSheet);
  btnClose?.addEventListener("click", closeSheet);

  amountInput?.addEventListener("input", ()=>{
    const caret = amountInput.selectionStart;
    amountInput.value = amountInput.value
      .replace(",", ".").replace(/[^0-9.]/g,"").replace(/^(\d*\.\d*).*$/, "$1");
    try { amountInput.setSelectionRange(caret, caret); } catch {}
    renderUI();
  });

  // ====== TonConnect UI ======
  cleanupOldTonConnectKeys();
  if (!window.TON_CONNECT_UI) {
    console.error("[deposit] TonConnect UI not loaded");
    return;
  }

  const storage = makeScopedStorage(`${tgUserId}:tc`);
  const tc = new TON_CONNECT_UI.TonConnectUI({
    manifestUrl: MANIFEST_URL,            // <-- с cache-busting, чтобы логотип появился
    uiPreferences: { theme: "SYSTEM" },
    storage,
    restoreConnection: true
  });

  // отдадим другим модулям (profile.js)
  window.__wtTonConnect = tc;
  window.dispatchEvent(new Event("wt-tc-ready"));

  // Следим за изменением статуса
  tc.onStatusChange((_w) => renderUI());

  // Перехват модалки: при открытии — наш шит уводим ниже, при закрытии — возвращаем
  async function openWalletModal() {
    try {
      sheet?.classList.add("sheet--below");
      document.documentElement.classList.add("tc-modal-open");
      await tc.openModal(); // кошелёк рисует собственную модалку
    } catch (e) {
      console.warn("[deposit] openModal error", e);
    } finally {
      setTimeout(()=>{
        sheet?.classList.remove("sheet--below");
        document.documentElement.classList.remove("tc-modal-open");
      }, 350);
    }
  }

  btnConnect?.addEventListener("click", openWalletModal);

  // ====== Deposit click ======
  btnDeposit?.addEventListener("click", async ()=>{
    const val = normalize(amountInput?.value);
    if (!tc.account) {
      await openWalletModal();
      return;
    }
    if (!(val >= MIN_DEPOSIT)) {
      alert(`Minimum deposit is ${MIN_DEPOSIT} TON`);
      return;
    }
    if (!PROJECT_TON_ADDRESS || /_{5,}/.test(PROJECT_TON_ADDRESS)) {
      alert("Project TON address is not configured");
      return;
    }

    const tx = {
      validUntil: Math.floor(Date.now()/1000) + 600,
      messages: [{ address: PROJECT_TON_ADDRESS, amount: toNanoStr(val) }]
    };

    const old = btnDeposit.textContent;
    btnDeposit.disabled = true;
    btnDeposit.textContent = "Opening wallet…";
    try {
      await tc.sendTransaction(tx);
      btnDeposit.textContent = "Waiting…";

      // Параллельно уведомим бэкенд (он отправит push в Telegram)
      fetch("/deposit",{
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ amount: val, initData })
      }).catch(()=>{});

      setTimeout(()=>{
        btnDeposit.textContent = old || "Deposit Now";
        btnDeposit.disabled = false;
        closeSheet();
      }, 1200);
    } catch (e) {
      console.warn("[deposit] sendTransaction error", e);
      btnDeposit.textContent = old || "Deposit Now";
      btnDeposit.disabled = false;
    }
  });

  // ====== UI состояния ======
  function renderUI(){
    const connected = !!tc.account;
    // показываем или скрываем Connect
    if (btnConnect) btnConnect.style.display = connected ? "none" : "";
    // доступность Deposit
    const val = normalize(amountInput?.value);
    btnDeposit && (btnDeposit.disabled = !(connected && val >= MIN_DEPOSIT));
  }

  // стартовый рендер
  renderUI();
})();
