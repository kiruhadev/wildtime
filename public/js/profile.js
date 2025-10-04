// public/js/profile.js
(() => {
    // ================== DOM utils ==================
    const $ = (id) => document.getElementById(id);
    const on = (el, ev, fn, opt) => el && el.addEventListener(ev, fn, opt);
  
    // ---- Refs (все id должны быть в HTML) ----
    const userPill       = $("userPill");
    const userAvatar     = $("userAvatar");
    const userNameEl     = $("userName");
  
    const profileAvatar  = $("profileAvatar");
    const profileName    = $("profileName");
    const profileHandle  = $("profileHandle");
  
    const statSpins      = $("statSpins");
    const statWins       = $("statWins");
    const statRTP        = $("statRTP");
  
    const walletPill     = $("walletPill");
    const walletText     = $("profileWallet"); // короткий (UQxx…zz)
    const walletDetails  = $("walletDetails"); // раскрывашка
    const walletFull     = $("walletFull");    // полный адрес
    const walletCopyBtn  = $("walletCopy");
    const disconnectBtn  = $("profileDisconnect");
  
    // ================== AVATAR (анти-мигание) ==================
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
  
    function setAvatarOnce(img, url) {
      if (!img) return;
      const want = url || FALLBACK_AVA;
      if (img.dataset.currentSrc === want) return; // уже стоит
      img.dataset.currentSrc = want;
      img.referrerPolicy = "no-referrer";
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
  
    // ================== TON address helpers ==================
    function crc16Xmodem(bytes){
      let crc = 0xffff;
      for (let b of bytes){
        crc ^= (b << 8);
        for (let i=0;i<8;i++){
          crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
          crc &= 0xffff;
        }
      }
      return crc;
    }
  
    function rawToFriendly(raw, {bounceable=true, testOnly=false}={}){
      const m = raw?.match?.(/^(-?\d+):([a-fA-F0-9]{64})$/);
      if (!m) return raw || "";
      const wc = parseInt(m[1], 10);
      const hash = Uint8Array.from(m[2].match(/.{2}/g).map(h => parseInt(h,16)));
      const tag = (bounceable ? 0x11 : 0x51) | (testOnly ? 0x80 : 0);
      const body = new Uint8Array(2 + 32);
      body[0] = tag;
      body[1] = (wc & 0xff);
      body.set(hash, 2);
      const crc = crc16Xmodem(body);
      const out = new Uint8Array(body.length + 2);
      out.set(body,0);
      out[out.length-2] = (crc >> 8) & 0xff;
      out[out.length-1] = crc & 0xff;
      let b64 = btoa(String.fromCharCode(...out));
      return b64.replace(/\+/g,'-').replace(/\//g,'_'); // UQ../EQ..
    }
  
    const ensureFriendly = (addr, opts) =>
      !addr ? "" : (/^[UE]Q/.test(addr) ? addr : rawToFriendly(addr, opts));
  
    const shortAddr = (addr) => addr ? `${addr.slice(0,4)}…${addr.slice(-4)}` : "Not connected";
  
    // ================== Telegram user ==================
    const tg  = window.Telegram?.WebApp;
    const tgu = tg?.initDataUnsafe?.user || null;
  
    const fullName = (u) => {
      if (!u) return "Guest";
      const fn = u.first_name || "";
      const ln = u.last_name || "";
      const n  = `${fn} ${ln}`.trim();
      return n || (u.username ? `@${u.username}` : "User");
    };
    const atHandle = (u) => (u?.username ? `@${u.username}` : "—");
  
    try {
      const photo = tgu?.photo_url || FALLBACK_AVA;
      setAvatarOnce(userAvatar,    photo);
      setAvatarOnce(profileAvatar, photo);
      if (userNameEl)    userNameEl.textContent    = fullName(tgu);
      if (profileName)   profileName.textContent   = fullName(tgu);
      if (profileHandle) profileHandle.textContent = atHandle(tgu);
    } catch {}
  
    // ================== Навигация на профиль ==================
    function openProfilePage() {
      document.querySelectorAll(".page").forEach(p => p.classList.remove("page-active"));
      $("profilePage")?.classList.add("page-active");
      document.querySelectorAll(".bottom-nav .nav-item").forEach(i => i.classList.remove("active"));
      document.querySelector('.bottom-nav .nav-item[data-target="profilePage"]')?.classList.add("active");
    }
    on(userPill, "click", openProfilePage, { passive: true });
  
    // ================== Статистика (локально, как плейсхолдер) ==================
    try {
      const raw = localStorage.getItem("wt_stats");
      const stats = raw ? JSON.parse(raw) : { spins: 0, wins: 0, rtp: null };
      if (statSpins) statSpins.textContent = stats.spins ?? 0;
      if (statWins)  statWins.textContent  = stats.wins ?? 0;
      if (statRTP)   statRTP.textContent   = (stats.rtp == null ? "—" : `${stats.rtp}%`);
    } catch {}
  
    // ================== TonConnect glue ==================
    const getTC = () => window.__wtTonConnect || null;
    const waitForTC = () =>
      getTC() ? Promise.resolve(getTC())
              : new Promise(res => on(window, "wt-tc-ready", () => res(getTC()), { once:true }));
  
    // Рисуем кошелёк без мигания (batched в rAF)
    let rafToken = 0, lastAddr = "";
    function updateWalletUI(addrRaw) {
      const addr = ensureFriendly(addrRaw, { bounceable:true, testOnly:false });
      if (addr === lastAddr) return;
      lastAddr = addr;
  
      cancelAnimationFrame(rafToken);
      rafToken = requestAnimationFrame(() => {
        if (walletText) walletText.textContent = shortAddr(addr);
        if (walletFull) walletFull.textContent = addr || "—";
        walletPill?.classList.toggle("disabled", !addr);
      });
    }
  
    // раскрывашка
    on(walletPill, "click", () => {
      if (!walletDetails) return;
      walletDetails.hidden = !walletDetails.hidden;
      walletPill.classList.toggle("open", !walletDetails.hidden);
    });
  
    // копирование
    on(walletCopyBtn, "click", async () => {
      const text = walletFull?.textContent || "";
      if (!text || text === "—") return;
      try {
        await navigator.clipboard.writeText(text);
        const old = walletCopyBtn.textContent;
        walletCopyBtn.textContent = "Copied!";
        setTimeout(() => (walletCopyBtn.textContent = old), 900);
      } catch {}
    });
  
    // дисконнект
    on(disconnectBtn, "click", async () => {
      try { await getTC()?.disconnect?.(); } catch {}
      updateWalletUI("");
    });
  
    // Инициализация TonConnect
    (async () => {
      const tc = await waitForTC();
  
      // первичный рендер
      updateWalletUI(tc?.wallet?.account?.address || "");
  
      // подписка ровно один раз
      if (!tc.__wtProfileBound) {
        tc.__wtProfileBound = true;
        tc.onStatusChange?.((w) => updateWalletUI(w?.account?.address || ""));
      }
    })();
  
  })();
  