/* ===========================
   BLOCKA – Canvas + Animaciones de rotación (FIX bordes/recortes)
   =========================== */

const IMAGE_BANK = [
  "img/blocka/fotoJuego.jpg",
  "img/blocka/assassin-s-creed-3.jpg",
  "img/blocka/god3.webp",
  "img/blocka/gta6.jpg",
  "img/blocka/hogwarts-legacy.jpeg",
  "img/blocka/mario.webp",
  "img/blocka/minecraft.jpeg",
].filter(Boolean);

const LEVELS = [
  { shuffle: false, filters: ["grayscale(1)"], timeLimitMs: null },
  { shuffle: true, filters: ["brightness(0.3)", "brightness(0.3)"], timeLimitMs: 20_000 },
  { shuffle: true, filters: ["invert(1)", "grayscale(1)", "brightness(0.3)"], timeLimitMs: 15_000 },
  { shuffle: true, filters: ["blurManual"], timeLimitMs: 12_000 },

];

/* ====== Ajustes de animación ====== */
const ROTATE_MS = 240;
const BLUR_TAPS = 5;
const POP_SCALE = 0.06;
const EASING = t => 1 - Math.pow(1 - t, 3); // easeOutCubic
const tileCache = [];

/* ====== DOM ====== */
const grid = document.getElementById("grid");
const btnComenzar = document.getElementById("btnJugar");
const btnReiniciar = document.getElementById("btnReiniciar");
const btnSiguiente = document.getElementById("btnSiguiente");
const nivelSpan = document.getElementById("nivel");
const nivelesTotalesSpan = document.getElementById("nivelesTotales");
const minSpan = document.getElementById("min");
const segSpan = document.getElementById("seg");
const msSpan = document.getElementById("ms");
const recordSpan = document.getElementById("record");
const thumbs = document.getElementById("thumbs");

/* ====== Estado ====== */
let levelIndex = 0;
let imageSrc = null;
let lastImageSrc = null;
let startTime = 0;
let timerId = null;
let running = false;

let rotation = [0, 0, 0, 0];
let order = [0, 1, 2, 3];
let currentImg = null;
let resizeObs = null;

// Animaciones por slot: {from,to,start,dur}
let anims = [null, null, null, null];
let animRAF = 0;

// Thumbs
let thumbNodes = [];
let isChoosing = false;

/* ====== Utils ====== */
const randItem = arr => arr[Math.floor(Math.random() * arr.length)];
const shuffled = arr => arr.slice().sort(() => Math.random() - 0.5);
const randRot = () => [0, 90, 180, 270][Math.floor(Math.random() * 4)];
const fmt2 = n => n.toString().padStart(2, "0");
const snap90 = deg => ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
const fmt3 = n => n.toString().padStart(3, "0");
const normDeg = d => (d % 360 + 360) % 360;
const closeToZero = (deg, eps = 0.5) => {
  const d = normDeg(deg);
  return d < eps || Math.abs(d - 360) < eps;
};

function storageKey() { return "blocka_record_lvl_" + (levelIndex + 1); }

function updateRecordUI() {
  const rec = localStorage.getItem(storageKey());
  if (recordSpan) recordSpan.textContent = rec || "—";
}

function timeToMs(t) {
  const [mm, rest] = t.split(":");
  const [ss, mmm] = rest.split(".");
  return (parseInt(mm) * 60 + parseInt(ss)) * 1000 + parseInt(mmm);
}

function trySaveRecord() {
  if (!minSpan || !segSpan || !msSpan) return;
  const now = `${minSpan.textContent}:${segSpan.textContent}.${msSpan.textContent}`;
  const prev = localStorage.getItem(storageKey());
  if (!prev || timeToMs(now) < timeToMs(prev)) {
    localStorage.setItem(storageKey(), now);
    updateRecordUI();
  }
}

/* ====== Imagen & filtros ====== */
function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}

function filterForSlot(slot) {
  const arr = LEVELS[levelIndex].filters || [g];
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
function drawBufferRotated(ctx, bufferCanvas, deg, scale = 1) {
  const cssW = ctx.canvas.clientWidth || 100;
  const cssH = ctx.canvas.clientHeight || 100;
  const dpr = window.devicePixelRatio || 1;
  const needW = Math.round(cssW * dpr), needH = Math.round(cssH * dpr);
  if (ctx.canvas.width !== needW || ctx.canvas.height !== needH) {
    ctx.canvas.width = needW; ctx.canvas.height = needH; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const w = cssW, h = cssH;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();

  ctx.translate(w / 2, h / 2);
  ctx.rotate((deg * Math.PI) / 180);
  if (scale !== 1) ctx.scale(scale, scale);
  ctx.translate(-w / 2, -h / 2);

  // “cover” dentro del tile: estiramos el subcanva a llenar el tile visible
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bufferCanvas, 0, 0, bufferCanvas.width, bufferCanvas.height, 0, 0, w, h);
  ctx.restore();
}


/* Redibuja 1 ficha. Si está animando, interpola y aplica motion blur */
function redrawTile(slot) {
  const tile = grid.children[slot];
  if (!tile) return;
  const canvas = tile._canvas;
  const ctx = canvas.getContext('2d');
  const a = anims[slot];
  const buf = tileCache[slot]?.filteredCanvas;
  if (!buf) return;

  if (a) {
    const now = performance.now();
    let t = Math.min(1, (now - a.start) / a.dur);
    const e = EASING(t);
    let diff = normDeg(a.to - a.from); if (diff > 180) diff -= 360;
    const degNow = normDeg(a.from + diff * e);
    const scl = 1 + POP_SCALE * Math.sin(Math.PI * e);

    if (BLUR_TAPS > 0) {
      ctx.save();
      for (let i = BLUR_TAPS; i >= 0; i--) {
        const f = i / (BLUR_TAPS + 1);
        const eTap = EASING(Math.max(0, t - f * 0.08));
        const degTap = normDeg(a.from + diff * eTap);
        ctx.globalAlpha = i === 0 ? 1 : 0.12;
        drawBufferRotated(ctx, buf, degTap, scl);
      }
      ctx.restore();
    } else {
      drawBufferRotated(ctx, buf, degNow, scl);
    }

    if (t >= 1) {
      anims[slot] = null;
      rotation[slot] = snap90(rotation[slot]);
      drawBufferRotated(ctx, buf, rotation[slot], 1);
      markCorrects(); if (!anims.some(Boolean)) checkWin();
    }
    return;
  }

  drawBufferRotated(ctx, buf, rotation[slot], 1);

  const level = LEVELS[levelIndex];
  const okRotation = closeToZero(rotation[slot]);
  const okPlace = (!level.shuffle) || (order[slot] === slot);
  tile.classList.toggle("correct", okRotation && okPlace);
}

function redrawAll() {
  for (let i = 0; i < grid.children.length; i++) redrawTile(i);
}

/* ====== Timer ====== */
if (nivelesTotalesSpan) nivelesTotalesSpan.textContent = String(LEVELS.length);

function startTimer() { startTime = performance.now(); running = true; tick(); }
function stopTimer() { running = false; if (timerId) cancelAnimationFrame(timerId); }
function tick() {
  if (!running) return;

  const elapsed = performance.now() - startTime;
  const limit = LEVELS[levelIndex].timeLimitMs ?? null;

  if (limit && minSpan && segSpan && msSpan) {
    const remain = Math.max(0, limit - elapsed);
    const ms = Math.floor(remain % 1000);
    const s = Math.floor(remain / 1000) % 60;
    const m = Math.floor(remain / 60000);
    minSpan.textContent = fmt2(m);
    segSpan.textContent = fmt2(s);
    msSpan.textContent = fmt3(ms);

    const timeEl = document.querySelector(".time");
    if (remain <= 10_000) timeEl?.classList.add("danger");
    else timeEl?.classList.remove("danger");

    if (remain <= 0) { onTimeout(); return; }
  } else if (minSpan && segSpan && msSpan) {
    const ms = Math.floor(elapsed % 1000);
    const s = Math.floor(elapsed / 1000) % 60;
    const m = Math.floor(elapsed / 60000);
    minSpan.textContent = fmt2(m);
    segSpan.textContent = fmt2(s);
    msSpan.textContent = fmt3(ms);
  }

  timerId = requestAnimationFrame(tick);
}

/* === Grid dinámico por cantidad de piezas === */
const GRID_PRESETS = {
  4: { cols: 2, rows: 2 },
  6: { cols: 3, rows: 2 },
  8: { cols: 4, rows: 2 },
};
let gridCols = 2, gridRows = 2;
let pieceCount = 4;
const pieceSelect = document.getElementById('pieceCount');

pieceSelect?.addEventListener('change', async (e) => {
  const n = parseInt(e.target.value, 10);
  applyGridPreset(n);
  await setupLevel(true); // preview sin timer
});

function applyGridPreset(n) {
  const p = GRID_PRESETS[n] || GRID_PRESETS[4];
  gridCols = p.cols;
  gridRows = p.rows;
  pieceCount = gridCols * gridRows;
}

applyGridPreset(4);

function onTimeout() {
  stopTimer(); running = false;
  [...grid.children].forEach(t => { t.setAttribute("draggable", "false"); t.style.pointerEvents = "none"; });
  grid.classList.add("lost");
  const timeEl = document.querySelector(".time");
  timeEl?.classList.remove("danger"); timeEl?.classList.add("timeout");
  if (btnSiguiente) btnSiguiente.disabled = true;
}


/* ====== Thumbnails ====== */
function renderThumbs() {
  if (!thumbs) return;
  thumbs.innerHTML = "";
  thumbNodes = IMAGE_BANK.map((src, i) => {
    const img = document.createElement("img");
    img.src = src; img.alt = "Imagen banco " + (i + 1); img.dataset.src = src;
    img.addEventListener("click", () => {
      if (isChoosing || running) return;
      imageSrc = src; highlightActiveThumb(); setupLevel(true);
    });
    thumbs.appendChild(img);
    return img;
  });
}

function highlightActiveThumb() {
  if (!thumbs) return;
  thumbNodes.forEach(n => n.classList.toggle("active", imageSrc && (n.dataset.src === imageSrc)));
}

function chooseImageWithAnimation() {
  return new Promise(resolve => {
    if (!thumbs || thumbNodes.length === 0) {
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
      thumbNodes.forEach(n => n.classList.remove("active", "roulette"));
      const node = thumbNodes[idx % thumbNodes.length];
      node.classList.add("active", "roulette");
      idx++;
      if (elapsed >= totalSpinsMs) {
        clearInterval(timer);
        const finalIndex = IMAGE_BANK.findIndex(s => s === targetSrc);
        thumbNodes.forEach(n => n.classList.remove("active", "roulette"));
        if (finalIndex >= 0) thumbNodes[finalIndex].classList.add("active");
        isChoosing = false; btnComenzar && (btnComenzar.disabled = false);
        resolve(targetSrc);
      }
    }, baseStepMs);
  });
}

/* ====== Rotación con animación ====== */
function getCurrentDeg(slot) {
  const a = anims[slot];
  if (!a) return rotation[slot];
  const now = performance.now();
  const t = Math.min(1, (now - a.start) / a.dur);
  const e = EASING(t);
  let diff = normDeg(a.to - a.from);
  if (diff > 180) diff -= 360;
  return normDeg(a.from + diff * e);
}

function rotate(slot, delta) {
  if (!running) return;

  const current = getCurrentDeg(slot);
  const target = snap90(current + delta);

  rotation[slot] = target;

  anims[slot] = { from: normDeg(current), to: target, start: performance.now(), dur: ROTATE_MS };
  if (!animRAF) animationLoop();
}

function animationLoop() {
  animRAF = requestAnimationFrame(() => {
    let any = false;
    for (let i = 0; i < anims.length; i++) {
      if (anims[i]) any = true;
      redrawTile(i);
    }
    if (any) {
      animationLoop();
    } else {
      animRAF = 0;
      markCorrects(); checkWin();
    }
  });
}

/* ====== Correctos & Win ====== */
function markCorrects() {
  // Verifica si todas las piezas están correctamente orientadas (rotación = 0°)
  const allZero = rotation.every(r => closeToZero(r));
  
  // Si todas están bien → victoria
  if (allZero) {
    rotation = rotation.map(snap90);
    stopTimer();

    // Redibujamos la imagen completa, sin filtros
    for (let i = 0; i < tileCache.length; i++) {
      const tile = tileCache[i];
      const ctx = tile.filteredCanvas.getContext('2d');
      // dibuja la porción original sin filtro ni blur
      const base = extractTileToCanvas(currentImg, order[i], gridCols, gridRows, globalCrop);
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.drawImage(base, 0, 0, ctx.canvas.width, ctx.canvas.height);
    }

    // Redibuja todo el tablero (ahora normal)
    drawBoard();
  }
}


function checkWin() {
  // no revises mientras haya animaciones corriendo
  if (anims.some(Boolean)) return;

  // victoria = todas las rotaciones a 0° (con tolerancia)
  const allZero = rotation.every(r => closeToZero(r));
  if (!allZero) return;

  // normalizar a múltiplos exactos de 90°
  rotation = rotation.map(snap90);

  stopTimer();
  drawBoard(); // redibuja “limpio”

  btnSiguiente && (btnSiguiente.disabled = levelIndex >= LEVELS.length - 1);
  btnReiniciar && (btnReiniciar.disabled = false);

  trySaveRecord();

  if (levelIndex >= LEVELS.length - 1) {
    triggerWinFXOverBoard();
  } else {
    btnSiguiente && (btnSiguiente.disabled = false);
  }
}



function triggerWinFXOverBoard() {
  const parent = board.parentElement || document.body;
  const rect = board.getBoundingClientRect();
  const c = document.createElement('canvas');
  c.width = rect.width; c.height = rect.height;
  Object.assign(c.style, {
    position: 'absolute',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    pointerEvents: 'none',
    zIndex: 9999
  });
  document.body.appendChild(c);
  const ctx = c.getContext('2d');

  const N = 60;
  const parts = Array.from({ length: N }, () => ({
    x: Math.random() * c.width,
    y: -10 - Math.random() * 40,
    vx: (Math.random() - 0.5) * 1.2,
    vy: 1 + Math.random() * 2.4,
    r: 2 + Math.random() * 3.5,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.2,
    col: ['#EC4899', '#22D3EE', '#FDE047'][Math.floor(Math.random() * 3)]
  }));

  const t0 = performance.now();
  (function tick(){
    const t = performance.now() - t0;
    ctx.clearRect(0,0,c.width,c.height);
    parts.forEach(p=>{
      p.x += p.vx; p.y += p.vy; p.vy += 0.02; p.rot += p.vr;
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.col; ctx.fillRect(-p.r,-p.r,p.r*2,p.r*2);
      ctx.restore();
    });
    if (t < 900) requestAnimationFrame(tick); else c.remove();
  })();

  if (navigator.vibrate) navigator.vibrate([20, 30, 20]);
}


function simpleConfettiOver(target, durationMs = 1000) {
  const rect = target.getBoundingClientRect();
  const c = document.createElement('canvas');
  c.width = rect.width; c.height = rect.height;
  c.style.position = 'absolute';
  c.style.left = rect.left + 'px';
  c.style.top = rect.top + 'px';
  c.style.pointerEvents = 'none';
  c.style.zIndex = 9999;

  document.body.appendChild(c);
  const ctx = c.getContext('2d');

  const N = 60;
  const parts = Array.from({ length: N }, () => ({
    x: Math.random() * c.width,
    y: -10 - Math.random() * 40,
    vx: (Math.random() - 0.5) * 1.2,
    vy: 1 + Math.random() * 2.4,
    r: 2 + Math.random() * 3.5,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.2,
    col: ['#EC4899', '#22D3EE', '#FDE047'][Math.floor(Math.random() * 3)]
  }));

  const t0 = performance.now();

  function tick() {
    const t = performance.now() - t0;
    ctx.clearRect(0, 0, c.width, c.height);
    parts.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.02;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.col;
      ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
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
preBlurCanvas = null; // ponelo al comienzo de setupLevel() cuando cambias imagen/nivel

  // elegir/cargar imagen
  if (!imageSrc) imageSrc = randItem(IMAGE_BANK);
  currentImg = await loadImage(imageSrc);

  // recorte global según grilla
  globalCrop = computeGlobalCrop(currentImg, gridCols, gridRows);

  // buffers de tiles (con filtros P2P)
  tileCache.length = 0;
  for (let slot = 0; slot < pieceCount; slot++) {
    tileCache[slot] = {
      filteredCanvas: buildFilteredBufferForSlot(slot, currentImg, gridCols, gridRows, globalCrop)
    };
  }

  // orden y rotaciones
  order = [...Array(pieceCount).keys()];
  rotation = Array.from({ length: pieceCount }, () => randRot());
  if (rotation.every(r => r === 0)) rotation[Math.floor(Math.random() * pieceCount)] = 90;
  anims = Array.from({ length: pieceCount }, () => null);

  // SOLO canvas
  resizeBoardToGrid();
  layoutTilesOnBoard();
  drawBoard();

  // reset UI tiempo/record
  document.querySelector(".time")?.classList.remove("danger", "timeout");
  highlightActiveThumb();
  btnSiguiente && (btnSiguiente.disabled = true);
  stopTimer();
  if (minSpan && segSpan && msSpan) {
    minSpan.textContent = "00";
    segSpan.textContent = "00";
    msSpan.textContent  = "000";
  }
  updateRecordUI();
}


/* ====== Botones ====== */
btnComenzar?.addEventListener("click", async () => {
  if (isChoosing) return;
  imageSrc = await chooseImageWithAnimation();
  lastImageSrc = imageSrc;
  await setupLevel();
  startTimer();
  // btnReiniciar && (btnReiniciar.disabled = false);
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
function renderThumbsInit() {
  if (!thumbs) return;
  thumbs.innerHTML = "";
  thumbNodes = IMAGE_BANK.map((src, i) => {
    const img = document.createElement("img");
    img.src = src; img.alt = "Imagen banco " + (i + 1); img.dataset.src = src;
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
  const btnPrev = container.querySelector('.carrusel-btn.prev');
  const btnNext = container.querySelector('.carrusel-btn.next');
  const scrollStep = 350;

  btnPrev?.addEventListener('click', () => carrusel?.scrollBy({ left: -scrollStep, behavior: 'smooth' }));
  btnNext?.addEventListener('click', () => carrusel?.scrollBy({ left: scrollStep, behavior: 'smooth' }));
});

let preBlurCanvas = null;

function getPreBlurCropCanvas(img, crop) {
  if (preBlurCanvas) return preBlurCanvas;
  const c = makeCanvas(Math.round(crop.sw), Math.round(crop.sh));
  const cx = c.getContext('2d');
  cx.drawImage(
    img, crop.sx, crop.sy, crop.sw, crop.sh,
    0, 0, c.width, c.height
  );
  // tu blur manual pero sobre TODO el recorte global, una sola vez
  aplicarBlurSimple(cx, c.width, c.height);
  preBlurCanvas = c;
  return preBlurCanvas;
}


function aplicarBlurSimple(ctx, w, h) {
  const radius = 6;               // tu radio real
  const pad = radius + 2;         // ⬅️ margen seguro (>= radius)
  const src = ctx.getImageData(0, 0, w, h);

  const c = makeCanvas(w + pad * 2, h + pad * 2);
  const cctx = c.getContext('2d');

  // pegar imagen centrada
  cctx.putImageData(src, pad, pad);

  // duplicar bordes desde el área ya pegada
  // (izq / der / arriba / abajo)
  cctx.drawImage(c, pad, pad, 1, h, 0, pad, pad, h);
  cctx.drawImage(c, w + pad - 1, pad, 1, h, w + pad, pad, pad, h);
  cctx.drawImage(c, pad, pad, w, 1, pad, 0, w, pad);
  cctx.drawImage(c, pad, h + pad - 1, w, 1, pad, h + pad, w, pad);

  // blur sobre TODO el canvas expandido
  const imgData = cctx.getImageData(0, 0, c.width, c.height);
  const data = imgData.data;
  const copy = new Uint8ClampedArray(data);

  for (let y = radius; y < c.height - radius; y++) {
    for (let x = radius; x < c.width - radius; x++) {
      let r=0,g=0,b=0,count=0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const i = ((y+dy)*c.width + (x+dx)) * 4;
          r += copy[i]; g += copy[i+1]; b += copy[i+2]; count++;
        }
      }
      const idx = (y*c.width + x) * 4;
      data[idx] = r/count; data[idx+1] = g/count; data[idx+2] = b/count;
    }
  }
  cctx.putImageData(imgData, 0, 0);

  // devolver SOLO el centro (sin los bordes falsos)
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(c, pad, pad, w, h, 0, 0, w, h);
}




function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

function extractTileToCanvas(img, quadIndex, cols, rows, crop) {
  const col = quadIndex % cols;
  const row = Math.floor(quadIndex / cols);

  const xCuts = Array.from({ length: cols + 1 }, (_, i) =>
    i === cols ? crop.sx + crop.sw : Math.floor(crop.sx + (i * crop.sw) / cols)
  );
  const yCuts = Array.from({ length: rows + 1 }, (_, i) =>
    i === rows ? crop.sy + crop.sh : Math.floor(crop.sy + (i * crop.sh) / rows)
  );

  const sx = xCuts[col];
  const sy = yCuts[row];
  const sw = Math.max(1, xCuts[col + 1] - xCuts[col]);
  const sh = Math.max(1, yCuts[row + 1] - yCuts[row]);

  const c = makeCanvas(sw, sh);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return c;
}


// Filtros P2P (pixel-a-pixel) simples:
function applyGrayscale(ctx) {
  const im = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    d[i] = d[i + 1] = d[i + 2] = l;
  }
  ctx.putImageData(im, 0, 0);
}
function applyInvert(ctx) {
  const im = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 255 - d[i];
    d[i + 1] = 255 - d[i + 1];
    d[i + 2] = 255 - d[i + 2];
  }
  ctx.putImageData(im, 0, 0);
}
function applyBrightness(ctx, factor) {
  const im = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.min(255, d[i] * factor);
    d[i + 1] = Math.min(255, d[i + 1] * factor);
    d[i + 2] = Math.min(255, d[i + 2] * factor);
  }
  ctx.putImageData(im, 0, 0);
}

function buildFilteredBufferForSlot(slot, img, cols, rows, crop) {
  const quadIndex = order[slot];

  // 1) Fuente del tile: si blurManual => usar preblur; sino => imagen original
  const f = (LEVELS[levelIndex].filters || [])[slot % (LEVELS[levelIndex].filters?.length || 1)];

  const srcCanvas = (f === 'blurManual')
    ? getPreBlurCropCanvas(img, crop)           // ← blur global 1 sola vez
    : null;

  // 2) recorte del tile desde la fuente elegida
  const col = quadIndex % cols, row = Math.floor(quadIndex / cols);
  const srcTileW = crop.sw / cols, srcTileH = crop.sh / rows;
  const sx = Math.round(crop.sx + col * srcTileW);
  const sy = Math.round(crop.sy + row * srcTileH);

  const c = makeCanvas(Math.round(srcTileW), Math.round(srcTileH));
  const ctx = c.getContext('2d');

  if (srcCanvas) {
    // recortamos desde el canvas ya blureado (coordenadas relativas al crop)
    ctx.drawImage(
      srcCanvas,
      Math.round(col * srcTileW), Math.round(row * srcTileH), Math.round(srcTileW), Math.round(srcTileH),
      0, 0, Math.round(srcTileW), Math.round(srcTileH)
    );
  } else {
    // recortamos desde la imagen original
    ctx.drawImage(img, sx, sy, srcTileW, srcTileH, 0, 0, srcTileW, srcTileH);
  }

  // 3) aplicar otros filtros P2P solo si NO era blurManual
  if (f && f !== 'blurManual') {
    if (f.startsWith('grayscale')) applyGrayscale(ctx);
    else if (f.startsWith('invert')) applyInvert(ctx);
    else if (f.startsWith('brightness')) {
      const m = f.match(/brightness\(([\d.]+)\)/);
      applyBrightness(ctx, m ? parseFloat(m[1]) : 1);
    }
  }

  return c;
}


// ====== Modo tableros por canvas único (pixel a pixel) ======
const USE_BOARD_CANVAS = true;
const board = document.getElementById('board');
const bctx = board?.getContext('2d');

let tiles = []; // { slot, x, y, w, h, deg, bufferCanvas }

function resizeBoardToGrid() {
  if (!board) return;
  const margin = 60; // deja espacio para la barra inferior
  const maxW = window.innerWidth - 120;
  const maxH = window.innerHeight - margin - 200;

  // Calculamos proporción correcta
const aspect = globalCrop ? (globalCrop.sw / globalCrop.sh) : (gridCols / gridRows);
  let w = maxW;
  let h = w / aspect;

  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }

  board.width = w * (window.devicePixelRatio || 1);
  board.height = h * (window.devicePixelRatio || 1);
  board.style.width = w + 'px';
  board.style.height = h + 'px';

  bctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
}


function layoutTilesOnBoard() {
  tiles = [];
  const dpr = window.devicePixelRatio || 1;
  const W = board.width / dpr;
  const H = board.height / dpr;

  const cellW = W / gridCols;
  const cellH = H / gridRows;

  for (let slot = 0; slot < pieceCount; slot++) {
    const col = slot % gridCols;
    const row = Math.floor(slot / gridCols);

    const x = col * cellW;
    const y = row * cellH;

    tiles.push({
      slot,
      x,
      y,
      w: cellW,
      h: cellH,
      deg: rotation[slot],
      bufferCanvas: tileCache[slot]?.filteredCanvas
    });
  }
}


function drawBoard() {
  if (!board) return;
  bctx.clearRect(0, 0, board.width, board.height);
  bctx.imageSmoothingEnabled = true;
  bctx.imageSmoothingQuality = 'high';

  for (const t of tiles) {
    if (!t.bufferCanvas) continue;

    const cx = t.x + t.w / 2;
    const cy = t.y + t.h / 2;

    bctx.save();
    bctx.beginPath();
    bctx.rect(t.x, t.y, t.w, t.h);
    bctx.clip();

    bctx.translate(cx, cy);
    bctx.rotate((t.deg * Math.PI) / 180);

    // Dibujamos sin bleed
    bctx.drawImage(t.bufferCanvas, -t.w / 2, -t.h / 2, t.w, t.h);

    bctx.restore();
  }
}

function boardHitTest(clientX, clientY) {
  const rect = board.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  // convertir coordenadas del mouse al espacio interno del canvas
  const x = (clientX - rect.left) * dpr;
  const y = (clientY - rect.top) * dpr;

  for (const t of tiles) {
    const tx = t.x * dpr;
    const ty = t.y * dpr;
    const tw = t.w * dpr;
    const th = t.h * dpr;
    if (x >= tx && x <= tx + tw && y >= ty && y <= ty + th) {
      return t;
    }
  }
  return null;
}


// Rotación en canvas: clon del flujo de animación por tile
function rotateBoardTile(slot, delta) {
  const current = getCurrentDeg(slot);
  const target = snap90(current + delta);
  rotation[slot] = target;
  anims[slot] = { from: normDeg(current), to: target, start: performance.now(), dur: ROTATE_MS };
  if (!animRAF) animationLoopBoard();
}

function animationLoopBoard() {
  animRAF = requestAnimationFrame(() => {
    let any = false;
    for (let i = 0; i < tiles.length; i++) if (anims[i]) any = true;
    // avanzar estados:
    const now = performance.now();
    for (const t of tiles) {
      const a = anims[t.slot];
      if (!a) continue;
      let tt = Math.min(1, (now - a.start) / a.dur);
      const e = EASING(tt);
      let diff = normDeg(a.to - a.from); if (diff > 180) diff -= 360;
      t.deg = normDeg(a.from + diff * e);
      if (tt >= 1) { anims[t.slot] = null; t.deg = snap90(t.deg); }
    }
    drawBoard();
    if (any) animationLoopBoard();
    else { animRAF = 0; markCorrects(); checkWin(); }
  });
}

// Eventos
board?.addEventListener('click', (e) => {
  if (!running) return;
  const t = boardHitTest(e.clientX, e.clientY);
  if (t) rotateBoardTile(t.slot, -90);
});
board?.addEventListener('contextmenu', (e) => {
  if (!running) return;
  e.preventDefault();
  const t = boardHitTest(e.clientX, e.clientY);
  if (t) rotateBoardTile(t.slot, +90);
});

// Responder a resize
window.addEventListener('resize', () => {
  if (!USE_BOARD_CANVAS || !board) return;
  resizeBoardToGrid(); layoutTilesOnBoard(); drawBoard();
});

// === Preview inicial: 4 fichas en el canvas ===
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 1) 2x2 fijo
    applyGridPreset(4);          // cols=2, rows=2, pieceCount=4

    // 2) Elegí una imagen (o dejá random)
    imageSrc = IMAGE_BANK[0];    // o randItem(IMAGE_BANK)

    // 3) Construí el nivel en modo preview (sin timer)
    await setupLevel(true);      // genera buffers + layout + drawBoard()

    // 4) Por las dudas, asegura tamaños y dibuja
    resizeBoardToGrid();
    layoutTilesOnBoard();
    drawBoard();

    // (opcional) deja el selector "Fichas" en 4 si existe
    const pieceSelect = document.getElementById('pieceCount');
    if (pieceSelect) pieceSelect.value = '4';
  } catch (e) {
    console.error('Preview inicial falló:', e);
  }
});
