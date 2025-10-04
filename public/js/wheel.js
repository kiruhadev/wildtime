// /public/js/wheel.js
// Idle spin + countdown + accelerate + smooth decel to server slice + history-after-stop + clear bets

/* ===== CONFIG (синхронно с сервером) ===== */
const WHEEL_ORDER = [
    'Wild Time','1x','3x','Loot Rush','1x','7x','50&50','1x',
    '3x','11x','1x','3x','Loot Rush','1x','7x','50&50',
    '1x','3x','1x','11x','3x','1x','7x','50&50'
  ];
  
  const COLORS = {
    '1x'       : { fill: '#6f6a00', text: '#fff' },
    '3x'       : { fill: '#6e4200', text: '#fff' },
    '7x'       : { fill: '#0f5a2e', text: '#fff' },
    '11x'      : { fill: '#0a3f64', text: '#fff' },
    '50&50'    : { fill: '#d9197a', text: '#fff' },
    'Loot Rush': { fill: '#6c2bd9', text: '#fff' },
    'Wild Time': { fill: '#c5161d', text: '#fff' }
  };
  const LABELS = { '1x':'1×','3x':'3×','7x':'7×','11x':'11×','50&50':'50&50','Loot Rush':'Loot','Wild Time':'Wild' };
  
  /* ===== DOM refs ===== */
  let canvas, ctx, DPR = 1;
  let betOverlay, historyList, countdownBox, countNumEl;
  let amountBtns = [], betTiles = [];
  
  /* ===== wheel state ===== */
  let currentAngle = 0;      // radians
  let rafId = 0;
  let lastTs = 0;
  
  const SLICE_COUNT   = WHEEL_ORDER.length;
  const SLICE_ANGLE   = (2*Math.PI)/SLICE_COUNT;
  const POINTER_ANGLE = -Math.PI/2; // верх
  
  // скорости
  const IDLE_OMEGA = 0.35;   // рад/сек — постоянное медленное вращение
  const FAST_OMEGA = 9.0;    // рад/сек — «разгон»
  let omega = IDLE_OMEGA;
  
  // фазы: 'betting' | 'accelerate' | 'decelerate'
  let phase = 'betting';
  
  // торможение
  let decel = null; // {start, end, t0, dur, resolve, resultType}
  
  /* ===== ставки ===== */
  const betsMap = new Map(); // seg -> total
  let currentAmount = 0.25;
  
  /* ===== init ===== */
  window.addEventListener('DOMContentLoaded', () => {
    // DOM
    canvas       = document.getElementById('wheelCanvas');
    betOverlay   = document.getElementById('betOverlay');
    historyList  = document.getElementById('historyList');
    countdownBox = document.getElementById('countdown');
    countNumEl   = document.getElementById('countNum') || countdownBox?.querySelector('span');
    amountBtns   = Array.from(document.querySelectorAll('.amount-btn'));
    betTiles     = Array.from(document.querySelectorAll('.bet-tile'));
  
    if (!canvas) return;
  
    // canvas prep
    prepareCanvas();
    drawWheel(currentAngle);
  
    // betting UI
    initBettingUI();
  
    // idle loop
    lastTs = performance.now();
    rafId = requestAnimationFrame(tick);
  
    // start first countdown
    startCountdown(9);
  
    // resize
    window.addEventListener('resize', () => {
      prepareCanvas();
      drawWheel(currentAngle);
    });
  });
  
  /* ===== betting UI ===== */
  function initBettingUI(){
    // текущая сумма из активной кнопки
    const active = amountBtns.find(b => b.classList.contains('active'));
    if (active) currentAmount = parseFloat(active.dataset.amount || '0.25');
  
    amountBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        amountBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentAmount = parseFloat(btn.dataset.amount);
      });
    });
  
    betTiles.forEach(tile => {
      tile.addEventListener('click', () => {
        if (phase !== 'betting') return; // во время спина нельзя
        const seg = tile.dataset.seg;
        const cur = betsMap.get(seg) || 0;
        const next = +(cur + currentAmount).toFixed(2);
        betsMap.set(seg, next);
  
        // бейдж
        let badge = tile.querySelector('.bet-badge');
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'bet-badge';
          tile.appendChild(badge);
        }
        badge.textContent = next;
        badge.hidden = next <= 0;
  
        // вспышка
        tile.classList.add('active');
        setTimeout(() => tile.classList.remove('active'), 160);
      });
    });
  }
  
  /* ===== canvas ===== */
  function prepareCanvas(){
    DPR = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 420;
    const cssH = canvas.clientHeight|| 420;
    canvas.width  = Math.round(cssW * DPR);
    canvas.height = Math.round(cssH * DPR);
    ctx = canvas.getContext('2d');
    ctx.setTransform(DPR,0,0,DPR,0,0);
  }
  
  function drawWheel(angle=0){
    if (!ctx) return;
    const w = canvas.width / DPR, h = canvas.height / DPR;
    const cx = w/2, cy = h/2, R  = Math.min(cx,cy) - 6;
  
    ctx.save();
    ctx.clearRect(0,0,w,h);
  
    // glow
    const g = ctx.createRadialGradient(cx,cy,R*0.25, cx,cy,R);
    g.addColorStop(0,'rgba(0,170,255,.12)');
    g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
  
    ctx.translate(cx,cy);
    ctx.rotate(angle);
  
    for (let i=0; i<SLICE_COUNT; i++){
      const key = WHEEL_ORDER[i];
      const col = COLORS[key] || { fill:'#333', text:'#fff' };
      const a0 = i*SLICE_ANGLE, a1 = a0+SLICE_ANGLE;
  
      // сектор
      ctx.beginPath();
      ctx.moveTo(0,0);
      ctx.arc(0,0,R,a0,a1,false);
      ctx.closePath();
      ctx.fillStyle = col.fill; ctx.fill();
  
      // разделитель
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,255,255,.15)';
      ctx.stroke();
  
      // подпись
      ctx.save();
      const mid = a0 + SLICE_ANGLE/2;
      ctx.rotate(mid);
      ctx.textAlign='right';
      ctx.textBaseline='middle';
      ctx.fillStyle = col.text;
      ctx.font='bold 14px mf, system-ui, sans-serif';
      ctx.fillText(LABELS[key] || key, R-12, 0);
      ctx.restore();
    }
  
    // center cap
    ctx.beginPath(); ctx.arc(0,0,20,0,2*Math.PI);
    ctx.fillStyle='#121212'; ctx.fill();
    ctx.lineWidth=2; ctx.strokeStyle='rgba(255,255,255,.25)'; ctx.stroke();
  
    ctx.restore();
  }
  
  /* ===== anim loop ===== */
  function tick(ts){
    const dt = Math.min(0.033, (ts - lastTs)/1000); // clamp dt
    lastTs = ts;
  
    if (phase === 'decelerate' && decel){
      const t = Math.min(1, (ts - decel.t0) / decel.dur);
      const eased = easeOutCubic(t);
      currentAngle = decel.start + (decel.end - decel.start) * eased;
  
      if (t >= 1){
        // полная остановка
        const typeFinished = decel.resultType;
        const resolveFn = decel.resolve;
        decel = null;
  
        phase = 'betting';
        omega = IDLE_OMEGA;
        setBetPanel(true);
  
        // теперь, КОГДА точно остановились:
        if (typeFinished) pushHistory(typeFinished);
        clearBets();
        // новый отсчёт
        startCountdown(9);
  
        // разрезолвим промис
        resolveFn && resolveFn();
      }
    } else {
      // idle / accelerate — крутим равномерно
      currentAngle += omega * dt;
    }
  
    drawWheel(currentAngle);
    rafId = requestAnimationFrame(tick);
  }
  
  /* ===== countDown ===== */
  let cInt = null;
  function startCountdown(sec=9){
    if (!countdownBox || !countNumEl) return; // без UI — просто idle
  
    stopCountdown();
    phase = 'betting';
    omega = IDLE_OMEGA;
    setBetPanel(true);
  
    countdownBox.classList.add('visible');
    let left = sec;
    countNumEl.textContent = String(left);
  
    cInt = setInterval(async () => {
      left--;
      if (left >= 0) {
        countNumEl.textContent = String(left);
        // лёгкий пульс
        countdownBox.classList.remove('pulse'); void countdownBox.offsetWidth; countdownBox.classList.add('pulse');
      }
      if (left <= 0) {
        stopCountdown();
  
        // ускоряемся
        phase = 'accelerate';
        setBetPanel(false);
        await accelerateTo(FAST_OMEGA, 1200);
  
        // берём исход
        const { sliceIndex, type } = await fetchRoundOutcome();
  
        // «долго и плавно» тормозим 5–7с
        const dur = 5000 + Math.floor(Math.random()*2000);
        await decelerateToSlice(sliceIndex, dur, 4, type);
  
        // дальше всё произойдёт в tick() после полной остановки
      }
    }, 1000);
  }
  function stopCountdown(){
    if (cInt) clearInterval(cInt);
    cInt = null;
  }
  
  /* ===== accel/decel ===== */
  function accelerateTo(targetOmega=FAST_OMEGA, ms=1200){
    return new Promise(res=>{
      const start = omega;
      const t0 = performance.now();
      const step = ()=>{
        const t = Math.min(1, (performance.now()-t0)/ms);
        const eased = easeInQuad(t);
        omega = start + (targetOmega - start)*eased;
        if (t < 1) requestAnimationFrame(step);
        else res();
      };
      requestAnimationFrame(step);
    });
  }
  
  function decelerateToSlice(sliceIndex, ms=6000, extraTurns=4, typeForHistory=null){
    return new Promise(resolve=>{
      const sliceCenter = sliceIndex*SLICE_ANGLE + SLICE_ANGLE/2;
      const deltaToTarget =
        normalizeAngle(POINTER_ANGLE - (currentAngle % (2*Math.PI)) - sliceCenter);
      const endAngle = currentAngle + deltaToTarget + extraTurns*2*Math.PI;
      decel = { start: currentAngle, end: endAngle, t0: performance.now(), dur: ms, resolve, resultType: typeForHistory };
      phase = 'decelerate';
    });
  }
  
  /* ===== server outcome (fallback) ===== */
  async function fetchRoundOutcome(){
    try{
      const r = await fetch('/api/round/start', { cache: 'no-store' });
      const data = await r.json();
      if (data?.ok) return data; // { sliceIndex, type, ... }
    }catch(e){}
    // fallback локально
    const sliceIndex = Math.floor(Math.random()*SLICE_COUNT);
    const type = WHEEL_ORDER[sliceIndex];
    return { sliceIndex, type, ok:true };
  }
  
  /* ===== helpers ===== */
  function normalizeAngle(a){
    while (a <= -Math.PI) a += 2*Math.PI;
    while (a > Math.PI)   a -= 2*Math.PI;
    return a;
  }
  function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }
  function easeInQuad(t){ return t*t; }
  
  /* ===== bet panel modes ===== */
  function setBetPanel(enable){
    if (!betOverlay) return;
    if (enable){
      betOverlay.classList.remove('disabled');
      betOverlay.style.opacity = '1';
    } else {
      betOverlay.classList.add('disabled');
      betOverlay.style.opacity = '.55';
    }
  }
  
  /* ===== history & clear bets ===== */
  function pushHistory(typeKey){
    if (!historyList) return;
    const item = document.createElement('div');
    item.className = 'history-item';
    item.textContent = LABELS[typeKey] || typeKey;
    item.style.background = (COLORS[typeKey]?.fill)||'#444';
    item.style.color='#fff';
    item.style.padding='6px 10px';
    item.style.borderRadius='8px';
    item.style.font='600 12px/1 mf,system-ui,sans-serif';
    item.style.marginRight='6px';
    historyList.prepend(item);
    const all = historyList.querySelectorAll('.history-item');
    if (all.length>20) all[all.length-1].remove();
  }
  
  function clearBets(){
    betsMap.clear();
    betTiles.forEach(tile=>{
      const badge = tile.querySelector('.bet-badge');
      if (badge) { badge.textContent = '0'; badge.hidden = true; }
      tile.classList.remove('active');
    });
  }
  