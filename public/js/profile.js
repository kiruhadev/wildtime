// profile.js — имя/ник/аватар из Telegram + кошелёк из TonConnect
(() => {
  const $ = (s) => document.querySelector(s);
  const avatarEl   = $("#profileAvatar");
  const nameEl     = $("#profileName");
  const handleEl   = $("#profileHandle");
  const walletPill = $("#walletPill");
  const walletBox  = $("#walletDetails");
  const walletShort= $("#profileWallet");
  const walletFull = $("#walletFull");
  const btnCopy    = $("#walletCopy");
  const btnDisc    = $("#profileDisconnect");

  const FALLBACK_SVG =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0d68c3"/><stop offset="1" stop-color="#182234"/></linearGradient></defs><rect width="96" height="96" rx="48" fill="url(#g)"/><circle cx="48" cy="38" r="16" fill="rgba(255,255,255,.85)"/><rect x="20" y="58" width="56" height="22" rx="11" fill="rgba(255,255,255,.75)"/></svg>`);

  const short = (a) => a ? `${a.slice(0,4)}…${a.slice(-4)}` : "Not connected";
  const setAvatar = (src) => {
    if (!avatarEl) return;
    avatarEl.onerror = () => { avatarEl.onerror = null; avatarEl.src = FALLBACK_SVG; };
    avatarEl.src = src || FALLBACK_SVG;
  };
  const setName   = (t) => { if (nameEl)   nameEl.textContent = t || "Guest"; };
  const setHandle = (t) => { if (handleEl) handleEl.textContent = t || "—"; };
  const setWallet = (addr)=> {
    if (walletShort) walletShort.textContent = short(addr);
    if (walletFull)  walletFull.textContent  = addr || "—";
  };

  function whenTGReady(){
    return new Promise((resolve) => {
      const tg = window.Telegram?.WebApp;
      if (tg) { try { tg.ready(); } catch {} }
      resolve(window.Telegram?.WebApp || null);
    });
  }
  function whenTonConnectReady(){
    return new Promise((resolve) => {
      if (window.__wtTonConnect) return resolve(window.__wtTonConnect);
      window.addEventListener("wt-tc-ready", () => resolve(window.__wtTonConnect), { once: true });
    });
  }

  async function init(){
    // Telegram user data
    const tg = await whenTGReady();
    const u  = tg?.initDataUnsafe?.user;
    if (u?.id){
      const fullName = [u.first_name, u.last_name].filter(Boolean).join(" ");
      setName(fullName || "User");
      setHandle(u.username ? `@${u.username}` : "—");
      setAvatar(`/api/tg/photo/${encodeURIComponent(u.id)}?t=${Date.now()}`);
    } else {
      setName("Guest"); setHandle("—"); setAvatar(FALLBACK_SVG);
    }

    // TonConnect account
    const tc = await whenTonConnectReady();
    const apply = async () => {
      const acc = await tc.getAccount();
      setWallet(acc?.address || "");
    };
    tc.onStatusChange(apply);
    apply();

    // UI toggles
    walletPill?.addEventListener("click", async () => {
      const acc = await tc.getAccount();
      if (!acc) { try { await tc.openModal(); } catch {} return; }
      const open = walletPill.getAttribute("aria-expanded") === "true";
      if (open) { walletPill.setAttribute("aria-expanded","false"); walletBox?.setAttribute("hidden",""); }
      else      { walletPill.setAttribute("aria-expanded","true");  walletBox?.removeAttribute("hidden"); }
    });

    btnCopy?.addEventListener("click", async () => {
      const full = walletFull?.textContent?.trim();
      if (!full || full === "—") return;
      try { await navigator.clipboard.writeText(full); } catch {}
    });

    btnDisc?.addEventListener("click", async () => {
      try { await tc.disconnect(); } catch {}
      setWallet("");
      walletPill?.setAttribute("aria-expanded","false");
      walletBox?.setAttribute("hidden","");
    });
  }

  init();
})();
