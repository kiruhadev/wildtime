// public/js/profile.js
(() => {
  const $id = (id) => document.getElementById(id);
  const tg = window.Telegram?.WebApp;
  const user = tg?.initDataUnsafe?.user || null;

  const avatarEl   = $id("profileAvatar");   // <img>
  const nameEl     = $id("profileName");     // <div>
  const handleEl   = $id("profileHandle");   // <div> optional
  const walletPill = $id("walletPill");      // <button>
  const walletFull = $id("walletFull");      // <div>
  const walletShort= $id("walletShort");     // <span>
  const walletBox  = $id("walletDetails");   // <div hidden>
  const copyBtn    = $id("walletCopy");      // <button>
  const disconnect = $id("profileDisconnect"); // <button> optional
  const userPill   = $id("userPill");        // <button> opens profile

  // Имя/ник
  const displayName = user ? `${user.first_name||""} ${user.last_name||""}`.trim() || (user.username ? `@${user.username}` : "User") : "User";
  if (nameEl)   nameEl.textContent = displayName;
  if (handleEl) handleEl.textContent = user?.username ? `@${user.username}` : "";

  // Аватар: пробуем через прокси, иначе инициалы
  function initialsDataURL(name="User", size=160){
    const c=document.createElement("canvas"); c.width=c.height=size;
    const x=c.getContext("2d"); const grd=x.createLinearGradient(0,0,size,size);
    grd.addColorStop(0,"#2b2f3a"); grd.addColorStop(1,"#1b1f28");
    x.fillStyle=grd; x.fillRect(0,0,size,size);
    const ini=(name.split(" ").map(s=>s[0]).filter(Boolean).slice(0,2).join("")||"U").toUpperCase();
    x.fillStyle="#8ea1c9"; x.beginPath(); x.arc(size/2,size/2-6,size*0.42,0,Math.PI*2); x.fill();
    x.fillStyle="#fff"; x.font=`${Math.floor(size*0.34)}px system-ui, sans-serif`;
    x.textAlign="center"; x.textBaseline="middle"; x.fillText(ini,size/2,size/2-6);
    return c.toDataURL("image/png");
  }
  (function setAvatar(){
    if (!avatarEl) return;
    const fallback = initialsDataURL(displayName, 160);
    const uid = user?.id;
    if (uid) {
      avatarEl.onerror = ()=>{ avatarEl.onerror=null; avatarEl.src=fallback; };
      avatarEl.referrerPolicy="no-referrer"; avatarEl.crossOrigin="anonymous";
      avatarEl.src = `/api/tg/photo/${uid}`;
    } else {
      avatarEl.src = fallback;
    }
  })();

  // TonConnect: ждём готовности от deposit.js
  function waitTC() {
    return window.__wtTonConnect
      ? Promise.resolve(window.__wtTonConnect)
      : new Promise(res => window.addEventListener("wt-tc-ready", ()=>res(window.__wtTonConnect), { once:true }));
  }

  function renderWallet(addrRaw){
    const friendly = WT?.utils?.ensureFriendly ? WT.utils.ensureFriendly(addrRaw,{ bounceable:true }) : (addrRaw||"");
    const short    = WT?.utils?.shortAddr ? WT.utils.shortAddr(friendly) : (friendly ? `${friendly.slice(0,4)}…${friendly.slice(-4)}` : "Not connected");
    if (walletShort) walletShort.textContent = short || "Not connected";
    if (walletFull)  walletFull.textContent = friendly || "—";
    walletPill?.classList.toggle("disabled", !friendly);
  }

  (async () => {
    const tc = await waitTC();
    renderWallet(tc?.wallet?.account?.address || tc?.account?.address || "");
    tc.onStatusChange?.(w => renderWallet(w?.account?.address || ""));

    // Показ/скрытие полного адреса
    walletPill?.addEventListener("click", ()=>{
      if (!walletBox) return;
      walletBox.hidden = !walletBox.hidden;
    });

    // Копирование
    copyBtn?.addEventListener("click", async ()=>{
      const t = walletFull?.textContent || "";
      if (!t || t==="—") return;
      try {
        await navigator.clipboard.writeText(t);
        const old = copyBtn.textContent; copyBtn.textContent="Copied!";
        setTimeout(()=>copyBtn.textContent=old||"Copy", 900);
      } catch {}
    });

    // Открыть страницу профиля по клику на верхнюю пилюлю с юзером
    userPill?.addEventListener("click", ()=>{
      document.querySelectorAll(".page").forEach(p=>p.classList.remove("page-active"));
      document.getElementById("profilePage")?.classList.add("page-active");

      document.querySelectorAll(".bottom-nav .nav-item").forEach(b=>b.classList.remove("active"));
      document.querySelector('.bottom-nav .nav-item[data-target="profilePage"]')?.classList.add("active");
    });

    // Disconnect (если нужна кнопка)
    disconnect?.addEventListener("click", async ()=>{
      try { await tc.disconnect(); } catch {}
      renderWallet("");
    });
  })();
})();
