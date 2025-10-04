// НЕ модуль. Работает с TonConnect UI из window.TON_CONNECT_UI

(() => {
  // 1) Настройки
  const MANIFEST_URL = 'https://wildtime-1.onrender.com/tonconnect-manifest.json?v=' + Date.now();
  const RECEIVER_TON = 'UQCtVhhBFPBvCoT8H7szNQUhEvHgbvnX50r8v6d8y5wdr19J'; // ← твой адрес проекта (EQ/UQ)

  const MIN_DEPOSIT = 0.5;

  // 2) DOM
  const tonPill   = document.getElementById('tonPill');         // кнопка-«пилюля» в топбаре
  const sheet     = document.getElementById('depositSheet') || document.querySelector('.sheet');
  const backdrop  = sheet?.querySelector('.sheet__backdrop');
  const panel     = sheet?.querySelector('.sheet__panel');
  const closeBtn  = sheet?.querySelector('.sheet__close');

  const amountI   = document.getElementById('depAmount');
  const connectB  = document.getElementById('connectTonBtn');
  const depositB  = document.getElementById('depositNowBtn');
  const actions   = sheet?.querySelector('.dep-actions');

  // 3) TonConnect UI init
  if (!window.TON_CONNECT_UI?.TonConnectUI) {
    console.error('TonConnect UI script not found. Include @tonconnect/ui CDN in <head>.');
    return;
  }
  const tc = new TON_CONNECT_UI.TonConnectUI({ manifestUrl: MANIFEST_URL });

  let wallet = null; // текущее состояние кошелька

  // 4) UI helpers
  const openSheet = () => sheet?.classList.add('sheet--open');
  const closeSheet = () => sheet?.classList.remove('sheet--open');

  function isConnected() {
    return !!wallet; // TonConnect UI отдаёт объект кошелька, если подключён
  }

  function applyConnectedUI() {
    if (!connectB || !depositB || !actions) return;
    if (isConnected()) {
      // скрыть Connect, оставить Deposit в центре
      connectB.style.display = 'none';
      depositB.style.display = 'flex';
      depositB.disabled = false;
      actions.classList.add('single'); // в CSS центрируй .dep-actions.single
    } else {
      connectB.style.display = 'flex';
      depositB.style.display = 'none';
      depositB.disabled = true;
      actions.classList.remove('single');
    }
  }

  function validateAmount() {
    if (!depositB || !amountI) return;
    const v = Number((amountI.value || '').replace(',', '.'));
    const ok = Number.isFinite(v) && v >= MIN_DEPOSIT;
    // если подключён и сумма валидна — активируем
    depositB.disabled = !(isConnected() && ok);
  }

  // 5) Навешиваем слушатели
  tonPill?.addEventListener('click', openSheet);
  backdrop?.addEventListener('click', closeSheet);
  closeBtn?.addEventListener('click', closeSheet);

  amountI?.addEventListener('input', () => {
    amountI.value = amountI.value.replace(/[^\d.,]/g, '');
    validateAmount();
  });

  connectB?.addEventListener('click', async () => {
    try {
      await tc.openModal(); // откроет модалку выбора кошелька
      // после успешного коннекта сработает onStatusChange
    } catch (e) {
      console.error('TonConnect openModal error', e);
    }
  });

  depositB?.addEventListener('click', async () => {
    if (!isConnected()) {
      return alert('Please connect your TON wallet first.');
    }
    const amt = Number((amountI?.value || '').replace(',', '.'));
    if (!Number.isFinite(amt) || amt < MIN_DEPOSIT) {
      return alert(`Minimum deposit is ${MIN_DEPOSIT} TON`);
    }
    if (!RECEIVER_TON) {
      return alert('Receiver TON address is not set');
    }

    try {
      // 1) TonConnect: перевод из кошелька пользователя на адрес проекта
      const nanotons = Math.round(amt * 1e9).toString();
      await tc.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [{ address: RECEIVER_TON, amount: nanotons }]
      });

      // 2) уведомление бэкенда/бота (initData из Telegram)
      const initData = window.Telegram?.WebApp?.initData || '';
      await fetch('/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt, initData })
      });

      amountI.value = '';
      validateAmount();
      closeSheet();
      alert(`✅ Sent ${amt} TON`);
    } catch (err) {
      console.error(err);
      alert('❌ Transaction cancelled or failed');
    }
  });

  // 6) Подписка на изменения статуса TonConnect
  tc.onStatusChange((w) => {
    wallet = w || null;
    applyConnectedUI();
    validateAmount();
  });

  // 7) Стартовое состояние
  applyConnectedUI();
  validateAmount();

  // экспорт для отладки в консоли
  window.__deposit = { open: openSheet, close: closeSheet, tc };
})();
