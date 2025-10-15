// public/js/profile.js
(() => {
  const avatarEl = document.getElementById("profileAvatar");
  const nameEl = document.getElementById("profileName");
  const handleEl = document.getElementById("profileHandle");
  const walletPill = document.getElementById("walletPill");
  const walletDetails = document.getElementById("walletDetails");
  const walletShort = document.getElementById("profileWallet");
  const walletFull = document.getElementById("walletFull");
  const copyBtn = document.getElementById("walletCopy");
  const disconnectBtn = document.getElementById("profileDisconnect");

  // === Telegram user info ===
  const tg = window.Telegram?.WebApp;
  const user = tg?.initDataUnsafe?.user;

  if (user) {
    nameEl.textContent = user.first_name || "User";
    handleEl.textContent = user.username ? `@${user.username}` : "";
    const uid = user.id;

    // Загружаем аватар через серверный прокси
    const avatarUrl = `/api/tg/photo/${uid}`;
    avatarEl.src = avatarUrl;

    avatarEl.onerror = () => {
      avatarEl.src = "/icons/avatar-default.png"; // fallback
    };
  } else {
    nameEl.textContent = "Guest";
    avatarEl.src = "/icons/avatar-default.png";
  }

  // === TON Connect ===
  const tc = window.__wtTonConnect;

  if (!tc) {
    window.addEventListener("wt-tc-ready", initWallet);
  } else {
    initWallet();
  }

  function initWallet() {
    const ton = window.__wtTonConnect;
    updateWalletUI();

    ton.onStatusChange(() => updateWalletUI());

    function updateWalletUI() {
      const wallet = ton.account?.address;
      if (wallet) {
        const short = `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
        walletShort.textContent = short;
        walletFull.textContent = wallet;
      } else {
        walletShort.textContent = "Not connected";
        walletFull.textContent = "—";
      }
    }

    // раскрытие/скрытие
    walletPill.addEventListener("click", () => {
      walletDetails.hidden = !walletDetails.hidden;
    });

    // копирование
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(walletFull.textContent);
        copyBtn.textContent = "Copied!";
        setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
      } catch {
        alert("Copy failed");
      }
    });

    // отключение
    disconnectBtn.addEventListener("click", async () => {
      await ton.disconnect();
      walletShort.textContent = "Not connected";
      walletFull.textContent = "—";
    });
  }
})();
