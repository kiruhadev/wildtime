// public/js/profile.js
(() => {
    // ---------- DOM ----------
    const $ = (id) => document.getElementById(id);
    const on = (el, ev, fn, opt) => el && el.addEventListener(ev, fn, opt);
  
    const userPill   = $("userPill");
    const avaBig     = $("profileAvatar");
    const nameEl     = $("profileName");
    const handleEl   = $("profileHandle");
  
    const walletPill    = $("walletPill");     // кнопка-капсула
    const walletShortEl = $("profileWallet");  // короткий UQxx…zz
    const walletDetails = $("walletDetails");  // раскрывашка
    const walletFullEl  = $("walletFull");     // полный адрес
    const walletCopyBtn = $("walletCopy");
    const disconnectBtn = $("profileDisconnect");
  
    // ---------- Аватар (без мигания) ----------
    const FALLBACK_AVA =
      'data:image/svg+xml;utf8,' + encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 64 64">
          <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#2b2f3a"/><stop offset="1" stop-color="#1b1f28"/>
          </linearGradient></defs>
          <rect width="64" height="64" rx="18" fill="url(#g)"/>
          <circle cx="32" cy="23" r="12" fill="#8ea1c9"/>
          <rect x="12" y="38" width="40" height="16" rx="8" fill="#5f7298"/>
        </svg>`
      );
  
    function setAvatarOnce(img, url) {
      if (!img) return;
      const want = url || FALLBACK_AVA;
      if (img.dataset.currentSrc === want) return;
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
  
    // ---------- Адрес: raw -> friendly (UQ/EQ) ----------
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
      body[0] = tag; body[1] = (wc & 0xff); body.set(hash, 2);
      const crc = crc16Xmodem(body);
      const out = new Uint8Array(body.length + 2);
      out.set(body,0); out[out.length-2]=(crc>>8)&0xff; out[out.length-1]=crc&0xff;
      let b64 = btoa(String.fromCharCode(...out));
      return b64.replace(/\+/g,'-').replace(/\//g,'_');
    }
    const ensureFriendly = (addr, opts) =>
      !addr ? "" : (/^[UE]Q/.test(addr) ? addr : rawToFriendly(addr, opts));
    const shortAddr = (addr) => addr ? `${addr.slice(0,4)}…${addr.slice(-4)}` : "Not connected";
  
    // ---------- Telegram user -> имя/аватар ----------
    const tg  = window.Telegram?.WebApp;
    const tgu = tg?.initDataUnsafe?.user || null;
    const fullName = (u) => {
      if (!u) return "User";
      const fn = u.first_name || "", ln = u.last_name || "";
      const n = `${fn} ${ln}`.trim();
      return n || (u.username ? `@${u.username}` : "User");
    };
    const atHandle = (u) => (u?.username ? `@${u.username}` : "—");
  
    try {
      setAvatarOnce(avaBig, tgu?.photo_url || FALLBACK_AVA);
      if (nameEl)   nameEl.textContent   = fullName(tgu);
      if (handleEl) handleEl.textContent = atHandle(tgu);
    } catch {}
  
    // переход на профиль по клику на верхнюю «пилюлю» слева
    on(userPill, "click", () => {
      document.querySelectorAll(".page").forEach(p => p.classList.remove("page-active"));
      document.getElementById("profilePage")?.classList.add("page-active");
      document.querySelectorAll(".bottom-nav .nav-item").forEach(i => i.classList.remove("active"));
      document.querySelector('.bottom-nav .nav-item[data-target="profilePage"]')?.classList.add("active");
    }, { passive:true });
  
    // ---------- TonConnect: ждём из deposit.js ----------
    const waitForTC = () =>
      window.__wtTonConnect
        ? Promise.resolve(window.__wtTonConnect)
        : new Promise(res => window.addEventListener("wt-tc-ready", () => res(window.__wtTonConnect), { once:true }));
  
    // аккуратное обновление UI
    let lastAddr = "";
    function renderWallet(addrRaw) {
      const addr = ensureFriendly(addrRaw, { bounceable:true, testOnly:false });
      if (addr === lastAddr) return; lastAddr = addr;
      if (walletShortEl) walletShortEl.textContent = shortAddr(addr);
      if (walletFullEl)  walletFullEl.textContent  = addr || "—";
    }
  
    // раскрывашка/копия/дисконнект
    on(walletPill, "click", () => {
      if (!walletDetails) return;
      walletDetails.hidden = !walletDetails.hidden;
      walletPill.classList.toggle("open", !walletDetails.hidden);
    });
    on(walletCopyBtn, "click", async () => {
      const text = walletFullEl?.textContent || "";
      if (!text || text === "—") return;
      try {
        await navigator.clipboard.writeText(text);
        const old = walletCopyBtn.textContent;
        walletCopyBtn.textContent = "Copied!";
        setTimeout(() => walletCopyBtn.textContent = old, 900);
      } catch {}
    });
    on(disconnectBtn, "click", async () => {
      try { await window.__wtTonConnect?.disconnect?.(); } catch {}
      renderWallet("");
    });
  
    (async () => {
      const tc = await waitForTC();
      // первичное состояние
      renderWallet(tc?.wallet?.account?.address || "");
      // единичная подписка
      if (!tc.__wtProfileBound) {
        tc.__wtProfileBound = true;
        tc.onStatusChange?.(w => renderWallet(w?.account?.address || ""));
      }
    })();
  
  })();
  