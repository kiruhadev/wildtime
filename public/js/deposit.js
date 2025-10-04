// public/js/deposit.js
// Требуется: <script src="https://telegram.org/js/telegram-web-app.js"></script>
// Требуется: TonConnect UI (например, <script src="https://unpkg.com/@tonconnect/ui@latest/dist/tonconnect-ui.min.js"></script>)
// Вёрстка: см. ids #depositSheet, #btnConnectTon, #btnDeposit, #depAmount, #depHint и кнопка .pill в топбаре

(function () {
  const tg = window.Telegram?.WebApp;

  // --- узлы
  const sheet      = document.getElementById('depositSheet');
  const openBtn    = document.querySelector('.pill--ton');       // кнопка-пилюля TON в шапке
  const closeNodes = sheet ? sheet.querySelectorAll('[data-close="sheet"]') : [];
  const amountEl   = document.getElementById('depAmount');
  const hintEl     = document.getElementById('depHint');
  const btnConnect = document.getElementById('btnConnectTon');
  const btnDep     = document.getElementById('btnDeposit');

  if (!sheet || !amountEl || !btnConnect || !btnDep) {
    console.warn('[deposit] Missing required DOM nodes');
    return;
  }

  // --- состояние
  let tonUI = null;
  let isConnected = false;

  // --- helpers
  const getUserId = () => tg?.initDataUnsafe?.user?.id || null;
  const nano = (amtTon) => BigInt(Math.round(amtTon * 1e9));
  const minDeposit = 0.5;

  function haptic(type) {
    try { tg?.HapticFeedback?.notificationOccurred(type); } catch (_) {}
  }

  function openSheet() {
    sheet.classList.add('sheet--open');
    try { tg?.HapticFeedback?.impactOccurred('light'); } catch (_) {}
    setTimeout(() => amountEl.focus(), 160);
  }
  function closeSheet() {
    sheet.classList.remove('sheet--open');
  }

  function setHint(text) {
    if (hintEl) hintEl.textContent = text || '';
  }

  function validate() {
    const v = parseFloat(amountEl.value);
    const ok = isConnected && Number.isFinite(v) && v >= minDeposit;
    btnDep.disabled = !ok;
    setHint(isConnected ? `Minimum ${minDeposit} TON` : 'Connect your TON wallet first');
  }

  // --- init TonConnect UI
  function ensureTonUI() {
    if (!tonUI && window.TON_CONNECT_UI) {
      tonUI = new TON_CONNECT_UI.TonConnectUI({
        manifestUrl: 'https://wildtime-1.onrender.com/tonconnect-manifest.json?v='
      });
    }
    return tonUI;
  }

  // --- events: open/close
  openBtn?.addEventListener('click', openSheet);
  closeNodes.forEach(n => n.addEventListener('click', closeSheet));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

  // --- connect wallet
  btnConnect.addEventListener('click', async () => {
    try {
      ensureTonUI();
      if (!tonUI) {
        alert('TonConnect UI not loaded');
        return;
      }
      await tonUI.openModal(); // выбор кошелька
      isConnected = !!tonUI.account;
      if (isConnected) {
        const t = btnConnect.querySelector('.btn__text');
        if (t) t.textContent = 'Wallet connected ✓';
        haptic('success');
      }
      validate();
    } catch (err) {
      console.warn('[deposit] connect cancelled', err);
      haptic('error');
    }
  });

  amountEl.addEventListener('input', validate);

  // --- main action: deposit
  btnDep.addEventListener('click', async () => {
    const amt = parseFloat(amountEl.value);
    if (!isConnected)  return alert('Connect wallet first');
    if (!Number.isFinite(amt) || amt < minDeposit) return alert(`Minimum ${minDeposit} TON`);

    // ЗАМЕНИ на свой адрес получателя (кошелёк/контракт проекта)
    const recipient = 'UQCtVhhBFPBvCoT8H7szNQUhEvHgbvnX50r8v6d8y5wdr19J'; // TODO

    // Ton transaction
    const tx = {
      validUntil: Math.floor(Date.now() / 1000) + 300,
      messages: [{ address: recipient, amount: nano(amt).toString() }]
    };

    try {
      await tonUI.sendTransaction(tx);

      // локальный UX
      haptic('success');
      try { tg?.showAlert?.('Deposit successful!'); } catch (_) {}

      // уведомление в чат бота конкретному пользователю
      const userId = getUserId();
      if (userId) {
        await fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            message: `✅ Deposit successful: ${amt} TON`
          })
        }).catch(() => {});
      }

      // (опционально) сообщим бэкенду о депозите для логов/БД
      // если используете валидацию initData на сервере — можно передавать initData вместо userId
      await fetch('/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt, userId })
      }).catch(() => {});

      closeSheet();
      amountEl.value = '';
      validate();
    } catch (err) {
      console.warn('[deposit] transaction declined', err);
      haptic('error');
      try { tg?.showAlert?.('Deposit cancelled'); } catch (_) {}
    }
  });

  // первичная валидация
  validate();
})();
