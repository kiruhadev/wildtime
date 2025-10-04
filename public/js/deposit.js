/* public/js/deposit.js
   Wild Time — Deposit (MIN 0.1 TON)
   - TonConnect UI v2
   - connect-gate: Deposit доступен только после подключения
   - amount input: поддержка , и . ; минимум 0.1 TON
   - overlay fix: на время TonConnect модалки опускаем наш sheet
*/

/* === CONFIG === */
const MIN_DEPOSIT_TON = 0.1;                         // ← минимум на тест
const MANIFEST_URL    = `${location.origin}/tonconnect-manifest.json?v=${Date.now()}`;
const RECEIVER_TON    = "UQCtVhhBFPBvCoT8H7szNQUhEvHgbvnX50r8v6d8y5wdr19J"; // ← вставь адрес проекта (EQ...)

/* === DOM === */
const sheet       = document.getElementById("depositSheet");
const backdrop    = sheet?.querySelector(".sheet__backdrop");
const closeBtn    = sheet?.querySelector(".sheet__close");
const actionsWrap = sheet?.querySelector(".dep-actions");

const amountInput = document.getElementById("depAmount");
const hintEl      = document.getElementById("depHint");
const connectBtn  = document.getElementById("btnConnectTon");
const depositBtn  = document.getElementById("btnDepositNow");

const tonPill     = document.getElementById("tonPill"); // кнопка-пилюля в топбаре

/* === TonConnect UI === */
const tc = new TON_CONNECT_UI.TonConnectUI({
  manifestUrl: MANIFEST_URL,
  uiPreferences: { theme: "SYSTEM" },
});

let wallet = null;

/* === Utils === */
function normalizeAmount(str) {
  if (!str) return NaN;
  // заменяем запятую на точку и оставляем только цифры и единственную точку
  let s = str.replace(",", ".").replace(/[^\d.]/g, "");
  // если несколько точек — оставим только первую
  const firstDot = s.indexOf(".");
  if (firstDot !== -1) s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}
function toNano(num) {
  return BigInt(Math.round(num * 1e9)).toString();
}
function isAmountOk() {
  const n = normalizeAmount(amountInput?.value || "");
  return Number.isFinite(n) && n >= MIN_DEPOSIT_TON;
}

/* === UI state === */
function renderUI() {
  const connected = !!wallet;

  // показать/скрыть Connect; выровнять кнопки
  if (connectBtn) connectBtn.style.display = connected ? "none" : "";
  if (actionsWrap) actionsWrap.classList.toggle("single", connected);

  // кнопка депозита активна только если подключён кошелёк и сумма ок
  depositBtn.disabled = !(connected && isAmountOk());

  // подсказка
  hintEl.textContent = connected
    ? "Enter amount and confirm in your wallet"
    : "Connect your TON wallet first";
}

/* === Sheet open/close === */
function openSheet() {
  if (!sheet) return;
  // плейсхолдер под минимум (0.1)
  amountInput?.setAttribute("placeholder", String(MIN_DEPOSIT_TON));
  sheet.classList.add("sheet--open");
  renderUI();
}
function closeSheet() {
  sheet?.classList.remove("sheet--open");
}

/* === Events: open/close === */
tonPill?.addEventListener("click", openSheet);
backdrop?.addEventListener("click", closeSheet);
closeBtn?.addEventListener("click", closeSheet);

/* === Amount input handling === */
amountInput?.addEventListener("input", () => {
  const caret = amountInput.selectionStart;
  // мягкая чистка: запятая → точка; лишние символы убираем
  amountInput.value = amountInput.value.replace(",", ".").replace(/[^\d.]/g, "");
  // фикс двойных точек:
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
    // чтобы модалка TonConnect была поверх — опускаем наш sheet
    sheet?.classList.add("sheet--below");
    await tc.openModal();
  } catch (err) {
    console.error("[deposit] openModal error:", err);
  } finally {
    // вернём слой спустя миг (если просто закрыли модалку)
    setTimeout(() => sheet?.classList.remove("sheet--below"), 300);
  }
});

/* === Send deposit === */
depositBtn?.addEventListener("click", async () => {
  const amt = normalizeAmount(amountInput.value);

  if (!wallet) {
    // на всякий случай: если вдруг не подключены — открываем модалку
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
      messages: [{ address: RECEIVER_TON, amount: toNano(amt) }],
    });

    hintEl.textContent = "✅ Request sent. Confirm in your wallet";
    amountInput.value = "";
  } catch (err) {
    console.error("[deposit] sendTransaction error:", err);
    hintEl.textContent = "❌ Transaction canceled or failed";
  } finally {
    renderUI();
  }
});

/* === TonConnect status === */
tc.onStatusChange((w) => {
  wallet = w || null;
  renderUI();
  sheet?.classList.remove("sheet--below"); // если вернулись из модалки
});

/* Восстановление прошлой сессии при загрузке */
(async () => {
  try { await tc.connectionRestored; } catch {}
  wallet = tc.wallet || null;
  renderUI();
})();

/* На случай возврата из внешнего кошелька/модалки */
window.addEventListener("focus", () => {
  setTimeout(() => sheet?.classList.remove("sheet--below"), 300);
  renderUI();
});
