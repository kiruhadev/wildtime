// public/js/deposit.js
const RECEIVER_TON = "UQCtVhhBFPBvCoT8H7szNQUhEvHgbvnX50r8v6d8y5wdr19J"; // твой адрес

(() => {
  /* ================================
   *  SELECTORS (под твой HTML/CSS)
   * ================================ */
  const sheetSel      = ".sheet";
  const backdropSel   = ".sheet__backdrop";
  const panelSel      = ".sheet__panel";
  const openBtnsSel   = "[data-open-deposit]";     // повесь атрибут на пилюлю TON
  const closeBtnSel   = ".sheet__close";
  const amountInputSel= "#depAmount";              // <input id="depAmount">
  const actionsSel    = ".dep-actions";            // контейнер двух кнопок
  const connectBtnSel = ".btn--ghost";             // левая "Connect wallet"
  const depositBtnSel = ".btn--primary";           // правая "Deposit Now"
  const connectIconSel= ".btn--ghost .btn__icons"; // иконка в connect (если есть)

  const MIN_DEPOSIT = 0.5;

  /* ================================
   *  TonConnect UI
   * ================================ */
  const MANIFEST_URL =
    "https://wildtime-1.onrender.com/tonconnect-manifest.json?v=" + Date.now();

  // через CDN: window.TON_CONNECT_UI доступен глобально
  const tc = new TON_CONNECT_UI.TonConnectUI({ manifestUrl: MANIFEST_URL });

  // удобный геттер статуса
  const isConnected = () => !!tc.account;

  /* ================================
   *  DOM refs
   * ================================ */
  const sheet   = document.querySelector(sheetSel);
  const backdrop= sheet?.querySelector(backdropSel);
  const panel   = sheet?.querySelector(panelSel);
  const openBtns= document.querySelectorAll(openBtnsSel);
  const closeBtn= sheet?.querySelector(closeBtnSel);
  const amountI = sheet?.querySelector(amountInputSel);
  const actions = sheet?.querySelector(actionsSel);
  const connectB= sheet?.querySelector(connectBtnSel);
  const depositB= sheet?.querySelector(depositBtnSel);

  /* ================================
   *  Sheet helpers
   * ================================ */
  const openSheet = () => {
    if (!sheet) return;
    sheet.classList.add("sheet--open");
    // небольшой хак: если TonConnect модалка поверх – пусть будет ещё выше
    document.documentElement.style.setProperty("--tc-z", "2001");
  };

  const closeSheet = () => {
    if (!sheet) return;
    sheet.classList.remove("sheet--open");
  };

  /* ================================
   *  UI state when wallet connected
   * ================================ */
  function applyConnectedUI(connected) {
    if (!actions || !depositB) return;

    if (connected) {
      // прячем Connect
      if (connectB) connectB.style.display = "none";

      // центрируем Deposit Now и даём ему ширину
      actions.classList.add("single"); // в CSS .dep-actions.single {justify-content:center;}
      depositB.disabled = false;
      depositB.style.flex = "unset";
      depositB.style.width = "100%";
      depositB.style.maxWidth = "320px";
      depositB.style.justifyContent = "center";
    } else {
      // возвращаем изначальный вид
      if (connectB) connectB.style.display = "";
      actions.classList.remove("single");
      depositB.disabled = true;
      depositB.style.flex = "";
      depositB.style.width = "";
      depositB.style.maxWidth = "";
      depositB.style.justifyContent = "";
    }
  }

  /* ================================
   *  Init state
   * ================================ */
  // по умолчанию депозит выключен до подключения
  if (depositB) depositB.disabled = !isConnected();
  // применим начальный UI
  applyConnectedUI(isConnected());

  /* ================================
   *  Listeners
   * ================================ */
  // Открытие/закрытие шита
  openBtns.forEach(btn => btn.addEventListener("click", openSheet));
  closeBtn?.addEventListener("click", closeSheet);
  backdrop?.addEventListener("click", closeSheet);

  // Кнопка "Connect wallet"
  connectB?.addEventListener("click", async () => {
    try {
      await tc.openModal(); // покажет нативную TonConnect модалку
      // дальнейшее состояние придёт в onStatusChange
    } catch (e) {
      console.error("TonConnect openModal error:", e);
    }
  });

  // Реакция на изменение состояния подключения
  tc.onStatusChange(wallet => {
    const connected = !!wallet;
    applyConnectedUI(connected);
  });

  // Кнопка "Deposit Now"
  depositB?.addEventListener("click", async () => {
    if (!isConnected()) {
      // на всякий случай – вдруг пользователь отключил кошелёк
      return alert("Please connect your TON wallet first.");
    }

    const amtRaw = (amountI?.value || "").trim().replace(",", ".");
    const amount = Number(amtRaw);
    if (!Number.isFinite(amount) || amount < MIN_DEPOSIT) {
      return alert(`Minimum deposit is ${MIN_DEPOSIT} TON`);
    }

    // initData из Telegram WebApp
    const initData = (window.Telegram && window.Telegram.WebApp)
      ? window.Telegram.WebApp.initData
      : "";

    try {
      // POST на бэкенд
      const res = await fetch("/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, initData })
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Deposit failed");
      }

      // UX: очистим поле и закроем шит
      if (amountI) amountI.value = "";
      closeSheet();

      alert(`✅ Deposit request sent: ${amount} TON`);
    } catch (e) {
      console.error(e);
      alert("❌ Deposit failed. Try again later.");
    }
  });

  /* ================================
   *  Small QoL helpers (optional)
   * ================================ */
  // автофокус на инпут при открытии
  sheet?.addEventListener("transitionend", (ev) => {
    if (ev.propertyName === "transform" && sheet.classList.contains("sheet--open")) {
      amountI?.focus();
    }
  });

  // запретим ввод всего, кроме цифр/точки/запятой
  amountI?.addEventListener("input", () => {
    amountI.value = amountI.value.replace(/[^\d.,]/g, "");
  });

  // debug в консоли при необходимости
  window.__deposit = {
    open: openSheet,
    close: closeSheet,
    tc
  };
 //ОТКРЫВАЛКА
  document.getElementById('tonPill')?.addEventListener('click', openSheet);

})();
