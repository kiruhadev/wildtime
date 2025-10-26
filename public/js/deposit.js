// public/js/deposit.js
// Requires TON_CONNECT_UI global (loaded via CDN in index.html)
(() => {
  const MANIFEST_URL = "/tonconnect-manifest.json";
  const MIN_DEPOSIT = Number(0.1); // keep in sync with server
  const depAmountInput = document.getElementById("depAmount");
  const connectBtn = document.getElementById("connectWalletBtn");
  const depositNowBtn = document.getElementById("depositNowBtn");
  const depHint = document.getElementById("depHint");
  const tonPillAmount = document.getElementById("tonAmount");

  // small wrapper to get Telegram initData (if exist)
  const tgInit = window.Telegram?.WebApp?.initData || null;
  const initDataStr = window.Telegram?.WebApp?.initData || window.location.search.replace(/^\?/, "") || "";

  // user-specific storage key (use Telegram user id when available)
  const tgUserId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || ("guest");
  const storage = {
    getItem: k => localStorage.getItem(`${tgUserId}:wt:${k}`),
    setItem: (k, v) => localStorage.setItem(`${tgUserId}:wt:${k}`, v),
    removeItem: k => localStorage.removeItem(`${tgUserId}:wt:${k}`)
  };

  // create TonConnect UI (if available)
  let tcUI = null;
  if (window.TON_CONNECT_UI) {
    tcUI = new TON_CONNECT_UI.TonConnectUI({
      manifestUrl: MANIFEST_URL,
      uiPreferences: { theme: "SYSTEM" },
      storage,
      restoreConnection: true
    });
    // make accessible
    window.__wtTonConnect = tcUI;
  }

  async function updateUIFromConnection() {
    if (!tcUI) return;
    const state = tcUI.getWallets?.() || [];
    const first = state[0];
    if (first) {
      // show address short
      const short = shortenAddr(first.account || first.address || "");
      document.getElementById("profileWallet").textContent = short || "connected";
      tonPillAmount.textContent = "—"; // placeholder: balance not fetched here
      depHint.textContent = "Wallet connected: " + short;
    } else {
      document.getElementById("profileWallet").textContent = "Not connected";
      depHint.textContent = "Connect your TON wallet first (optional). Or just send deposit request.";
    }
  }

  function shortenAddr(str = "") {
    if (!str) return str;
    return str.length > 12 ? `${str.slice(0,6)}...${str.slice(-6)}` : str;
  }

  // Connect wallet click
  connectBtn?.addEventListener("click", async () => {
    if (!tcUI) {
      alert("TON Connect UI not loaded.");
      return;
    }
    try {
      const r = await tcUI.connect();
      // after connect update UI
      await updateUIFromConnection();
    } catch (err) {
      console.error("connect error", err);
      alert("Connect failed");
    }
  });

  // Deposit Now click -> call /deposit endpoint with initData + amount
  depositNowBtn?.addEventListener("click", async () => {
    const val = (depAmountInput.value || "").replace(",", ".").trim();
    const num = Number(val);
    if (!Number.isFinite(num) || num < MIN_DEPOSIT) {
      alert(`Enter amount >= ${MIN_DEPOSIT}`);
      return;
    }

    depositNowBtn.disabled = true;
    depositNowBtn.textContent = "Sending...";

    try {
      const body = {
        amount: num,
        initData: initDataStr
      };
      const resp = await fetch("/deposit", {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify(body)
      });
      const data = await resp.json();
      if (data.ok) {
        depHint.textContent = `✅ Deposit request sent: ${num} TON. Please confirm in your wallet.`;
      } else {
        depHint.textContent = `Error: ${data.error || "unknown"}`;
      }
    } catch (err) {
      console.error("deposit error", err);
      depHint.textContent = "Server error sending deposit request.";
    } finally {
      depositNowBtn.disabled = false;
      depositNowBtn.textContent = "Deposit Now";
    }
  });

  // On init attempt to restore session + update UI
  (async () => {
    if (tcUI) {
      // restore (TonConnectUI does it by default if restoreConnection:true)
      try { await updateUIFromConnection(); } catch(e){ console.warn(e); }
    }
  })();

})();
