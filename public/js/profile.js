// public/js/profile.js
(() => {
    // ---------- helpers ----------
    const $ = (id) => document.getElementById(id);
  
    // DOM refs
    const userPill         = $("userPill");
    const userAvatar       = $("userAvatar");
    const userNameEl       = $("userName");
  
    const profileAvatar    = $("profileAvatar");
    const profileName      = $("profileName");
    const profileHandle    = $("profileHandle");
  
    const walletPill       = $("walletPill");
    const walletText       = $("profileWallet");
    const walletDetails    = $("walletDetails");
    const walletFull       = $("walletFull");
    const walletCopyBtn    = $("walletCopy");
    const disconnectBtn    = $("profileDisconnect");
  
    // Fallback-аватар как inline SVG (без сетевых запросов => нет 404/мигания)
    const FALLBACK_AVA = 'data:image/svg+xml;utf8,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#2b2f3a"/><stop offset="1" stop-color="#1b1f28"/>
        </linearGradient></defs>
        <rect width="64" height="64" rx="12" fill="url(#g)"/>
        <circle cx="32" cy="24" r="12" fill="#8ea1c9"/>
        <rect x="12" y="40" width="40" height="14" rx="7" fill="#5f7298"/>
      </svg>`
    );
  
    const setTextOnce = (el, txt) => { if (el && el.textContent !== txt) el.textContent = txt; };
  
    function setAvatarOnce(img, url) {
      if (!img) return;
      const want = url || FALLBACK_AVA;
      if (img.dataset.currentSrc === want) return; // уже стоит — не трогаем
      img.dataset.currentSrc = want;
      img.crossOrigin = "anonymous";
      img.onerror = () => {
        img.onerror = null;
        if (img.src !== FALLBACK_AVA) {
          img.dataset.currentSrc = FALLBACK_AVA;
          img.src = FALLBACK_AVA;
        }
      };
      img.src = want;
    }
  
    // ---------- Telegram user ----------
    const tg   = window.Telegram?.WebApp;
    const tgu  = tg?.initDataUnsafe?.user || null;
  
    const fullName = (u) => {
      if (!u) return "Guest";
      const fn = u.first_name || "";
      const ln = u.last_name || "";
      const n  = `${fn} ${ln}`.trim();
      return n || (u.username ? `@${u.username}` : "User");
    };
    const atHandle = (u) => (u?.username ? `@${u.username}` : "—");
  
    try {
      setTextOnce(userNameEl,   fullName(tgu));
      setTextOnce(profileName,  fullName(tgu));
      setTextOnce(profileHandle, atHandle(tgu));
  
      const photo = tgu?.photo_url || FALLBACK_AVA;
      setAvatarOnce(userAvatar,    photo);
      setAvatarOnce(profileAvatar,  photo);
    } catch {}
  
    // ---------- Навигация на страницу профиля ----------
    function openProfilePage() {
      document.querySelectorAll(".page").forEach(p => p.classList.remove("page-active"));
      $("profilePage")?.classList.add("page-active");
      document.querySelectorAll(".bottom-nav .nav-item").forEach(i => i.classList.remove("active"));
      document.querySelector('.bottom-nav .nav-item[data-target="profilePage"]')?.classList.add("active");
    }
    userPill?.addEventListener("click", openProfilePage, { passive: true });
  
    // ---------- TonConnect glue ----------
    const getTC = () => window.__wtTonConnect || null;
    const waitForTC = () =>
      getTC() ? Promise.resolve(getTC())
              : new Promise(res => window.addEventListener("wt-tc-ready", () => res(getTC()), { once: true }));
  
    // ---------- Wallet UI (анти-мигание) ----------
    let lastAddr = "";
    let rafScheduled = false;
    let pendingAddr = "";
  
    const shortAddr = (addr) => addr
      ? `${addr.slice(0,4)}…${addr.slice(-4)}`
      : "Not connected";
  
    function commitWalletUI(addr) {
      if (!walletText || !walletFull) return;
      if (addr === lastAddr) return; // ничего не менять, если тот же адрес
      lastAddr = addr;
  
      const compact = shortAddr(addr);
      if (walletText.textContent !== compact) walletText.textContent = compact;
      if (walletFull.textContent !== (addr || "—")) walletFull.textContent = addr || "—";
  
      walletPill?.classList.toggle("disabled", !addr);
    }
  
    function scheduleWalletUI(addr) {
      pendingAddr = addr;
      if (rafScheduled) return;
      rafScheduled = true;
      requestAnimationFrame(() => {
        rafScheduled = false;
        commitWalletUI(pendingAddr);
      });
    }
  
    // раскрытие/скрытие капсулы
    walletPill?.addEventListener("click", () => {
      if (!walletDetails) return;
      walletDetails.hidden = !walletDetails.hidden;
      walletPill.classList.toggle("open", !walletDetails.hidden);
    });
  
    // copy
    walletCopyBtn?.addEventListener("click", async () => {
      const text = walletFull?.textContent || "";
      if (!text || text === "—") return;
      try {
        await navigator.clipboard.writeText(text);
        const old = walletCopyBtn.textContent;
        walletCopyBtn.textContent = "Copied!";
        setTimeout(() => (walletCopyBtn.textContent = old), 900);
      } catch {}
    });
  
    // disconnect
    disconnectBtn?.addEventListener("click", async () => {
      try { await getTC()?.disconnect?.(); }
      catch {}
      scheduleWalletUI(""); // очистили UI
    });
  
    // подписка на TonConnect (один раз)
    (async () => {
      const tc = await waitForTC();
  
      // первичное состояние
      scheduleWalletUI(tc?.wallet?.account?.address || "");
  
      // единичная подписка на изменения статуса
      tc?.onStatusChange?.((w) => {
        scheduleWalletUI(w?.account?.address || "");
      });
    })();
  
  })();
  