// public/js/profile.js
(() => {
    const $ = (id) => document.getElementById(id);
    const on = (el, ev, fn, opt) => el && el.addEventListener(ev, fn, opt);
  
    // ===== DOM
    const userPill       = $("userPill");
    const profilePage    = $("profilePage");
    const avaBig         = $("profileAvatar");
    const nameEl         = $("profileName");
    const handleEl       = $("profileHandle");
  
    const walletPill     = $("walletPill");
    const walletShortEl  = $("profileWallet");
    const walletDetails  = $("walletDetails");
    const walletFullEl   = $("walletFull");
    const walletCopyBtn  = $("walletCopy");
    const disconnectBtn  = $("profileDisconnect");
  
    // ===== Аватар: фолбэк-инициалы (dataURL, без сетевых 404)
    function makeInitialsAvatar(name = "User", size = 112) {
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const ctx = c.getContext("2d");
  
      // фон-градиент
      const g = ctx.createLinearGradient(0,0,size,size);
      g.addColorStop(0, "#2b2f3a");
      g.addColorStop(1, "#1b1f28");
      ctx.fillStyle = g;
      ctx.fillRect(0,0,size,size);
  
      // инициалы
      const initials = name.split(" ")
        .map(s => s.trim()[0]?.toUpperCase())
        .filter(Boolean)
        .slice(0,2)
        .join("") || "U";
  
      ctx.fillStyle = "#8ea1c9";
      ctx.beginPath();
      ctx.arc(size/2, size/2 - 8, size/3, 0, Math.PI*2);
      ctx.fill();
  
      ctx.fillStyle = "#fff";
      ctx.font = `${Math.floor(size*0.32)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(initials, size/2, size/2 - 8);
  
      return c.toDataURL("image/png");
    }
  
    function setAvatar(img, url, name) {
      if (!img) return;
      const fallback = makeInitialsAvatar(name);
      const want = url || fallback;
      if (img.dataset.currentSrc === want) return;
      img.dataset.currentSrc = want;
      img.referrerPolicy = "no-referrer";
      img.crossOrigin = "anonymous";
      img.onerror = () => {
        img.onerror = null;
        if (img.src !== fallback) {
          img.dataset.currentSrc = fallback;
          img.src = fallback;
        }
      };
      img.src = want;
    }
  
    // ===== Адрес: raw → friendly (UQ/EQ)
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
  
    // ===== Telegram user → имя/handle/аватар
    const tg  = window.Telegram?.WebApp;
    const tgu = tg?.initDataUnsafe?.user || null;
    const fullName = (u) => {
      if (!u) return "User";
      const fn = u.first_name || "", ln = u.last_name || "";
      const n  = `${fn} ${ln}`.trim();
      return n || (u.username ? `@${u.username}` : "User");
    };
    const atHandle = (u) => (u?.username ? `@${u.username}` : "—");
  
    const dispName = fullName(tgu);
    if (nameEl)   nameEl.textContent   = dispName;
    if (handleEl) handleEl.textContent = atHandle(tgu);
  
    setAvatar(avaBig, tgu?.photo_url, dispName);
  
    // ===== Открыть профиль по клику на левую пилюлю
    on($("userPill"), "click", () => {
      document.querySelectorAll(".page").forEach(p => p.classList.remove("page-active"));
      profilePage?.classList.add("page-active");
      document.querySelectorAll(".bottom-nav .nav-item").forEach(i => i.classList.remove("active"));
      document.querySelector('.bottom-nav .nav-item[data-target="profilePage"]')?.classList.add("active");
    }, { passive:true });
  
    // ===== TonConnect
    const waitForTC = () =>
      window.__wtTonConnect
        ? Promise.resolve(window.__wtTonConnect)
        : new Promise(res => window.addEventListener("wt-tc-ready", () => res(window.__wtTonConnect), { once:true }));
  
    let lastAddr = "";
    function renderWallet(addrRaw){
      const addr = ensureFriendly(addrRaw, { bounceable:true, testOnly:false });
      if (addr === lastAddr) return; lastAddr = addr;
      if (walletShortEl) walletShortEl.textContent = shortAddr(addr);
      if (walletFullEl)  walletFullEl.textContent  = addr || "—";
      walletPill?.classList.toggle("disabled", !addr);
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
      renderWallet(tc?.wallet?.account?.address || "");
      if (!tc.__wtProfileBound) {
        tc.__wtProfileBound = true;
        tc.onStatusChange?.(w => renderWallet(w?.account?.address || ""));
      }
    })();
  
  })();
  