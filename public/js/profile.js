// public/js/profile.js
(() => {
  const avatarEl = document.getElementById("profileAvatar");
  const nameEl   = document.getElementById("profileName");
  const handleEl = document.getElementById("profileHandle");
  const walletPill    = document.getElementById("walletPill");
  const walletDetails = document.getElementById("walletDetails");
  const walletShortEl = document.getElementById("profileWallet");
  const walletFullEl  = document.getElementById("walletFull");
  const copyBtn       = document.getElementById("walletCopy");
  const disconnectBtn = document.getElementById("profileDisconnect");

  // === 1) Telegram user ===
  const tg = window.Telegram?.WebApp;
  const user = tg?.initDataUnsafe?.user || null;

  if (user) {
    // Имя
    nameEl.textContent = user.first_name || user.last_name
      ? `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim()
      : "User";

    // @username (если есть)
    handleEl.textContent = user.username ? `@${user.username}` : "";

    // Аватар: пробуем photo_url, иначе fallback
    const photoUrl = user.photo_url || "/icons/avatar-default.png";
    avatarEl.src = photoUrl;
    avatarEl.onerror = () => { avatarEl.src = "/icons/avatar-default.png"; };
  } else {
    // Открыто вне Telegram — будет Guest
    nameEl.textContent = "Guest";
    handleEl.textContent = "";
    avatarEl.src = "/icons/avatar-default.png";
  }

  // === 2) TonConnect address ===
  function setWalletUI(address) {
    if (address) {
      const short = `${address.slice(0,4)}...${address.slice(-4)}`;
      walletShortEl.textContent = short;
      walletFullEl.textContent  = address;
    } else {
      walletShortEl.textContent = "Not connected";
      walletFullEl.textContent  = "—";
    }
  }

  // Ждём TonConnect из deposit.js (он класть его в window.__wtTonConnect)
  function initWalletBindings(tc) {
    setWalletUI(tc?.account?.address || null);

    tc.onStatusChange(() => {
      setWalletUI(tc?.account?.address || null);
    });

    // раскрытие/скрытие блока с полным адресом
    walletPill.addEventListener("click", () => {
      walletDetails.hidden = !walletDetails.hidden;
    });

    // копирование полного адреса
    copyBtn.addEventListener("click", async () => {
      const txt = walletFullEl.textContent.trim();
      if (!txt || txt === "—") return;
      try {
        await navigator.clipboard.writeText(txt);
        copyBtn.textContent = "Copied!";
        setTimeout(() => (copyBtn.textContent = "Copy"), 1200);
      } catch {}
    });

    // дисконнект кошелька
    disconnectBtn.addEventListener("click", async () => {
      try { await tc.disconnect(); } catch {}
      setWalletUI(null);
      walletDetails.hidden = true;
    });
  }

  if (window.__wtTonConnect) {
    initWalletBindings(window.__wtTonConnect);
  } else {
    window.addEventListener("wt-tc-ready", () => {
      initWalletBindings(window.__wtTonConnect);
    }, { once: true });
  }
})();
