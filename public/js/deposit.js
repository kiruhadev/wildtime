// public/js/deposit.js
// НЕ module. Работает с TonConnect UI из CDN: window.TON_CONNECT_UI.TonConnectUI
(() => {
  /* =========================
   *  ГЛОБАЛЬНЫЕ НАСТРОЙКИ
   * ========================= */
  const MIN_DEPOSIT = 0.5;

  // 1) Если хочешь захардкодить адрес проекта — заполни здесь и не трогай /config
  let RECEIVER_TON = "UQCtVhhBFPBvCoT8H7szNQUhEvHgbvnX50r8v6d8y5wdr19J"; // ← ВСТАВЬ СВОЙ АДРЕС (EQ/UQ)

  // 2) Если хочешь хранить адрес на сервере (.env → /config) — оставь строку пустой:
  // let RECEIVER_TON = ""; // и сервер вернёт /config { receiverTon: "..." }

  // URL манифеста (с кэш-бастером)
  const MANIFEST_URL =
    window.location.origin + "/tonconnect-manifest.json?v=" + Date.now();

  /* =========================
   *  ДОСТАЁМ DOM
   * ========================= */
  const tonPill   = document.getElementById("tonPill");
  const sheet     = document.getElementById("depositSheet") || document.querySelector(".sheet");
  const backdrop  = sheet?.querySelector(".sheet__backdrop");
  const panel     = sheet?.querySelector(".sheet__panel");
  const closeBtn  = sheet?.querySelector(".sheet__close");

  const amountI   = document.getElementById("depAmount");
  const connectB  = document.getElementById("connectTonBtn");
  const depositB  = document.getElementById("depositNowBtn");
  const actions   = sheet?.querySelector(".dep-actions");

  // Телеграм initData (если запущено в вебвью)
  const INIT_DATA = window.Telegram?.WebApp?.initData || "";

  /* =========================
   *  ПОЛЕЗНЫЕ ХЕЛПЕРЫ
   * ========================= */
  const openSheet  = () => sheet?.classList.add("sheet--open");
  const closeSheet = () => sheet?.classList.remove("sheet--open");

  function toast(msg) {
    // Мягкое уведомление через Telegram API если есть, иначе alert
    try {
      if (window.Telegram?.WebApp?.showPopup) {
        window.Telegram.WebApp.showPopup({ title: "Wild Time", message: msg, buttons: [{ type: "close" }] });
      } else {
        alert(msg);
      }
    } catch {
      alert(msg);
    }
  }

  // Нормализация суммы: допускаем цифры, . и ,
  function parseAmount() {
    if (!amountI) return NaN;
    const cleaned = (amountI.value || "").replace(/[^\d.,]/g, "").replace(",", ".");
    amountI.value = cleaned;
    return Number(cleaned);
  }

  /* =========================
   *  ПРОВЕРКА НАЛИЧИЯ TON CONNECT UI
   * ========================= */
  if (!window.TON_CONNECT_UI?.TonConnectUI) {
    console.error(
      "TonConnect UI script not found. Add <script src='https://unpkg.com/@tonconnect/ui@latest/dist/tonconnect-ui.min.js'></script> in <head>."
    );
    // Не ломаем страницу — просто отключаем депозит-флоу
    connectB?.setAttribute("disabled", "disabled");
    depositB?.setAttribute("disabled", "disabled");
    return;
  }

  // Инициализация TonConnect UI
  const tc = new TON_CONNECT_UI.TonConnectUI({ manifestUrl: MANIFEST_URL });
  let wallet = null;

  const isConnected = () => !!wallet;

  function applyConnectedUI() {
    if (!connectB || !depositB || !actions) return;
    if (isConnected()) {
      // скрываем CONNECT, показываем DEPOSIT и центрируем его
      connectB.style.display = "none";
      depositB.style.display = "flex";
      actions.classList.add("single"); // в CSS .dep-actions.single { justify-content:center; }
      // валидируем по сумме
      const amtOk = Number.isFinite(parseAmount()) && parseAmount() >= MIN_DEPOSIT;
      depositB.disabled = !amtOk;
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
    // Депозит активен только если подключен кошелёк и сумма валидна
    depositB.disabled = !(isConnected() && ok);
  }

  /* =========================
   *  АДРЕС ПРОЕКТА ИЗ /config (если не зашит)
   * ========================= */
  async function ensureReceiverAddress() {
    if (RECEIVER_TON && RECEIVER_TON.trim().length > 0) return;
    try {
      const r = await fetch("/config", { cache: "no-store" });
      if (!r.ok) return;
      const cfg = await r.json();
      if (cfg?.receiverTon) {
        RECEIVER_TON = cfg.receiverTon;
      }
    } catch (e) {
      console.warn("Cannot fetch /config:", e);
    }
  }

  /* =========================
   *  LISTENERS UI
   * ========================= */
  tonPill?.addEventListener("click", openSheet);
  backdrop?.addEventListener("click", closeSheet);
  closeBtn?.addEventListener("click", closeSheet);

  amountI?.addEventListener("input", () => {
    // позволяем вводить только цифры и разделители
    amountI.value = (amountI.value || "").replace(/[^\d.,]/g, "");
    validateAmount();
  });

  // CONNECT WALLET
  connectB?.addEventListener("click", async () => {
    try {
      await tc.openModal(); // покажет модалку выбора кошелька
      // дальнейшее состояние придёт в onStatusChange
    } catch (e) {
      console.error("TonConnect openModal error:", e);
      toast("Unable to open wallet chooser. Try again.");
    }
  });

  // DEPOSIT NOW
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
    await ensureReceiverAddress();
    if (!RECEIVER_TON) {
      toast("Receiver TON address is not set.");
      return;
    }

    try {
      // 1) перевод через TonConnect
      const nanotons = Math.round(amt * 1e9).toString();
      await tc.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [{ address: RECEIVER_TON, amount: nanotons }]
      });

      // 2) уведомить бэкенд/бота (чтобы зафиксировать депозит)
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
      // Часто это просто отмена пользователем
      toast("❌ Transaction cancelled or failed");
    }
  });

  /* =========================
   *  TonConnect СТАТУС
   * ========================= */
  tc.onStatusChange((w) => {
    wallet = w || null;
    // Можно логнуть адрес при успехе:
    // if (wallet?.account?.address) console.log("Wallet:", wallet.account.address);
    applyConnectedUI();
    validateAmount();
  });

  /* =========================
   *  СТАРТ
   * ========================= */
  (async function start() {
    // на всякий случай подгружаем адрес получателя с бэка, если не задан локально
    await ensureReceiverAddress();
    applyConnectedUI();
    validateAmount();

    // автофокус в инпут при открытии листа
    sheet?.addEventListener("transitionend", (ev) => {
      if (ev.propertyName === "transform" && sheet.classList.contains("sheet--open")) {
        amountI?.focus();
      }
    });
  })();

  // для отладки в консоли
  window.__deposit = {
    open: openSheet,
    close: closeSheet,
    isConnected,
    tc
  };
})();
