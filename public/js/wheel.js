// wheel.js — отрисовка колеса и управление раундом
(() => {
  "use strict";
  const { $, url } = window.__wtUtil || { $: (s)=>document.querySelector(s), url:(p)=>new URL(p, location.href).toString() };

  const canvas = $("#wheelCanvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const CX = W/2, CY = H/2, R = Math.min(W,H)/2 - 6;

  const SEGMENTS = [
    "Wild Time","1x","3x","Loot Rush","1x","7x","50&50","1x",
    "3x","11x","1x","3x","Loot Rush","1x","7x","50&50",
    "1x","3x","1x","11x","3x","1x","7x","50&50"
  ];
  const N = SEGMENTS.length;
  const ANG = (Math.PI * 2) / N;

  function drawWheel(activeIndex = -1){
    ctx.clearRect(0,0,W,H);
    ctx.save();
    ctx.translate(CX, CY);

    for (let i = 0; i < N; i++){
      const a0 = i*ANG, a1 = (i+1)*ANG;
      const isBonus = /Wild Time|Loot Rush|50&50/.test(SEGMENTS[i]);
      const base = isBonus ? "#17314a" : "#0f1b29";

      // сектор
      ctx.beginPath();
      ctx.moveTo(0,0);
      ctx.arc(0,0,R, a0, a1);
      ctx.closePath();
      ctx.fillStyle = (i === activeIndex) ? "#1c2d44" : base;
      ctx.strokeStyle = "rgba(255,255,255,.08)";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();

      // подпись
      ctx.save();
      const mid = a0 + ANG/2;
      ctx.rotate(mid);
      ctx.translate(R*0.72, 0);
      ctx.rotate(Math.PI/2);
      ctx.fillStyle = "#e7edf7";
      ctx.font = "bold 14px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(SEGMENTS[i], 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }
  drawWheel();

  // -------- логика раунда --------
  const countNum = $("#countNum");
  const appRoot = $("#appRoot");
  let t = 9, timer;

  async function startRound(){
    // получим исход
    let idx = Math.floor(Math.random()*N);
    try {
      const r = await fetch(url("api/round/start")).then(r => r.json());
      if (r?.ok && Number.isInteger(r.sliceIndex)) idx = r.sliceIndex;
    } catch { /* оффлайн/404 — используем случайный */ }

    // анимация
    appRoot?.classList.add("is-spinning");
    const totalTurns = 5 * 2*Math.PI;
    const targetAngle = (N - idx) * ANG - ANG/2; // под стрелку сверху
    let start = null;

    function tick(ts){
      if (start === null) start = ts;
      const p = Math.min(1, (ts - start)/2600);
      const ease = 1 - Math.pow(1 - p, 3); // cubic-out
      const angle = ease * (totalTurns + targetAngle);

      // повернём сцену
      ctx.save();
      ctx.translate(CX, CY);
      ctx.rotate(angle);
      ctx.translate(-CX, -CY);
      drawWheel();
      ctx.restore();

      if (p < 1) requestAnimationFrame(tick);
      else {
        appRoot?.classList.remove("is-spinning");
        drawWheel(idx);
        // тут можно показать результат / начислить награду
      }
    }
    requestAnimationFrame(tick);
  }

  function loop(){
    clearInterval(timer);
    t = 9; if (countNum) countNum.textContent = String(t);
    timer = setInterval(() => {
      t--;
      if (countNum) countNum.textContent = String(t);
      window.__wtPulse?.("countdown");
      if (t <= 0){
        clearInterval(timer);
        startRound().then(() => setTimeout(loop, 900));
      }
    }, 1000);
  }
  loop();
})();
