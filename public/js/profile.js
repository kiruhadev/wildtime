// public/js/profile.js
document.addEventListener("DOMContentLoaded", () => {
  const init = window.Telegram?.WebApp?.initDataUnsafe || null;
  const nameEl = document.getElementById("profileName");
  const handleEl = document.getElementById("profileHandle");
  const avatarTop = document.getElementById("topAvatar");
  const topName = document.getElementById("topName");
  const profileAvatar = document.getElementById("profileAvatar");

  // If launched as Telegram WebApp, use initDataUnsafe.user info
  if (init?.user) {
    const user = init.user;
    const displayName = user.first_name + (user.last_name ? " " + user.last_name : "");
    const username = user.username ? `@${user.username}` : "Telegram user";
    nameEl.textContent = displayName;
    handleEl.textContent = username;
    topName.textContent = displayName;

    // If Telegram provided photo_url in user -> use it. Many clients do not provide photo.
    if (user.photo_url) {
      avatarTop.src = user.photo_url;
      profileAvatar.src = user.photo_url;
    } else {
      // fallback to default avatar image
      avatarTop.src = "/icons/avatar-default.png";
      profileAvatar.src = "/icons/avatar-default.png";
    }
  } else {
    // guest
    nameEl.textContent = "Guest";
    handleEl.textContent = "";
    avatarTop.src = "/icons/avatar-default.png";
    profileAvatar.src = "/icons/avatar-default.png";
  }

  // wallet pill toggles full wallet details
  const walletPill = document.getElementById("walletPill");
  const walletDetails = document.getElementById("walletDetails");
  walletPill?.addEventListener("click", () => {
    walletDetails.hidden = !walletDetails.hidden;
  });

  // copy / disconnect handlers (left for you to implement backend clearing if needed)
  document.getElementById("walletCopy")?.addEventListener("click", async () => {
    const text = document.getElementById("walletFull")?.textContent || "";
    try { await navigator.clipboard.writeText(text); alert("Copied"); } catch { alert("Copy failed"); }
  });
  document.getElementById("profileDisconnect")?.addEventListener("click", () => {
    // clear any stored TonConnect session keys we used
    const tgUserId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || "guest";
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith(`${tgUserId}:wt:`)) localStorage.removeItem(k);
    });
    alert("Disconnected (local)");
    location.reload();
  });
});
