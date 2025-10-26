// app.js — роутинг по страницам, user pill -> профиль, мелочи UI
(() => {
  const pages = document.querySelectorAll(".page");
  const navItems = document.querySelectorAll(".bottom-nav .nav-item");

  function showPage(id){
    pages.forEach(p => p.classList.remove("page-active"));
    document.getElementById(id)?.classList.add("page-active");
    navItems.forEach(b => b.classList.toggle("active", b.dataset.target === id));
  }

  // нижняя навигация
  navItems.forEach(btn => btn.addEventListener("click", () => showPage(btn.dataset.target)));

  // левая пилюля с юзером -> профиль
  document.getElementById("userPill")?.addEventListener("click", () => showPage("profilePage"));

  // история — пример заполнения (можно заменить реальными данными)
  const historyList = document.getElementById("historyList");
  if (historyList) {
    const icons = ["1x_small","3x_small","7x_small","11x_small","loot_small","wild_small","5050_small"];
    historyList.innerHTML = icons.slice(0,10).map(n => (
      `<div class="history-item"><img class="history-icon" src="/images/history/${n}.png" alt=""></div>`
    )).join("");
  }
})();
