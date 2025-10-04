// public/js/profile.js
(() => {
    // ====== DOM ======
    const userPill       = document.getElementById("userPill");
    const userAvatar     = document.getElementById("userAvatar");
    const userNameEl     = document.getElementById("userName");
  
    const profileAvatar  = document.getElementById("profileAvatar");
    const profileName    = document.getElementById("profileName");
    const profileHandle  = document.getElementById("profileHandle");
  
    const profileWallet  = document.getElementById("profileWallet");
    const walletReveal   = document.getElementById("walletReveal");
    const disconnectBtn  = document.getElementById("profileDisconnect");
  
    const FALLBACK_AVA   = "/images/avatar-default.png";
  
    // ====== Telegram user ======
    const tg   = window.Telegram?.WebApp;
    const user = tg?.initDataUnsafe?.user || null;
  
    function fullName(u) {
      if (!u) return "Guest";
      const first = u.first_name || "";
      const last  = u.last_name  || "";
      const name  = `${first} ${last}`.trim();
      return name || (u.username ? `@${u.username}` : "User");
    }
    function atHandle(u) {
      return u?.username ? `@${u.username}` : "—";
    }
  
    function setText(el, text) {
      if (!el) return;
      if (el.textContent !== text) el.textContent = text;
    }
    function setImgOnce(img, src) {
      if (!img) return;
      const want = src || FALLBACK_AVA;
      // избегаем перелисовки, если уже выставлено
      if (img.dataset.src === want) return;
      img.dataset.src = want;
      img.src = want;
      img.onerror = () => { if (img.src !== FALLBACK_AVA) img.src = FALLBACK_AVA; };
    }
  
    // Инициализируем шапку и профиль ОДИН РАЗ
    try {
      setText(userNameEl, fullName(user));
      setText(profileName, fullName(user));
      setText(profileHandle, atHandle(user));
  
      const photo = user?.photo_url || FALLBACK_AVA;
      setImgOnce(userAvatar, photo);
      setImgOnce(profileAvatar, photo);
    } catch {}
  
    // ====== Навигация: открыть Profile по клику на левую пилюлю ======
    function openProfilePage() {
      // показываем страницу профиля
      document.querySelectorAll(".page").forEach(p => p.classList.remove("page-active"));
      document.getElementById("profilePage")?.classList.add("page-active");
  
      // подсветка таба
      document.querySelectorAll(".bottom-nav .nav-item").forEach(i => i.classList.remove("active"));
      const profileTab = document.querySelector('.bottom-nav .nav-item[data-target="profilePage"]');
      if (profileTab) profileTab.classList.add("active");
  
      // скролл к началу без анимации
      window.scrollTo(0, 0);
    }
    userPill?.addEventListener("click", openProfilePage, { passive: true });
  
    // ====== TonConnect (ждём из deposit.js) ======
    function getTC() {
      return window.__wtTonConnect || null;
    }
    function waitForTC() {
      if (getTC()) return Promise.resolve(getTC());
      return new Promise(resolve => {
        window.addEventListener("wt-tc-ready", () => resolve(getTC()), { once: true });
      });
    }
  
    // ====== Wallet UI с анти-миганием ======
    let lastAddr = "";       // запоминаем, чтобы не перерисовывать зря
    let tcBound  = false;    // подписка на onStatusChange только один раз
  
    function truncate(addr) {
      if (!addr) return "Not connected";
      return addr.length > 16 ? `${addr.slice(0,8)}…${addr.slice(-6)}` : addr;
    }
  
    function updateWalletUI(addr) {
      if (!profileWallet || !walletReveal) return;
  
      // если адрес не изменился — ничего не делаем (анти-мигание)
      if (addr === lastAddr) return;
      lastAddr = addr;
  
      profileWallet.dataset.full     = addr || "";
      profileWallet.dataset.expanded = "0";
      profileWallet.textContent      = addr ? truncate(addr) : "Not connected";
  
      walletReveal.textContent = addr ? "Show" : "—";
      walletReveal.disabled    = !addr;
    }
  
    // Toggle Show/Hide — локально, без триггера других обновлений
    walletReveal?.addEventListener("click", () => {
      if (!profileWallet) return;
      const full = profileWallet.dataset.full || "";
      if (!full) return;
  
      const expanded = profileWallet.dataset.expanded === "1";
      if (expanded) {
        profileWallet.textContent      = truncate(full);
        profileWallet.dataset.expanded = "0";
        walletReveal.textContent       = "Show";
      } else {
        profileWallet.textContent      = full;
        profileWallet.dataset.expanded = "1";
        walletReveal.textContent       = "Hide";
      }
    });
  
    // Disconnect
    disconnectBtn?.addEventListener("click", async () => {
      try {
        const tc = getTC();
        await tc?.disconnect?.();
      } catch (e) {
        console.warn("[profile] disconnect error:", e);
      } finally {
        updateWalletUI(""); // явно очистим
      }
    });
  
    // Инициализация: дождаться TonConnect → подписаться один раз
    (async () => {
      const tc = await waitForTC();
      // первичное состояние
      const initAddr = tc?.wallet?.account?.address || "";
      updateWalletUI(initAddr);
  
      if (!tcBound && tc?.onStatusChange) {
        tcBound = true;
        tc.onStatusChange((w) => {
          const addr = w?.account?.address || "";
          updateWalletUI(addr);
        });
      }
    })();
  
    // На случай возврата из внешнего кошелька — разово обновим и всё
    window.addEventListener("focus", () => {
      const tc = getTC();
      const addr = tc?.wallet?.account?.address || "";
      updateWalletUI(addr);
    }, { passive: true });
  })();
  