// profile.js
(() => {
  const $ = (s) => document.querySelector(s);

  // DOM
  const avatarEl   = $("#profileAvatar");
  const nameEl     = $("#profileName");
  const handleEl   = $("#profileHandle");
  const walletPill = $("#walletPill");
  const walletBox  = $("#walletDetails");
  const walletShort= $("#profileWallet");
  const walletFull = $("#walletFull");
  const btnCopy    = $("#walletCopy");
  const btnDisc    = $("#profileDisconnect");

  // fallback-аватар (inline SVG)
  const FALLBACK_SVG =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0d68c3"/><stop offset="1" stop-color="#182234"/></linearGradient></defs><rect width="96" height="96" rx="48" fill="url(#g)"/><circle cx="48" cy="38" r="16" fill="rgba(255,255,255,.85)"/><rect x="20" y="58" width="56" height="22" rx="11" fill="rgba(255,255,255,.75)"/></svg>`);

  const shortAddr = (a) => a ? `${a.slice(0,4)}…${a.slice(-4)}` : "Not connected";

  function setAvatar(src){ if(!avatarEl) return; avatarEl.onerror=()=>{avatarEl.onerror=null; avatarEl.src=FALLBACK_SVG;}; avatarEl.src=src||FALLBACK_SVG; }
  function setName(t){ if(nameEl) nameEl.textContent = t || "Guest"; }
  function setHandle(t){ if(handleEl) handleEl.textContent = t || "—"; }
  function setWallet(addr){
    if (walletShort) walletShort.textContent = addr ? shortAddr(addr) : "Not connected";
    if (walletFull)  walletFull.textContent  = addr || "—";
  }

  function whenTGReady(){
    return new Promise((resolve) => {
      const tg = window.Telegram?.WebApp;
      if (tg) { try { tg.ready(); } catch {} resolve(tg); } else resolve(null);
    });
  }
  function whenTonConnectReady(){
    return new Promise((resolve) => {
      if (window.__wtTonConnect) return resolve(window.__wtTonConnect);
      window.addEventListener("wt-tc-ready", () => resolve(window.__wtTonConnect), { once: true });
    });
  }

  async function init(){
    const tg = await whenTGReady();

    // Telegram user
    const user = tg?.initDataUnsafe?.user;
    if (user?.id){
      const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
      setName(fullName || "User");
      setHandle(user.username ? `@${user.username}` : "—");
      setAvatar(`/api/tg/photo/${encodeURIComponent(user.id)}?t=${Date.now()}`);
    } else {
      setName("Guest"); setHandle("—"); setAvatar(FALLBACK_SVG);
    }

    // TonConnect
    const tc = await whenTonConnectReady();
    const apply = () => setWallet(tc?.account?.address || "");
    apply();
    tc?.onStatusChange?.(apply);

    // UI
    walletPill?.addEventListener("click", () => {
      if (!tc?.account) { try { tc?.openModal?.(); } catch {} return; }
      const expanded = walletPill.getAttribute("aria-expanded") === "true";
      if (expanded) { walletPill.setAttribute("aria-expanded","false"); walletBox?.setAttribute("hidden",""); }
      else { walletPill.setAttribute("aria-expanded","true"); walletBox?.removeAttribute("hidden"); }
    });

    btnCopy?.addEventListener("click", async () => {
      const full = tc?.account?.address;
      if (!full) return;
      try { await navigator.clipboard.writeText(full); } catch {}
    });

    btnDisc?.addEventListener("click", async () => {
      try { await tc?.disconnect?.(); } catch {}
      setWallet("");
      walletPill?.setAttribute("aria-expanded","false");
      walletBox?.setAttribute("hidden","");
    });
  }

  init();
})();
