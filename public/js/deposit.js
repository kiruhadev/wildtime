/* public/js/deposit.js — Wild Time (MIN 0.1 TON)
   - Персист кошелька по пользователю TG (custom storage + restoreConnection:true)
   - Модалка TonConnect всегда поверх (sheet--below во время openModal)
   - Кнопка Deposit активна только при подключённом кошельке и сумме ≥ 0.1
*/

const MIN_DEPOSIT_TON = 0.1;
const MANIFEST_URL    = `${location.origin}/tonconnect-manifest.json?v=${Date.now()}`;
const RECEIVER_TON    = "RECEIVER_TON=UQCtVhhBFPBvCoT8H7szNQUhEvHgbvnX50r8v6d8y5wdr19J"; // ← адрес проекта (EQ...);

// === DOM
const sheet       = document.getElementById("depositSheet");
const backdrop    = sheet?.querySelector(".sheet__backdrop");
const closeBtn    = sheet?.querySelector(".sheet__close");
const actionsWrap = sheet?.querySelector(".dep-actions");

const amountInput = document.getElementById("depAmount");
const hintEl      = document.getElementById("depHint");
const connectBtn  = document.getElementById("btnConnectTon");
const depositBtn  = document.getElementById("btnDepositNow");

const tonPill     = document.getElementById("tonPill");

// === Персист по пользователю Telegram
const tg = window.Telegram?.WebApp;
const tgUserId = tg?.initDataUnsafe?.user?.id ?? "guest";
const storagePrefix = `wt_${tgUserId}_`;
const storage = {
  async getItem(key)    { try { return localStorage.getItem(storagePrefix + key); } catch { return null; } },
  async setItem(key,v)  { try { localStorage.setItem(storagePrefix + key, v); } catch {} },
  async removeItem(key) { try { localStorage.removeItem(storagePrefix + key); } catch {} },
};

// === TonConnect UI (restoreConnection: true + наш storage)
const tc = new TON_CONNECT_UI.TonConnectUI({
  manifestUrl: MANIFEST_URL,
  uiPreferences: { theme: "SYSTEM" },
  storage,
  restoreConnection: true
});

// Дать доступ профилю + событие "готов"
// (обёртка нужна, чтобы линтер не ругался на window в не-браузере)
if (typeof window !== "undefined") {
  window.__wtTonConnect = tc;
  window.dispatchEvent(new Event("wt-tc-ready"));
}


let wallet = null;

// === Utils
function normalizeAmount(str) {
  if (!str) return NaN;
  let s = str.replace(",", ".").replace(/[^\d.]/g, "");
  const i = s.indexOf(".");
  if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}
function toNano(num) { return BigInt(Math.round(num * 1e9)).toString(); }
function isAmountOk() {
  const n = normalizeAmount(amountInput?.value || "");
  return Number.isFinite(n) && n >= MIN_DEPOSIT_TON;
}

// === UI state
function renderUI() {
  const connected = !!wallet;
  if (connectBtn) connectBtn.style.display = connected ? "none" : "";
  if (actionsWrap) actionsWrap.classList.toggle("single", connected);
  if (depositBtn) depositBtn.disabled = !(connected && isAmountOk());
  if (hintEl) hintEl.textContent = connected
    ? "Enter amount and confirm in your wallet"
    : "Connect your TON wallet first";
}

// === Sheet open/close
function openSheet() {
  amountInput?.setAttribute("placeholder", String(MIN_DEPOSIT_TON));
  sheet?.classList.add("sheet--open");
  renderUI();
}
function closeSheet() { sheet?.classList.remove("sheet--open"); }

// === Events: open/close
tonPill?.addEventListener("click", openSheet);
backdrop?.addEventListener("click", closeSheet);
closeBtn?.addEventListener("click", closeSheet);

// === Amount input
amountInput?.addEventListener("input", () => {
  const caret = amountInput.selectionStart;
  amountInput.value = amountInput.value.replace(",", ".").replace(/[^\d.]/g, "");
  const i = amountInput.value.indexOf(".");
  if (i !== -1) {
    amountInput.value =
      amountInput.value.slice(0, i + 1) + amountInput.value.slice(i + 1).replace(/\./g, "");
  }
  try { amountInput.setSelectionRange(caret, caret); } catch {}
  renderUI();
});

// === Connect wallet
connectBtn?.addEventListener("click", async () => {
  try {
    sheet?.classList.add("sheet--below");     // TonConnect модалка поверх
    await tc.openModal();
  } catch (err) {
    console.error("[deposit] openModal error:", err);
  } finally {
    setTimeout(() => sheet?.classList.remove("sheet--below"), 300);
  }
});

// === Send deposit
depositBtn?.addEventListener("click", async () => {
  const amt = normalizeAmount(amountInput.value);

  if (!wallet) {
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
    amountInput.value = "";
    // при желании: закрыть шит / обновить пилюлю
    // setTimeout(() => closeSheet(), 600);
    // const tonLabel = document.getElementById("tonAmount");
    // if (tonLabel) tonLabel.textContent = (parseFloat(tonLabel.textContent||"0")+amt).toFixed(2);
  } catch (err) {
    console.error("[deposit] sendTransaction error:", err);
    hintEl.textContent = "❌ Transaction canceled or failed";
  } finally {
    renderUI();
    depositBtn.disabled = false;
  }
});

// === TonConnect статус
tc.onStatusChange((w) => {
  wallet = w || null;
  renderUI();
  sheet?.classList.remove("sheet--below");
});

// === Восстановление соединения при загрузке (для ЭТОГО пользователя)
(async () => {
  try { await tc.connectionRestored; } catch {}
  wallet = tc.wallet || null;
  renderUI();
})();

// === На случай возврата из внешнего кошелька
window.addEventListener("focus", () => {
  setTimeout(() => sheet?.classList.remove("sheet--below"), 300);
  renderUI();
});
