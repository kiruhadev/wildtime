// /public/js/app.js
(function () {
    const pages = Array.from(document.querySelectorAll('.page'));
    const tabs  = Array.from(document.querySelectorAll('.bottom-nav .nav-item'));
  
    const DEFAULT_PAGE_ID = 'wheelPage';
  
    // Находим страницу по id
    function getPage(id) {
      return document.getElementById(id);
    }
  
    // Показ нужной страницы
    function showPage(id, { pushHash = true, save = true } = {}) {
      // если id не существует — откатываемся на дефолт
      if (!getPage(id)) id = DEFAULT_PAGE_ID;
  
      // Скрыть все страницы
      pages.forEach(p => p.classList.remove('page-active'));
  
      // Показать нужную
      const target = getPage(id);
      if (target) target.classList.add('page-active');
  
      // Обновить активное состояние в навигации
      tabs.forEach(t => t.classList.remove('active'));
      const activeTab = tabs.find(b => b.dataset.target === id);
      if (activeTab) activeTab.classList.add('active');
  
     // Не трогаем глобальный overflow вообще
            document.documentElement.style.overflow = '';
            document.body.style.overflow = '';

  
      // Сохранить выбор (сессия)
      if (save) {
        try { sessionStorage.setItem('wild_active_page', id); } catch (_) {}
      }
  
      // Обновить hash (для прямых ссылок/перезагрузки)
      if (pushHash) {
        try { history.replaceState(null, '', `#${id}`); } catch (_) {}
      }
  
      // Лёгкая тактильная отдача в Telegram (если доступно)
      try {
        window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
      } catch (_) {}
    }
  
    // Навесить обработчики клика на табы
    tabs.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.target;
        if (target) showPage(target);
      }, { passive: true });
    });
  
    // Поддержка перехода по hash вручную (если вдруг меняется извне)
    window.addEventListener('hashchange', () => {
      const id = (location.hash || '').replace('#', '');
      if (id) showPage(id, { pushHash: false });
    });
  
    // Инициализация — приоритет: hash -> sessionStorage -> активная кнопка -> дефолт
    (function init() {
      let startId =
        (location.hash || '').replace('#', '') ||
        (function () { try { return sessionStorage.getItem('wild_active_page'); } catch (_) { return null; } })() ||
        (document.querySelector('.bottom-nav .nav-item.active')?.dataset.target) ||
        DEFAULT_PAGE_ID;
  
      showPage(startId, { pushHash: true, save: true });
  
      // Инициализация Telegram WebApp (без обязательности)
      try {
        const tg = window.Telegram?.WebApp;
        tg?.ready?.();
        // Можно развернуть мини-ап
        tg?.expand?.();
      } catch (_) {}
    })();
  
    // [Опционально] Публичный мини-API (если пригодится из других скриптов)
    window.WildNav = { showPage };
  })();
  