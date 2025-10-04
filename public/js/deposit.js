// public/js/deposit.js
(() => {
  const MIN_DEPOSIT = 0.5;
  const MANIFEST_URL = `${location.origin}/tonconnect-manifest.json?v=${Date.now()}`;
  const INIT_DATA = window.Telegram?.WebApp?.initData || "";

  // DOM
  const tonPill   = document.getElementById("tonPill");
  const sheet     = document.getElementById("depositSheet");
  const backdrop  = sheet?.querySelector(".sheet__backdrop");
  const closeBtn  = sheet?.querySelector(".sheet__close");
  const amountI   = document.getElementById("depAmount");
  const hintEl    = document.getElementById("depHint");
  const connectB  = document.getElementById("btnConnectTon");
  const depositB  = document.getElementById("btnDepositNow");
  const actions   = sheet?.querySelector(".dep-actions");

  let RECEIVER_TON = "";       // подхватим с бэка
  let tc = null;               // TonConnectUI instance
  let wallet = null;           // текущее подключение

  const lg = (...a) => console.log("[deposit]", ...a);

  // --- UI helpers ---
  const openSheet  = () => sheet?.classList.add("sheet--open");
  const closeSheet = () => sheet?.classList.remove("sheet--open");
  const isConnected = () => !!wallet;

  const toast = (m) => {
    try {
      if (window.Telegram?.WebApp?.showPopup) {
        window.Telegram.WebApp.showPopup({ title: "Wild Time", message: m, buttons: [{ type: "close" }] });
      } else alert(m);
    } catch { alert(m); }
  };

  function normalize() {
    if (!amountI) return;
    amountI.value = (amountI.value || "")
      .replace(/[^\d.,]/g, "")
      .replace(",", ".");
  }
  function parseAmount() { normalize(); return Number(amountI?.value || ""); }

  function setConnectedUI() {
    if (!actions || !connectB || !depositB) return;
    if (isConnected()) {
      connectB.style.display = "none";
      depositB.style.display = "flex";
      actions.classList.add("single"); // центр одной кнопки
      hintEl && (hintEl.textContent = "Enter amount and confirm in your wallet");
    } else {
      connectB.style.display = "flex";
      depositB.style.display = "none";
      depositB.disabled = true;
      actions.classList.remove("single");
      hintEl && (hintEl.textContent = "Connect wallet and enter at least 0.5 TON");
    }
  }

  function validateAmount() {
    const v = parseAmount();
    const ok = Number.isFinite(v) && v >= MIN_DEPOSIT;
    if (depositB) depositB.disabled = !(isConnected() && ok);
  }

  // --- events: открыть/закрыть шит + ввод суммы ---
  tonPill?.addEventListener("click", () => { lg("TON pill clicked → open sheet"); openSheet(); });
  backdrop?.addEventListener("click", closeSheet);
  closeBtn?.addEventListener("click", closeSheet);
  amountI?.addEventListener("input", validateAmount);

  // --- подтянуть адрес приёмника с бэка ---
  async function loadReceiver() {
    try {
      const r = await fetch("/config", { cache: "no-store" });
      if (!r.ok) throw new Error(`GET /config status ${r.status}`);
      const j = await r.json();
      RECEIVER_TON = j?.receiverTon || "";
      lg("Receiver TON:", RECEIVER_TON || "(empty)");
    } catch (e) {
      console.error("[deposit] /config error:", e);
      RECEIVER_TON = "";
    }
  }

  // --- инициализация TonConnect UI ---
  async function initTonConnect() {
    if (!window.TON_CONNECT_UI?.TonConnectUI) {
      console.error("[deposit] TonConnect UI library NOT loaded. Check CDN in <head>.");
      connectB?.setAttribute("disabled", "disabled");
      depositB?.setAttribute("disabled", "disabled");
      return;
    }
    lg("Init TonConnectUI with manifest:", MANIFEST_URL);

    // Проверим, что манифест доступен (важно для Telegram/кошелька)
    try {
      const head = await fetch(MANIFEST_URL.replace(/\?v=.*/,""), { method: "GET", cache: "no-store" });
      if (!head.ok) throw new Error(`Manifest status ${head.status}`);
      const ctype = head.headers.get("content-type") || "";
      if (!ctype.includes("application/json")) {
        console.warn("[deposit] Manifest content-type is not JSON:", ctype);
      }
    } catch (e) {
      console.error("[deposit] Manifest fetch failed:", e);
      // Не блокируем — попробуем всё равно (на случай кэширования)
    }

    tc = new window.TON_CONNECT_UI.TonConnectUI({
      manifestUrl: MANIFEST_URL
    });

    // обработчик: открыть селектор кошелька
    connectB?.addEventListener("click", async () => {
      lg("Connect clicked → tc.openModal()");
      try {
        // Важно: без await-цепочек перед openModal, чтобы сохранить user gesture
        await tc.openModal();
        lg("openModal resolved");
      } catch (e) {
        console.error("[deposit] openModal error:", e);
        toast("Unable to open wallet chooser. Try again.");
      }
    });

    // отправка транзакции
    depositB?.addEventListener("click", async () => {
      if (!isConnected()) return toast("Please connect your TON wallet first.");
      const amt = parseAmount();
      if (!Number.isFinite(amt) || amt < MIN_DEPOSIT) return toast(`Minimum deposit is ${MIN_DEPOSIT} TON`);
      if (!RECEIVER_TON) return toast("Receiver TON address is not set.");

      try {
        const nanotons = Math.round(amt * 1e9).toString();
        lg("sendTransaction →", { to: RECEIVER_TON, nanotons });

        await tc.sendTransaction({
          validUntil: Math.floor(Date.now()/1000) + 300,
          messages: [{ address: RECEIVER_TON, amount: nanotons }]
        });

        // уведомить бота/бэк (опционально)
        try {
          await fetch("/deposit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount: amt, initData: INIT_DATA })
          });
        } catch (e) {
          console.warn("[deposit] notify /deposit failed:", e);
        }

        amountI.value = ""; validateAmount(); closeSheet();
        toast(`✅ Sent ${amt} TON`);
      } catch (err) {
        console.error("[deposit] sendTransaction error:", err);
        toast("❌ Transaction cancelled or failed");
      }
    });

    // трекаем состояние подключения
    tc.onStatusChange((w) => {
      wallet = w || null;
      lg("statusChange →", wallet ? "connected" : "disconnected", wallet?.account?.address);
      setConnectedUI();
      validateAmount();
    });
  }

  // --- init ---
  (async function init() {
    // на всякий — поднимем модалку TonConnect над шитом
    try {
      const style = document.createElement("style");
      style.textContent = `
        body > div[id*="ton-connect"] { z-index: 20001 !important; }
        .ton-connect-modal { z-index: 20001 !important; }
        .sheet { z-index: 20000 !important; }
      `;
      document.head.appendChild(style);
    } catch {}

    await loadReceiver();
    await initTonConnect();

    setConnectedUI();
    validateAmount();

    sheet?.addEventListener("transitionend", (ev) => {
      if (ev.propertyName === "transform" && sheet.classList.contains("sheet--open")) {
        amountI?.focus();
      }
    });

    // Отладка в консоль/из консоли
    window.__deposit = {
      open: openSheet,
      close: closeSheet,
      tcInfo: () => ({
        tcExists: !!tc,
        walletConnected: isConnected(),
        receiver: RECEIVER_TON
      })
    };

    lg("Initialized");
  })();
})();
