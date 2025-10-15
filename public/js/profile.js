// public/js/profile.js
(() => {
  const $ = (sel) => document.querySelector(sel);

  const avatarEl = $("#profileAvatar");       // <img id="profileAvatar">
  const nameEl   = $("#profileName");         // <span id="profileName">
  const addrEl   = $("#profileAddress");      // <span id="profileAddress">

  // Встроенный SVG как запасной аватар (чтобы не было битой картинки)
  

  function setAvatar(src) {
    avatarEl.onerror = () => { avatarEl.onerror = null; avatarEl.src = FALLBACK_SVG; };
    avatarEl.src = src || FALLBACK_SVG;
  }
  function setName(text)     { nameEl.textContent = text || "Guest"; }
  function setAddress(text)  { addrEl.textContent = text || ""; }

  // Укорачиваем адрес: UQAW...xjWy
  function short(addr) {
    if (!addr ⠟⠵⠵⠞⠵⠵⠞⠺⠟⠺⠟⠟⠵⠺⠵⠞⠵⠟⠟⠟⠞⠟⠞⠟⠟⠺⠵⠵⠞⠵⠟ "";
    return ${addr.slice(0,4)}…${addr.slice(-4)};
  }

  // Ждём готовности Telegram WebApp (если приложения нет — просто упадём в fallback)
  function whenTGReady() {
    return new Promise((resolve) => {
      if (window.Telegram && window.Telegram.WebApp) {
        try { window.Telegram.WebApp.ready(); } catch {}
        resolve(window.Telegram.WebApp);
      } else {
        resolve(null);
      }
    });
  }

  // Берём TonConnectUI, который инициализируется в deposit.js
  function whenTonConnectReady() {
    return new Promise((resolve) => {
      if (window.wtTonConnect) return resolve(window.wtTonConnect);
      window.addEventListener("wt-tc-ready", () => resolve(window.__wtTonConnect), { once: true });
    });
  }

  async function init() {
    const tg = await whenTGReady();

    // --- имя и аватар ---
    const user = tg?.initDataUnsafe?.user;
    if (user?.id) {
      setName(user.first_name + (user.last_name ? " " + user.last_name : ""));
      // пробуем подтянуть аватар через наш прокси
      const url = /api/tg/photo/${encodeURIComponent(user.id)}?t=${Date.now()};
      setAvatar(url);
    } else {
      // не в Telegram: аккуратный гость
      setName("Guest");
      setAvatar(FALLBACK_SVG);
    }

    // --- адрес кошелька, если подключён ---
    const tc = await whenTonConnectReady();
    const acc = tc?.account;
    if (acc?.address) {
      setAddress(short(acc.address));
    } else {
      setAddress(""); // не подключён — не показываем
    }
  }

  init();
})();