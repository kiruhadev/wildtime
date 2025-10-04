/* public/js/deposit.js — Wild Time (final)
   - Персональный storage по Telegram userId (у каждого свой кошелёк)
   - ОДИН инстанс TonConnect UI, экспорт в window.__wtTonConnect + событие wt-tc-ready
   - MIN_DEPOSIT_TON = 0.1, нормализация ввода (точка/запятая)
   - Модалка TonConnect всегда выше: добавляем sheet--below на openModal()
*/

(() => {
  // ======= Константы проекта =======
  const MIN_DEPOSIT_TON = 0.1;
  // ВСТАВЬ СЮДА адрес своего проекта (EQ... или UQ...) — получатель депозита:
  const RECEIVER_TON = "RECEIVER_TON=UQCtVhhBFPBvCoT8H7szNQUhEvHgbvnX50r8v6d8y5wdr19J";

  // manifest лучше отдавать с твоего домена; cache-bust, чтобы не залипало в CDN
  const MANIFEST_URL = `${location.origin}/tonconnect-manifest.json?v=${Date.now()}`;

  // ======= Ждём Telegram userId (до 3 секунд) =======
  function waitForTelegramUserId(timeoutMs = 3000) {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        const id = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
        if (id) return resolve(String(id));
        if (Date.now() - start > timeoutMs) return resolve("guest");
        setTimeout(tick, 50);
      };
      try { window.Telegram?.WebApp?.ready?.(); } catch {}
      tick();
    });
  }

  // ======= user-scoped storage =======
  function makeUserScopedStorage(userId) {
    const prefix = `wt:${userId}:tc:`;
    return {
      getItem: (k) => {
        try { return localStorage.getItem(prefix + k); } catch { return null; }
      },
      setItem: (k, v) => {
        try { localStorage.setItem(prefix + k, v); } catch {}
      },
      removeItem: (k) => {
        try { localStorage.removeItem(prefix + k); } catch {}
      }
    };
  }

  // Убираем старые «гостевые» ключи (если до фикса уже коннектились без userId)
  function cleanupGuestKeys() {
    const toDrop = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith("wt:guest:tc:")) toDrop.push(key);
    }
    toDrop.forEach((k) => localStorage.removeItem(k));
  }

  // ======= DOM =======
  const sheet       = document.getElementById("depositSheet");
  const backdrop    = sheet?.querySelector(".sheet__backdrop");
  const closeBtn    = sheet?.querySelector(".sheet__close");
  const actionsWrap = sheet?.querySelector(".dep-actions");

  const amountInput = document.getElementById("depAmount");
  const hintEl      = document.getElementById("depHint");
  const connectBtn  = document.getElementById("btnConnectTon");
  const depositBtn  = document.getElementById("btnDepositNow");

  const tonPill     = document.getElementById("tonPill"); // твоя «пилюля» TON наверху

  // ======= Helpers =======
  function normalizeAmount(str) {
    if (!str) return NaN;
    let s = String(str).replace(",", ".").replace(/[^\d.]/g, "");
    const i = s.indexOf(".");
    if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, "");
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : NaN;
  }
  const toNano = (num) => BigInt(Math.round(num * 1e9)).toString();

  // ======= Инициализация TonConnect UI =======
  let tc = null;
  let wallet = null;

  async function initTonConnect() {
    const userId = await waitForTelegramUserId();
    cleanupGuestKeys();
    const storage = makeUserScopedStorage(userId);

    // библиотека TonConnect UI должна быть подключена в index.html до этого файла
    tc = new TON_CONNECT_UI.TonConnectUI({
      manifestUrl: MANIFEST_URL,
      uiPreferences: { theme: "SYSTEM" },
      storage,
      restoreConnection: true
    });

    // экспорт для других модулей (profile.js и т.д.)
    if (typeof window !== "undefined") {
      window.__wtTonConnect = tc;
      window.dispatchEvent(new Event("wt-tc-ready"));
    }

    // восстановление соединения (для ЭТОГО userId)
    try { await tc.connectionRestored; } catch {}
    wallet = tc.wallet || null;

    // реагируем на изменения статуса ровно один раз
    if (!tc.__wtDepositBound) {
      tc.__wtDepositBound = true;
      tc.onStatusChange((w) => {
        wallet = w || null;
        renderUI();
        // вдруг модалка осталась «под» шитом — поднимем
        sheet?.classList.remove("sheet--below");
      });
    }
  }

  // ======= UI =======
  function isAmountOk() {
    const n = normalizeAmount(amountInput?.value || "");
    return Number.isFinite(n) && n >= MIN_DEPOSIT_TON;
  }

  function renderUI() {
    const connected = !!wallet;
    if (connectBtn)  connectBtn.style.display = connected ? "none" : "";
    if (actionsWrap) actionsWrap.classList.toggle("single", connected);
    if (depositBtn)  depositBtn.disabled = !(connected && isAmountOk());

    if (hintEl) {
      hintEl.textContent = connected
        ? "Enter amount and confirm in your wallet"
        : "Connect your TON wallet first";
    }
  }

  function openSheet() {
    amountInput?.setAttribute("placeholder", String(MIN_DEPOSIT_TON));
    sheet?.classList.add("sheet--open");
    renderUI();
  }
  function closeSheet() {
    sheet?.classList.remove("sheet--open");
  }

  // ======= Слушатели =======
  tonPill?.addEventListener("click", openSheet);
  backdrop?.addEventListener("click", closeSheet);
  closeBtn?.addEventListener("click", closeSheet);

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

  connectBtn?.addEventListener("click", async () => {
    try {
      sheet?.classList.add("sheet--below");  // модалка TonConnect поверх
      await tc.openModal();
    } catch (e) {
      console.warn("[deposit] openModal error:", e);
    } finally {
      setTimeout(() => sheet?.classList.remove("sheet--below"), 300);
    }
  });

  depositBtn?.addEventListener("click", async () => {
    const amt = normalizeAmount(amountInput?.value || "");
    if (!wallet) {
      // нет кошелька — открываем модалку подключения
      try { await tc.openModal(); } catch {}
      return;
    }
    if (!(amt >= MIN_DEPOSIT_TON)) {
      if (hintEl) hintEl.textContent = `Minimum deposit is ${MIN_DEPOSIT_TON} TON`;
      renderUI();
      return;
    }
    if (!RECEIVER_TON || RECEIVER_TON.includes("YOUR_PROJECT_ADDRESS")) {
      if (hintEl) hintEl.textContent = "Receiver address is not set";
      return;
    }

    try {
      depositBtn.disabled = true;

      await tc.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 60,
        messages: [{ address: RECEIVER_TON, amount: toNano(amt) }]
      });

      if (hintEl) hintEl.textContent = "✅ Request sent. Confirm in your wallet";
      if (amountInput) amountInput.value = "";
      // setTimeout(() => closeSheet(), 700); // если хочешь автозакрытие
    } catch (err) {
      console.error("[deposit] sendTransaction error:", err);
      if (hintEl) hintEl.textContent = "❌ Transaction canceled or failed";
    } finally {
      depositBtn.disabled = false;
      renderUI();
    }
  });

  // при возврате из внешнего кошелька
  window.addEventListener("focus", () => {
    setTimeout(() => sheet?.classList.remove("sheet--below"), 300);
    renderUI();
  });

  // ======= GO =======
  initTonConnect().then(renderUI);
})();
