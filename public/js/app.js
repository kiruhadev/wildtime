// public/js/app.js
document.addEventListener("DOMContentLoaded", () => {
  // Tabs: wheel / profile
  function showPage(id) {
    document.querySelectorAll(".page").forEach(p => p.hidden = true);
    const el = document.getElementById(id);
    if (el) el.hidden = false;
    document.querySelectorAll(".nav-item").forEach(btn => btn.classList.remove("active"));
    document.querySelector(`[data-target="${id}"]`)?.classList.add("active");
  }

  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const t = btn.dataset.target;
      showPage(t);
    });
  });

  // Deposit sheet toggle (open)
  const depositSheet = document.getElementById("depositSheet");
  const tonPill = document.getElementById("tonPill");
  const depositOpenButtons = document.querySelectorAll("[data-open-deposit]");
  depositOpenButtons.forEach(b => b.addEventListener("click", () => {
    depositSheet.setAttribute("aria-hidden", "false");
    document.getElementById("depAmount").focus();
  }));
  // close sheet by clicking backdrop
  document.querySelectorAll(".sheet-backdrop").forEach(back => back.addEventListener("click", () => {
    depositSheet.setAttribute("aria-hidden", "true");
  }));

  // top profile button -> profile page
  document.getElementById("profileButton").addEventListener("click", () => {
    showPage("profilePage");
  });

  // set min deposit text from server env (for demo we read default)
  const min = parseFloat((window.MIN_DEPOSIT || 0.1));
  document.getElementById("minDepositText").textContent = String(min);
});
