/* public/js/deposit.js
   Wild Time — Deposit (MIN 0.1 TON)
   Фикс: restoreConnection:false — всегда требуем явное подключение кошелька
*/

/* === CONFIG === */
const MIN_DEPOSIT_TON = 0.1;
const MANIFEST_URL    = `${location.origin}/tonconnect-manifest.json?v=${Date.now()}`;
const RECEIVER_TON    = "PASTE_YOUR_TON_ADDRESS_HERE"; // ← поставь адрес проекта (EQ...)

/* === DOM === */
const sheet       = document.getElementById("depositSheet");
const backdrop    = sheet?.querySelector(".sheet__backdrop");
const closeBtn    = sheet?.querySelector(".sheet__close");
const actionsWrap = sheet?.querySelector(".dep-actions");

const amountInput = document.getElementById("depAmount");
const hintEl      = document.getElementById("depHint");
const connectBtn  = document.getElementById("btnConnectTon");
const depositBtn  = document.getElementById("btnDepositNow");

const tonPill     = document.getElementById("tonPill");

/* === TonConnect UI (без авто-восстановления!) === */
const tc = new TON_CONNECT_UI.TonConnectUI({
  manifestUrl: MANIFEST_URL,
  uiPreferences: { theme: "SYSTEM" },
  restoreConnection: false    // <— ключевая строка
});

let wallet = null;

/* === Utils === */
function normalizeAmount(str) {
  if (!str) return NaN;
  let s = str.replace(",", ".").replace(/[^\d.]/g, "");
  const firstDot = s.indexOf(".");
  if (firstDot !== -1) s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}
function toNano(num) { return BigInt(Math.round(num * 1e9)).toString(); }
function isAmountOk() {
  const n = normalizeAmount(amountInput?.value || "");
  return Number.isFinite(n) && n >= MIN_DEPOSIT_TON;
}

/* === UI state === */
function renderUI() {
  const connected = !!wallet;
  if (connectBtn) connectBtn.style.display = connected ? "none" : "";   // показываем коннект только до подключения
  if (actionsWrap) actionsWrap.classList.toggle("single", connected);   // одна кнопка по центру, если подключены
  depositBtn.disabled = !(connected && isAmountOk());
  hintEl.textContent = connected
    ? "Enter amount and confirm in your wallet"
    : "Connect your TON wallet first";
}

/* === Sheet open/close === */
function openSheet() {
  if (!sheet) return;
  amountInput?.setAttribute("placeholder", String(MIN_DEPOSIT_TON));
  sheet.classList.add("sheet--open");
  renderUI();
}
function closeSheet() { sheet?.classList.remove("sheet--open"); }

/* === Events: open/close === */
tonPill?.addEventListener("click", openSheet);
backdrop?.addEventListener("click", closeSheet);
closeBtn?.addEventListener("click", closeSheet);

/* === Amount input handling === */
amountInput?.addEventListener("input", () => {
  const caret = amountInput.selectionStart;
  amountInput.value = amountInput.value.replace(",", ".").replace(/[^\d.]/g, "");
  const firstDot = amountInput.value.indexOf(".");
  if (firstDot !== -1) {
    amountInput.value =
      amountInput.value.slice(0, firstDot + 1) +
      amountInput.value.slice(firstDot + 1).replace(/\./g, "");
  }
  try { amountInput.setSelectionRange(caret, caret); } catch {}
  renderUI();
});

/* === Connect wallet === */
connectBtn?.addEventListener("click", async () => {
  try {
    // чтобы TonConnect модалка была поверх — временно опустим наш sheet
    sheet?.classList.add("sheet--below");
    await tc.openModal();
  } catch (err) {
    console.error("[deposit] openModal error:", err);
  } finally {
    setTimeout(() => sheet?.classList.remove("sheet--below"), 300);
  }
});

/* === Send deposit === */
depositBtn?.addEventListener("click", async () => {
  const amt = normalizeAmount(amountInput.value);

  if (!wallet) {
    // Если вдруг не подключены — сначала открываем модалку
    try { await tc.openModal(); } catch {}
    return;
  }

  if (!(amt >= MIN_DEPOSIT_TON)) {
    hintEl.textContent = `Minimum deposit is ${MIN_DEPOSIT_TON} TON`;
    renderUI();
    return;
  }

  try {
    depositBtn.disabled = true;

    await tc.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 60,
      messages: [{ address: RECEIVER_TON, amount: toNano(amt) }]
    });

    hintEl.textContent = "✅ Request sent. Confirm in your wallet";
    // (опционально) закрыть шит и обновить пилюлю TON на экране:
    // setTimeout(() => closeSheet(), 600);
    // const tonLabel = document.getElementById("tonAmount");
    // if (tonLabel) tonLabel.textContent = (parseFloat(tonLabel.textContent||"0")+amt).toFixed(2);

    amountInput.value = "";
  } catch (err) {
    console.error("[deposit] sendTransaction error:", err);
    hintEl.textContent = "❌ Transaction canceled or failed";
  } finally {
    renderUI();
    depositBtn.disabled = false;
  }
});

/* === TonConnect status === */
tc.onStatusChange((w) => {
  wallet = w || null;
  renderUI();
  sheet?.classList.remove("sheet--below");
});

/* На случай возврата из внешнего кошелька */
window.addEventListener("focus", () => {
  setTimeout(() => sheet?.classList.remove("sheet--below"), 300);
  renderUI();
});

/* init UI */
renderUI();
