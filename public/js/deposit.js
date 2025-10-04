// public/js/deposit.js
// Работает через CDN: window.TON_CONNECT_UI.TonConnectUI
(() => {
  // ====== НАСТРОЙКИ ======
  const MIN_DEPOSIT = 0.5;
  const RECEIVER_TON = "UQ_______________________________"; // <-- ВСТАВЬ СВОЙ TON-АДРЕС (EQ/UQ)
  const MANIFEST_URL = window.location.origin + "/tonconnect-manifest.json?v=" + Date.now();

  // ====== DOM ======
  const tonPill  = document.getElementById("tonPill");
  const sheet    = document.getElementById("depositSheet") || document.querySelector(".sheet");
  const backdrop = sheet?.querySelector(".sheet__backdrop");
  const closeBtn = sheet?.querySelector(".sheet__close");
  const amountI  = document.getElementById("depAmount");
  const connectB = document.getElementById("connectTonBtn");
  const depositB = document.getElementById("depositNowBtn");
  const actions  = sheet?.querySelector(".dep-actions");

  const INIT_DATA = window.Telegram?.WebApp?.initData || "";

  // ====== HELPERS ======
  const openSheet  = () => sheet?.classList.add("sheet--open");
  const closeSheet = () => sheet?.classList.remove("sheet--open");
  const toast = (msg) => {
    try {
      window.Telegram?.WebApp?.showPopup
        ? window.Telegram.WebApp.showPopup({ title: "Wild Time", message: msg, buttons: [{ type: "close" }] })
        : alert(msg);
    } catch { alert(msg); }
  };

  // нормализуем ввод (разрешаем цифры, точку и запятую; ',' -> '.')
  function parseAmount() {
    if (!amountI) return NaN;
    const cleaned = (amountI.value || "").replace(/[^\d.,]/g, "").replace(",", ".");
    amountI.value = cleaned;
    return Number(cleaned);
  }

  // ====== ПРОВЕРКА TON CONNECT UI ======
  if (!window.TON_CONNECT_UI?.TonConnectUI) {
    console.error("TonConnect UI is not loaded. Add CDN script in <head>.");
    // чтобы не путать пользователя — отключим кнопки
    connectB?.setAttribute("disabled", "disabled");
    depositB?.setAttribute("disabled", "disabled");
    return;
  }

  const tc = new window.TON_CONNECT_UI.TonConnectUI({ manifestUrl: MANIFEST_URL });
  let wallet = null;
  const isConnected = () => !!wallet;

  function applyConnectedUI() {
    if (!connectB || !depositB || !actions) return;
    if (isConnected()) {
      // скрываем connect, показываем deposit, центрируем
      connectB.style.display = "none";
      depositB.style.display = "flex";
      actions.classList.add("single");
      // активируем депозит, если сумма валидна
      const ok = Number.isFinite(parseAmount()) && parseAmount() >= MIN_DEPOSIT;
      depositB.disabled = !ok;
    } else {
      connectB.style.display = "flex";
      depositB.style.display = "none";
      depositB.disabled = true;
      actions.classList.remove("single");
    }
  }

  function validateAmount() {
    if (!depositB) return;
    const v = parseAmount();
    const ok = Number.isFinite(v) && v >= MIN_DEPOSIT;
    depositB.disabled = !(isConnected() && ok);
  }

  // ====== LISTENERS UI ======
  tonPill?.addEventListener("click", () => {
    openSheet();
  });
  backdrop?.addEventListener("click", closeSheet);
  closeBtn?.addEventListener("click", closeSheet);

  amountI?.addEventListener("input", () => {
    amountI.value = (amountI.value || "").replace(/[^\d.,]/g, "");
    validateAmount();
  });

  // Подключение кошелька
  connectB?.addEventListener("click", async () => {
    try {
      await tc.openModal(); // выбор кошелька
    } catch (e) {
      console.error("TonConnect openModal error:", e);
      toast("Unable to open wallet chooser. Try again.");
    }
  });

  // Отправка депозита
  depositB?.addEventListener("click", async () => {
    if (!isConnected()) {
      toast("Please connect your TON wallet first.");
      return;
    }
    const amt = parseAmount();
    if (!Number.isFinite(amt) || amt < MIN_DEPOSIT) {
      toast(`Minimum deposit is ${MIN_DEPOSIT} TON`);
      return;
    }
    if (!RECEIVER_TON) {
      toast("Receiver TON address is not set.");
      return;
    }

    try {
      // 1) Транзакция через TonConnect
      const nanotons = Math.round(amt * 1e9).toString();
      await tc.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [{ address: RECEIVER_TON, amount: nanotons }]
      });

      // 2) Уведомляем бэк/бота (не обязательно для самой транзакции)
      try {
        await fetch("/deposit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: amt, initData: INIT_DATA })
        });
      } catch (e) {
        console.warn("Deposit notify failed:", e);
      }

      amountI.value = "";
      validateAmount();
      closeSheet();
      toast(`✅ Sent ${amt} TON`);
    } catch (err) {
      console.error("sendTransaction error:", err);
      toast("❌ Transaction cancelled or failed");
    }
  });

  // Слежение за статусом TonConnect
  tc.onStatusChange((w) => {
    wallet = w || null;
    applyConnectedUI();
    validateAmount();
  });

  // ====== START ======
  applyConnectedUI();
  validateAmount();

  // autofocus в инпут после открытия
  sheet?.addEventListener("transitionend", (ev) => {
    if (ev.propertyName === "transform" && sheet.classList.contains("sheet--open")) {
      amountI?.focus();
    }
  });

  // для отладки из консоли
  window.__deposit = { open: openSheet, close: closeSheet, tc };
})();
