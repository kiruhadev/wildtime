// public/js/deposit.js
(() => {
  // ================== CONFIG ==================
  const MANIFEST_URL = "/tonconnect-manifest.json";
  const PROJECT_TON_ADDRESS = "UQCtVhhBFPBvCoT8H7szNQUhEvHgbvnX50r8v6d8y5wdr19J"; // <-- поставь адрес проекта
  const MIN_DEPOSIT = 0.1; // поменяй на 0.1 для теста при желании

  // id элементов твоего UI
  const IDS = {
    sheet: "depositSheet",
    amount: "depAmount",
    btnConnect: "btnConnectWallet",
    btnDeposit: "btnDepositNow",
    tonPill: "tonPill",
    close: "depClose" // необязателен; если есть — повесим обработчик
  };

  // ================== HELPERS ==================
  const $ = (sel) => document.querySelector(sel);
  const byId = (id) => document.getElementById(id);
  const fmt = (n) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 9 });

  // число в нанотоны (строкой, без ошибок float)
  function toNanoStr(amountStr) {
    const s = String(amountStr).trim().replace(",", ".");
    const [i = "0", f = ""] = s.split(".");
    const frac9 = (f + "000000000").slice(0, 9);
    const bi = BigInt(i || "0") * 1_000_000_000n + BigInt(frac9);
    return bi.toString();
  }

  function getInitData() {
    // исходная строка initData — её сервер валидирует
    return window.Telegram?.WebApp?.initData || "";
  }

  function getTgUserId() {
    return window.Telegram?.WebApp?.initDataUnsafe?.user?.id || "guest";
  }

  // user-scoped storage: ключи TonConnect будут уникальны на каждого TG-пользователя
  function makeScopedStorage(prefix) {
    return {
      getItem: (k) => localStorage.getItem(`${prefix}:${k}`),
      setItem: (k, v) => localStorage.setItem(`${prefix}:${k}`, v),
      removeItem: (k) => localStorage.removeItem(`${prefix}:${k}`)
    };
  }

  // подчистим возможные старые глобальные ключи TonConnect (если ранее без scoping)
  function cleanupOldKeys() {
    const bad = ["ton-connect-ui", "ton-connect-storage_bridge_v2"];
    bad.forEach((k) => localStorage.removeItem(k));
  }

  // ================== GRAB UI ==================
  const sheet = byId(IDS.sheet);
  const amountInput = byId(IDS.amount);
  const btnConnect = byId(IDS.btnConnect);
  const btnDeposit = byId(IDS.btnDeposit);
  const tonPill = byId(IDS.tonPill);
  const btnClose = byId(IDS.close);

  if (!sheet || !amountInput || !btnConnect || !btnDeposit || !tonPill) {
    console.warn("[deposit] Missing required DOM nodes. Check IDs:", IDS);
  }

  function openSheet() {
    sheet?.classList.add("sheet--open");
  }
  function closeSheet() {
    sheet?.classList.remove("sheet--open");
  }

  // backdrop клик — закрыть
  sheet?.addEventListener("click", (e) => {
    if (e.target.classList.contains("sheet__backdrop")) closeSheet();
  });
  btnClose?.addEventListener("click", closeSheet);
  tonPill?.addEventListener("click", openSheet);

  // ================== INIT TONCONNECT ==================
  cleanupOldKeys();
  const scoped = makeScopedStorage(`${getTgUserId()}:tc`);

  // проверим наличие TonConnect UI в window
  if (!window.TON_CONNECT_UI) {
    console.error("[deposit] TON_CONNECT_UI is not loaded. Include TonConnect UI script before deposit.js");
    return;
  }

  const tc = new TON_CONNECT_UI.TonConnectUI({
    manifestUrl: MANIFEST_URL,
    uiPreferences: { theme: "SYSTEM" },
    storage: scoped,
    restoreConnection: true
  });

  // отдадим другим модулям
  window.__wtTonConnect = tc;
  window.dispatchEvent(new Event("wt-tc-ready"));

  // ================== UI STATE ==================
  function isConnected() {
    return !!tc.account;
  }

  function setConnectVisible(visible) {
    // если не хочешь показывать кнопку после подключения — просто скрываем
    if (visible) {
      btnConnect.removeAttribute("disabled");
      btnConnect.classList.remove("is-hidden");
    } else {
      btnConnect.setAttribute("disabled", "true");
      btnConnect.classList.add("is-hidden");
    }
  }

  function updateButtons() {
    // нормализуем ввод: заменим запятую на точку
    const valStr = (amountInput.value || "").replace(",", ".").trim();
    const val = Number(valStr);

    // подсказка по плейсхолдеру
    if (!amountInput.placeholder) amountInput.placeholder = String(MIN_DEPOSIT);

    // доступность кнопок
    const amountOk = Number.isFinite(val) && val >= MIN_DEPOSIT;
    btnDeposit.disabled = !(amountOk && isConnected());

    // connect видим/прячем
    setConnectVisible(!isConnected());
  }

  // фильтр ввода: только цифры, одна точка
  amountInput?.addEventListener("input", () => {
    amountInput.value = amountInput.value
      .replace(",", ".")
      .replace(/[^0-9.]/g, "")
      .replace(/^(\d*\.\d*).*$/, "$1"); // одной точки достаточно
    updateButtons();
  });

  // ================== HANDLERS ==================
  btnConnect?.addEventListener("click", async () => {
    try {
      await tc.openModal(); // TonConnect UI нарисует своё модальное окно
    } catch (e) {
      console.warn("[deposit] openModal error:", e);
    }
  });

  btnDeposit?.addEventListener("click", async () => {
    try {
      const valStr = (amountInput.value || "").replace(",", ".").trim();
      const amount = Number(valStr);
      if (!Number.isFinite(amount) || amount < MIN_DEPOSIT) {
        alert(`Minimum deposit is ${MIN_DEPOSIT} TON`);
        return;
      }

      if (!isConnected()) {
        await tc.openModal();
        return;
      }

      // 1) Отправляем транзакцию в кошелёк через TonConnect
      const tx = {
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [
          {
            address: PROJECT_TON_ADDRESS,
            amount: toNanoStr(valStr) // строка в нанотонах
          }
        ]
      };

      btnDeposit.disabled = true;
      const oldText = btnDeposit.textContent;
      btnDeposit.textContent = "Opening wallet…";

      // В большинстве кошельков это откроет подтверждение
      await tc.sendTransaction(tx);

      btnDeposit.textContent = "Waiting…";

      // 2) Сообщаем на бэк — он отправит нотификацию в Telegram
      const initData = getInitData();
      fetch("/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, initData })
      }).catch(() => { /* тихо */ });

      // Немного UX: вернём текст и закроем шит через пару секунд
      setTimeout(() => {
        btnDeposit.textContent = oldText || "Deposit Now";
        btnDeposit.disabled = false;
        closeSheet();
      }, 1200);
    } catch (e) {
      console.warn("[deposit] deposit error:", e);
      btnDeposit.disabled = false;
      btnDeposit.textContent = "Deposit Now";
    }
  });

  // Изменение статуса TonConnect — обновим UI
  tc.onStatusChange(() => {
    updateButtons();
  });

  // Инициализация состояния при загрузке
  updateButtons();

  // Опционально: авто-фокус в поле суммы при открытии шита
  sheet?.addEventListener("transitionend", (e) => {
    if (sheet.classList.contains("sheet--open")) {
      setTimeout(() => amountInput?.focus(), 50);
    }
  });
})();
