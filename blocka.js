/* ===========================
   BLOCKA – Canvas + Animaciones de rotación (FIX bordes/recortes)
   =========================== */

const IMAGE_BANK = [
  "img/blocka/fotoJuego.jpg",
  "img/blocka/assassin-s-creed-3.jpg",
   "img/blocka/god3.webp",
    "img/blocka/gta6.jpg",
     "img/blocka/hogwarts-legacy.jpg",
      "img/blocka/mario.webp",
      "img/blocka/minecraft.jpeg",
   
  
].filter(Boolean);

const LEVELS = [
  { shuffle: false, filters: ["grayscale(1)"], timeLimitMs: null },
  { shuffle: true,  filters: ["brightness(0.3)", "brightness(0.3)"], timeLimitMs: 20_000 },
  { shuffle: true,  filters: ["invert(1)", "grayscale(1)", "brightness(0.3)"], timeLimitMs: 15_000 }
];

/* ====== Ajustes de animación ====== */
const ROTATE_MS = 240;
const BLUR_TAPS = 5;
const POP_SCALE = 0.06;
const EASING = t => 1 - Math.pow(1 - t, 3); // easeOutCubic

/* ====== DOM ====== */
const grid          = document.getElementById("grid");
const btnComenzar   = document.getElementById("btnJugar");
const btnReiniciar  = document.getElementById("btnReiniciar");
const btnSiguiente  = document.getElementById("btnSiguiente");
const nivelSpan     = document.getElementById("nivel");
const nivelesTotalesSpan = document.getElementById("nivelesTotales");
const minSpan = document.getElementById("min");
const segSpan = document.getElementById("seg");
const msSpan  = document.getElementById("ms");
const recordSpan = document.getElementById("record");
const thumbs = document.getElementById("thumbs");

/* ====== Estado ====== */
let levelIndex = 0;
let imageSrc = null;
let lastImageSrc = null;
let startTime = 0;
let timerId = null;
let running = false;

let rotation  = [0,0,0,0];
let order     = [0,1,2,3];
let currentImg = null;
let resizeObs  = null;

// Animaciones por slot: {from,to,start,dur}
let anims   = [null,null,null,null];
let animRAF = 0;

// Thumbs
let thumbNodes = [];
let isChoosing = false;

/* ====== Utils ====== */
const randItem = arr => arr[Math.floor(Math.random()*arr.length)];
const shuffled = arr => arr.slice().sort(() => Math.random() - 0.5);
const randRot  = () => [0,90,180,270][Math.floor(Math.random()*4)];
const fmt2 = n => n.toString().padStart(2,"0");
const snap90 = deg => ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
const fmt3 = n => n.toString().padStart(3,"0");
const normDeg = d => (d % 360 + 360) % 360;
const closeToZero = (deg, eps = 0.5) => {
  const d = normDeg(deg);
  return d < eps || Math.abs(d - 360) < eps;
};
function storageKey(){ return "blocka_record_lvl_" + (levelIndex+1); }
function updateRecordUI(){
  const rec = localStorage.getItem(storageKey());
  if (recordSpan) recordSpan.textContent = rec || "—";
}
function timeToMs(t){
  const [mm, rest] = t.split(":");
  const [ss, mmm] = rest.split(".");
  return (parseInt(mm)*60 + parseInt(ss))*1000 + parseInt(mmm);
}
function trySaveRecord(){
  if (!minSpan || !segSpan || !msSpan) return;
  const now = `${minSpan.textContent}:${segSpan.textContent}.${msSpan.textContent}`;
  const prev = localStorage.getItem(storageKey());
  if (!prev || timeToMs(now) < timeToMs(prev)){
    localStorage.setItem(storageKey(), now);
    updateRecordUI();
  }
}

/* ====== Imagen & filtros ====== */
function loadImage(src){
  return new Promise((res, rej) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}
function filterForSlot(slot){
  const arr = LEVELS[levelIndex].filters || [];
  if (!arr.length) return "";
  return arr.length === 1 ? arr[0] : arr[slot % arr.length];
}

/* ====== Recorte global (cover) para evitar bandas y recortes incoherentes ====== */
let globalCrop = null; // {sx, sy, sw, sh}

function computeGlobalCrop(img, cols, rows) {
  const desired = cols / rows;
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const srcAspect = srcW / srcH;

  let sw, sh, sx, sy;
  if (srcAspect > desired) {
    sh = srcH;
    sw = Math.round(sh * desired);
    sx = Math.round((srcW - sw) / 2);
    sy = 0;
  } else {
    sw = srcW;
    sh = Math.round(sw / desired);
    sx = 0;
    sy = Math.round((srcH - sh) / 2);
  }
  return { sx, sy, sw, sh };
}

/* ====== Dibujo Canvas (con DPI + bleed + recorte global + clip) ====== */
function drawCanvasTile(ctx, img, quadIndex, deg, filterStr, scale = 1) {
  const cssW = ctx.canvas.clientWidth  || 100;
  const cssH = ctx.canvas.clientHeight || 100;
  const dpr  = window.devicePixelRatio || 1;

  // DPI correcto
  const needW = Math.round(cssW * dpr);
  const needH = Math.round(cssH * dpr);
  if (ctx.canvas.width !== needW || ctx.canvas.height !== needH) {
    ctx.canvas.width  = needW;
    ctx.canvas.height = needH;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const w = cssW, h = cssH;

  // Recorte global basado en la grilla actual
  if (!globalCrop) globalCrop = computeGlobalCrop(img, gridCols, gridRows);
  const { sx: gx, sy: gy, sw: gw, sh: gh } = globalCrop;

  // Sub-rect del cuadrante dentro del recorte global:
  const col = quadIndex % gridCols;
  const row = Math.floor(quadIndex / gridCols);
  const srcTileW = gw / gridCols;
  const srcTileH = gh / gridRows;
  const sx = Math.round(gx + col * srcTileW);
  const sy = Math.round(gy + row * srcTileH);

  ctx.clearRect(0, 0, w, h);
  ctx.save();

  // Clip duro al canvas (evita fantasmas en esquinas redondeadas)
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();

  if (ctx.filter !== undefined && filterStr) ctx.filter = filterStr;

  // Centro + rotación
  ctx.translate(w / 2, h / 2);
  ctx.rotate((deg * Math.PI) / 180);
  if (scale !== 1) ctx.scale(scale, scale);
  ctx.translate(-w / 2, -h / 2);

  // Bleed grande para tapar costuras al girar
  const BLEED = 16;
  const bleedX = (BLEED / w) * srcTileW;
  const bleedY = (BLEED / h) * srcTileH;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.translate(-0.5, -0.5); // micro ajuste anti subpíxel

  ctx.drawImage(
    img,
    sx - bleedX,           sy - bleedY,
    srcTileW + bleedX*2,  srcTileH + bleedY*2,
    -BLEED,               -BLEED,
    w + BLEED*2,          h + BLEED*2
  );

  ctx.restore();
}

/* Redibuja 1 ficha. Si está animando, interpola y aplica motion blur */
function redrawTile(slot){
  const tile = grid.children[slot];
  if (!tile || !currentImg) return;

  const canvas = tile._canvas;
  const ctx = canvas.getContext("2d");
  const quadIndex = order[slot];
  const a = anims[slot];

  if (a){
    const now = performance.now();
    let t = Math.min(1, (now - a.start) / a.dur);
    const e = EASING(t);

    let diff = normDeg(a.to - a.from);
    if (diff > 180) diff -= 360;
    const degNow = normDeg(a.from + diff * e);

    const scl = 1 + POP_SCALE * Math.sin(Math.PI * e);

    if (BLUR_TAPS > 0){
      ctx.save();
      for (let i = BLUR_TAPS; i >= 0; i--){
        const f = i / (BLUR_TAPS + 1);
        const eTap = EASING(Math.max(0, t - f * 0.08));
        const degTap = normDeg(a.from + diff * eTap);
        ctx.globalAlpha = i === 0 ? 1 : 0.12;
        drawCanvasTile(ctx, currentImg, quadIndex, degTap, filterForSlot(slot), scl);
      }
      ctx.restore();
    } else {
      drawCanvasTile(ctx, currentImg, quadIndex, degNow, filterForSlot(slot), scl);
    }

    const level = LEVELS[levelIndex];
    const okPlace = (!level.shuffle) || (order[slot] === slot);
    tile.classList.toggle("correct", okPlace && closeToZero(degNow));

    if (t >= 1){
      anims[slot] = null;
      rotation[slot] = snap90(rotation[slot]);
      drawCanvasTile(ctx, currentImg, quadIndex, rotation[slot], filterForSlot(slot), 1);
      markCorrects();
      if (!anims.some(Boolean)) checkWin();
    }
    return;
  }

  // sin animación
  drawCanvasTile(ctx, currentImg, quadIndex, rotation[slot], filterForSlot(slot), 1);

  const level = LEVELS[levelIndex];
  const okRotation = closeToZero(rotation[slot]);
  const okPlace = (!level.shuffle) || (order[slot] === slot);
  tile.classList.toggle("correct", okRotation && okPlace);
}

function redrawAll(){
  for (let i = 0; i < grid.children.length; i++) redrawTile(i);
}

/* ====== Timer ====== */
if (nivelesTotalesSpan) nivelesTotalesSpan.textContent = String(LEVELS.length);

function startTimer(){ startTime = performance.now(); running = true; tick(); }
function stopTimer(){ running = false; if (timerId) cancelAnimationFrame(timerId); }
function tick(){
  if (!running) return;

  const elapsed = performance.now() - startTime;
  const limit = LEVELS[levelIndex].timeLimitMs ?? null;

  if (limit && minSpan && segSpan && msSpan){
    const remain = Math.max(0, limit - elapsed);
    const ms = Math.floor(remain % 1000);
    const s  = Math.floor(remain / 1000) % 60;
    const m  = Math.floor(remain / 60000);
    minSpan.textContent = fmt2(m);
    segSpan.textContent = fmt2(s);
    msSpan.textContent  = fmt3(ms);

    const timeEl = document.querySelector(".time");
    if (remain <= 10_000) timeEl?.classList.add("danger");
    else timeEl?.classList.remove("danger");

    if (remain <= 0) { onTimeout(); return; }
  } else if (minSpan && segSpan && msSpan){
    const ms = Math.floor(elapsed % 1000);
    const s  = Math.floor(elapsed / 1000) % 60;
    const m  = Math.floor(elapsed / 60000);
    minSpan.textContent = fmt2(m);
    segSpan.textContent = fmt2(s);
    msSpan.textContent  = fmt3(ms);
  }

  timerId = requestAnimationFrame(tick);
}

/* === Grid dinámico por cantidad de piezas === */
const GRID_PRESETS = {
  4:  { cols: 2, rows: 2 },
  6:  { cols: 3, rows: 2 },
  8:  { cols: 4, rows: 2 },
};
let gridCols = 2, gridRows = 2;
let pieceCount = 4;
const pieceSelect = document.getElementById('pieceCount');

pieceSelect?.addEventListener('change', async (e) => {
  const n = parseInt(e.target.value, 10);
  applyGridPreset(n);
  await setupLevel(true); // preview sin timer
});

function updateGridAspect() {
  // El tablero toma la misma relación cols/rows (adiós 1:1 fijo)
  grid.style.aspectRatio = `${gridCols} / ${gridRows}`;
}

function applyGridPreset(n) {
  const p = GRID_PRESETS[n] || GRID_PRESETS[4];
  gridCols = p.cols; gridRows = p.rows;
  pieceCount = gridCols * gridRows;
  updateGridAspect();
}
applyGridPreset(4);

function onTimeout(){
  stopTimer(); running = false;
  [...grid.children].forEach(t => { t.setAttribute("draggable","false"); t.style.pointerEvents="none"; });
  grid.classList.add("lost");
  const timeEl = document.querySelector(".time");
  timeEl?.classList.remove("danger"); timeEl?.classList.add("timeout");
  if (btnReiniciar) btnReiniciar.disabled = false;
  if (btnSiguiente) btnSiguiente.disabled = true;
}

/* ====== Thumbnails ====== */
function renderThumbs(){
  if (!thumbs) return;
  thumbs.innerHTML = "";
  thumbNodes = IMAGE_BANK.map((src, i) => {
    const img = document.createElement("img");
    img.src = src; img.alt = "Imagen banco " + (i+1); img.dataset.src = src;
    img.addEventListener("click", () => {
      if (isChoosing || running) return;
      imageSrc = src; highlightActiveThumb(); setupLevel(true);
    });
    thumbs.appendChild(img);
    return img;
  });
}
function highlightActiveThumb(){
  if (!thumbs) return;
  thumbNodes.forEach(n => n.classList.toggle("active", imageSrc && (n.dataset.src === imageSrc)));
}
function chooseImageWithAnimation(){
  return new Promise(resolve => {
    if (!thumbs || thumbNodes.length === 0){
      let choice;
      do { choice = randItem(IMAGE_BANK); } while (choice === lastImageSrc && IMAGE_BANK.length > 1);
      resolve(choice); return;
    }
    isChoosing = true; btnComenzar && (btnComenzar.disabled = true);
    let targetSrc;
    do { targetSrc = randItem(IMAGE_BANK); } while (targetSrc === lastImageSrc && IMAGE_BANK.length > 1);

    const totalSpinsMs = 1200, baseStepMs = 90;
    let elapsed = 0, idx = 0;
    const timer = setInterval(() => {
      elapsed += baseStepMs;
      thumbNodes.forEach(n => n.classList.remove("active","roulette"));
      const node = thumbNodes[idx % thumbNodes.length];
      node.classList.add("active","roulette");
      idx++;
      if (elapsed >= totalSpinsMs){
        clearInterval(timer);
        const finalIndex = IMAGE_BANK.findIndex(s => s === targetSrc);
        thumbNodes.forEach(n => n.classList.remove("active","roulette"));
        if (finalIndex >= 0) thumbNodes[finalIndex].classList.add("active");
        isChoosing = false; btnComenzar && (btnComenzar.disabled = false);
        resolve(targetSrc);
      }
    }, baseStepMs);
  });
}

/* ====== Rotación con animación ====== */
function getCurrentDeg(slot){
  const a = anims[slot];
  if (!a) return rotation[slot];
  const now = performance.now();
  const t = Math.min(1, (now - a.start) / a.dur);
  const e = EASING(t);
  let diff = normDeg(a.to - a.from);
  if (diff > 180) diff -= 360;
  return normDeg(a.from + diff * e);
}

function rotate(slot, delta){
  if (!running) return;

  const current = getCurrentDeg(slot);
  const target  = snap90(current + delta);

  rotation[slot] = target;

  anims[slot] = { from: normDeg(current), to: target, start: performance.now(), dur: ROTATE_MS };
  if (!animRAF) animationLoop();
}

function animationLoop(){
  animRAF = requestAnimationFrame(() => {
    let any = false;
    for (let i = 0; i < anims.length; i++){
      if (anims[i]) any = true;
      redrawTile(i);
    }
    if (any){
      animationLoop();
    } else {
      animRAF = 0;
      markCorrects(); checkWin();
    }
  });
}

/* ====== Correctos & Win ====== */
function markCorrects(){
  for (let slot = 0; slot < pieceCount; slot++){
    const tile = grid.children[slot];
    if (!tile) continue;
    const okRotation = closeToZero(rotation[slot]);
    tile.classList.toggle("correct", okRotation);
  }
}

function checkWin(){
  if (anims.some(Boolean)) return;

  const allZero = rotation.every(r => closeToZero(r));

  if (allZero){
    rotation = rotation.map(snap90);
    stopTimer();

    // Redibujo sin filtros al ganar
    for (let i = 0; i < pieceCount; i++) {
      const tile = grid.children[i];
      const ctx = tile?._canvas?.getContext("2d");
      if (ctx) drawCanvasTile(ctx, currentImg, order[i], rotation[i], "", 1);
    }

    btnSiguiente && (btnSiguiente.disabled = levelIndex >= LEVELS.length - 1);
    btnReiniciar && (btnReiniciar.disabled = false);

    trySaveRecord();
    if (levelIndex >= LEVELS.length - 1) {
      triggerWinFX();
    } else {
      btnSiguiente && (btnSiguiente.disabled = false);
    }
  }
}

function triggerWinFX(){
  grid.classList.add('won');

  const flash = document.createElement('div');
  flash.className = 'win-flash';
  (grid.parentElement || grid).style.position ||= 'relative';
  (grid.parentElement || grid).appendChild(flash);
  requestAnimationFrame(() => flash.classList.add('on'));
  setTimeout(() => flash.classList.remove('on'), 320);
  setTimeout(() => flash.remove(), 700);

  const tiles = [...grid.children];
  tiles.forEach((t, i) => {
    setTimeout(() => {
      t.classList.add('win-pop');
      t.style.boxShadow = '0 12px 40px rgba(236,72,153,.25)';
      setTimeout(() => t.classList.remove('win-pop'), 360);
    }, i * 60);
  });

  simpleConfettiOver(grid, 900);

  const live = document.createElement('div');
  live.setAttribute('role','status');
  live.setAttribute('aria-live','polite');
  live.style.position = 'absolute';
  live.style.width = '1px'; live.style.height = '1px';
  live.style.overflow = 'hidden'; live.style.clipPath = 'inset(50%)';
  live.textContent = '¡Ganaste! Puzzle resuelto.';
  (grid.parentElement || grid).appendChild(live);
  setTimeout(() => live.remove(), 1500);

  const banner = document.createElement('div');
  banner.className = 'win-banner';
  banner.textContent = '¡Ganaste! 🎉';
  (grid.parentElement || grid).appendChild(banner);
  setTimeout(() => banner.remove(), 1800);

  if (navigator.vibrate) navigator.vibrate([20, 30, 20]);
}

function simpleConfettiOver(target, durationMs=1000){
  const rect = target.getBoundingClientRect();
  const c = document.createElement('canvas');
  c.width = rect.width; c.height = rect.height;
  c.style.position = 'absolute';
  c.style.left = rect.left + 'px';
  c.style.top  = rect.top  + 'px';
  c.style.pointerEvents = 'none';
  c.style.zIndex = 9999;

  document.body.appendChild(c);
  const ctx = c.getContext('2d');

  const N = 60;
  const parts = Array.from({length:N}, () => ({
    x: Math.random()*c.width,
    y: -10 - Math.random()*40,
    vx: (Math.random()-0.5)*1.2,
    vy: 1 + Math.random()*2.4,
    r: 2 + Math.random()*3.5,
    rot: Math.random()*Math.PI,
    vr: (Math.random()-0.5)*0.2,
    col: ['#EC4899','#22D3EE','#FDE047'][Math.floor(Math.random()*3)]
  }));

  const t0 = performance.now();
  function tick(){
    const t = performance.now() - t0;
    ctx.clearRect(0,0,c.width,c.height);
    parts.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.02;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x,p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.col;
      ctx.fillRect(-p.r, -p.r, p.r*2, p.r*2);
      ctx.restore();
    });
    if (t < durationMs) requestAnimationFrame(tick);
    else c.remove();
  }
  requestAnimationFrame(tick);
}

/* ====== Construir nivel ====== */
async function setupLevel(preview = false) {
  const level = LEVELS[levelIndex];
  if (nivelSpan) nivelSpan.textContent = String(levelIndex + 1);

  if (!imageSrc) imageSrc = randItem(IMAGE_BANK);
  currentImg = await loadImage(imageSrc);

  // Actualizar aspect-ratio del tablero y recorte global para esta grilla
  updateGridAspect();
  globalCrop = computeGlobalCrop(currentImg, gridCols, gridRows);

  // Orden y rotaciones
  order = [...Array(pieceCount).keys()];
  rotation = Array.from({ length: pieceCount }, () => randRot());
  if (rotation.every(r => r === 0)) rotation[Math.floor(Math.random() * pieceCount)] = 90;
  anims = Array.from({ length: pieceCount }, () => null);

  // Grid
  grid.innerHTML = "";
  grid.style.display = "grid";
  grid.dataset.size = pieceCount; // para que el CSS sepa cuántas fichas hay

  grid.style.gridTemplateColumns = `repeat(${gridCols}, 1fr)`;
  grid.style.gridTemplateRows    = `repeat(${gridRows}, 1fr)`;
  grid.classList.remove("lost");

  for (let slot = 0; slot < pieceCount; slot++) {
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.dataset.index = slot;
    tile.dataset.quad  = order[slot];
    tile.dataset.deg   = rotation[slot];

    const canvas = document.createElement("canvas");
    tile.appendChild(canvas);
    tile._canvas = canvas;

    // Rotaciones
    tile.addEventListener("click", () => rotate(slot, -90));
    tile.addEventListener("contextmenu", (e) => { e.preventDefault(); rotate(slot, +90); });

    grid.appendChild(tile);
  }

  // Primer render
  redrawAll();

  // Reset visual
  document.querySelector(".time")?.classList.remove("danger", "timeout");
  highlightActiveThumb();

  // UI inicial
  btnSiguiente && (btnSiguiente.disabled = true);
  btnReiniciar && (btnReiniciar.disabled = true);
  stopTimer();
  if (minSpan && segSpan && msSpan) {
    minSpan.textContent = "00";
    segSpan.textContent = "00";
    msSpan.textContent  = "000";
  }
  updateRecordUI();

  // Redibujo en responsive
  if (resizeObs) resizeObs.disconnect();
  resizeObs = new ResizeObserver(() => redrawAll());
  resizeObs.observe(grid);
}

/* ====== Botones ====== */
btnComenzar?.addEventListener("click", async () => {
  if (isChoosing) return;
  imageSrc = await chooseImageWithAnimation();
  lastImageSrc = imageSrc;
  await setupLevel();
  startTimer();
  btnReiniciar && (btnReiniciar.disabled = false);
});

// --- REINICIAR: volver siempre al NIVEL 1 ---
btnReiniciar?.addEventListener("click", async () => {
  levelIndex = 0;          // forzamos nivel 1 (index 0)
  // (opcional) si querés que además cambie la imagen, descomentá este bloque:
  // let next;
  // do { next = randItem(IMAGE_BANK); } while (next === imageSrc && IMAGE_BANK.length > 1);
  // imageSrc = lastImageSrc = next;

  await setupLevel();      // reconstruye el tablero con reglas del nivel 1
  startTimer();            // resetea el tiempo y arranca
  btnReiniciar && (btnReiniciar.disabled = false);
  btnSiguiente && (btnSiguiente.disabled = false);
});


btnSiguiente?.addEventListener("click", async () => {
  if (levelIndex < LEVELS.length - 1) levelIndex++;
  let next;
  do { next = randItem(IMAGE_BANK); } while (next === imageSrc && IMAGE_BANK.length > 1);
  imageSrc = lastImageSrc = next;
  await setupLevel();
  startTimer();
});

/* ====== Inicial ====== */
function renderThumbsInit(){
  if (!thumbs) return;
  thumbs.innerHTML = "";
  thumbNodes = IMAGE_BANK.map((src, i) => {
    const img = document.createElement("img");
    img.src = src; img.alt = "Imagen banco " + (i+1); img.dataset.src = src;
    img.addEventListener("click", () => {
      if (isChoosing || running) return;
      imageSrc = src; highlightActiveThumb(); setupLevel(true);
    });
    thumbs.appendChild(img);
    return img;
  });
}
renderThumbsInit();
setupLevel(true);

/* ====== Carrusel (si existe en la página) ====== */
document.querySelectorAll('.carrusel-container').forEach(container => {
  const carrusel = container.querySelector('.carrusel');
  const btnPrev  = container.querySelector('.carrusel-btn.prev');
  const btnNext  = container.querySelector('.carrusel-btn.next');
  const scrollStep = 350;

  btnPrev?.addEventListener('click', () => carrusel?.scrollBy({ left: -scrollStep, behavior: 'smooth' }));
  btnNext?.addEventListener('click', () => carrusel?.scrollBy({ left:  scrollStep, behavior: 'smooth' }));
});
