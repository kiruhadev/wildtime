// app.js — УСИЛЕННЫЙ: делегирование событий + защита от оверлеев
(() => {
  "use strict";

  // utils
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const url = (p) => new URL(p, location.href).toString();
  window.__wtUtil = { $, $$, url };

  // показать страницу
  function showPage(id){
    $$(".page").forEach(p => p.classList.remove("page-active"));
    $("#"+id)?.classList.add("page-active");
    $$(".bottom-nav .nav-item").forEach(b => b.classList.toggle("active", b.dataset.target === id));
  }

  // Делегируем клики на весь документ (и touchstart)
  function onTap(e){
    const target = e.target.closest?.(".bottom-nav .nav-item, #userPill, [data-open-deposit], #depClose, .sheet__backdrop");
    if (!target) return;

    // если поверх открыт шит, пропускаем только его кнопки
    const sheetOpen = $("#depositSheet")?.classList.contains("sheet--open");
    if (sheetOpen && !target.closest("#depositSheet")) {
      e.preventDefault(); e.stopPropagation(); return;
    }

    if (target.matches(".bottom-nav .nav-item")){
      const id = target.dataset.target;
      if (id) { e.preventDefault(); showPage(id); }
    }
    else if (target.matches("#userPill")){
      e.preventDefault(); showPage("profilePage");
    }
    else if (target.matches("[data-open-deposit]")){
      e.preventDefault();
      $("#depositSheet")?.classList.add("sheet--open");
      $("#depositSheet")?.setAttribute("aria-hidden","false");
    }
    else if (target.matches("#depClose, .sheet__backdrop")){
      e.preventDefault();
      $("#depositSheet")?.classList.remove("sheet--open");
      $("#depositSheet")?.setAttribute("aria-hidden","true");
    }
  }
  document.addEventListener("click", onTap, true);
  document.addEventListener("touchstart", onTap, { passive: false, capture: true });

  // История — наполняем безопасно
  const historyList = $("#historyList");
  if (historyList) {
    const names = ["1x_small","3x_small","7x_small","11x_small","loot_small","wild_small","5050_small"];
    historyList.innerHTML = names.map(n => (
      `<button type="button" class="history-item">
         <img class="history-icon" src="${url(`images/history/${n}.png`)}" alt="">
       </button>`
    )).join("");
  }

  // «пульс» для таймера (wheel.js вызывает)
  window.__wtPulse = (id = "countdown") => {
    const el = $("#"+id);
    if (!el) return;
    el.classList.add("pulse");
    setTimeout(() => el.classList.remove("pulse"), 250);
  };

  // Пинг для отладки
  console.log("✅ app.js ready");
})();
