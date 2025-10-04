/* public/js/deposit.js */

/* 1) Константы */
const MANIFEST_URL = `${location.origin}/tonconnect-manifest.json?v=${Date.now()}`;
const RECEIVER_TON = "PASTE_YOUR_TON_ADDRESS_HERE"; // <— вставь адрес проекта (EQ...)

/* 2) DOM */
const sheet          = document.getElementById("depositSheet");
const backdrop       = sheet?.querySelector(".sheet__backdrop");
const closeBtn       = sheet?.querySelector(".sheet__close");
const amountInput    = document.getElementById("depAmount");
const connectBtn     = document.getElementById("btnConnectTon");
const depositBtn     = document.getElementById("btnDepositNow");
const hintEl         = document.getElementById("depHint");
const actionsWrap    = sheet?.querySelector(".dep-actions");
const tonPill        = document.getElementById("tonPill");

/* 3) TonConnect UI */
const tc = new TON_CONNECT_UI.TonConnectUI({
  manifestUrl: MANIFEST_URL,
  uiPreferences: { theme: "SYSTEM" },
});
let wallet = null;

/* 4) Утилиты */
function normalizeAmount(str) {
  if (!str) return NaN;
  const v = str.replace(",", ".").replace(/[^\d.]/g, "");
  return parseFloat(v);
}
function isAmountOk() {
  const n = normalizeAmount(amountInput?.value || "");
  return Number.isFinite(n) && n >= 0.5;
}
function toNano(num) {
  // безопасно округляем до нанотонов
  return BigInt(Math.round(num * 1e9)).toString();
}

/* 5) UI обновление */
function renderUI() {
  const connected = !!wallet;

  if (connectBtn) connectBtn.style.display = connected ? "none" : "";
  if (actionsWrap) actionsWrap.classList.toggle("single", connected);

  depositBtn.disabled = !(connected && isAmountOk());

  hintEl.textContent = connected
    ? "Enter amount and confirm in your wallet"
    : "Connect your TON wallet first";
}

/* 6) Открыть/закрыть шит */
function openSheet() {
  if (!sheet) return;
  sheet.classList.add("sheet--open");
  renderUI();
}
function closeSheet() {
  if (!sheet) return;
  sheet.classList.remove("sheet--open");
}

/* 7) События UI */
tonPill?.addEventListener("click", openSheet);
backdrop?.addEventListener("click", closeSheet);
closeBtn?.addEventListener("click", closeSheet);

amountInput?.addEventListener("input", () => {
  // позволяем и запятую, и точку; чистим лишнее
  const caret = amountInput.selectionStart;
  amountInput.value = amountInput.value.replace(",", ".").replace(/[^\d.]/g, "");
  // восстановим курсор, чтобы не «прыгало»
  try { amountInput.setSelectionRange(caret, caret); } catch {}
  renderUI();
});

/* 8) Подключение кошелька */
connectBtn?.addEventListener("click", async () => {
  try {
    // На время модалки опускаем наш шит ниже, чтобы TonConnect был сверху
    sheet?.classList.add("sheet--below");
    await tc.openModal();
  } catch (err) {
    console.error("[deposit] openModal error:", err);
  } finally {
    // Вернём слой, даже если модалку просто закрыли
    setTimeout(() => sheet?.classList.remove("sheet--below"), 300);
  }
});

/* 9) Отправка депозита */
depositBtn?.addEventListener("click", async () => {
  const amt = normalizeAmount(amountInput.value);
  if (!wallet) {
    // если внезапно не подключены — сначала открываем модалку
    await tc.openModal();
    return;
  }
  if (!(amt >= 0.5)) {
    hintEl.textContent = "Minimum deposit is 0.5 TON";
    return;
  }

  try {
    depositBtn.disabled = true;

    await tc.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 60,
      messages: [
        { address: RECEIVER_TON, amount: toNano(amt) }
      ],
    });

    hintEl.textContent = "✅ Request sent. Confirm in your wallet";
    amountInput.value = "";
    renderUI();
  } catch (err) {
    console.error("[deposit] sendTransaction error:", err);
    hintEl.textContent = "❌ Transaction canceled or failed";
  } finally {
    depositBtn.disabled = false;
  }
});

/* 10) Слежение за статусом кошелька */
tc.onStatusChange((w) => {
  wallet = w || null;
  renderUI();
  // если вернулись из кошелька/закрыли модалку — возвращаем слой
  sheet?.classList.remove("sheet--below");
});

/* 11) Попытаться восстановить сессию при загрузке */
(async () => {
  try {
    // ждём, пока TonConnect восстановит прошлую сессию (если была)
    await tc.connectionRestored;
  } catch {}
  wallet = tc.wallet || null;
  renderUI();
})();

/* 12) На случай возврата из стороннего кошелька */
window.addEventListener("focus", () => {
  setTimeout(() => sheet?.classList.remove("sheet--below"), 300);
  renderUI();
});
