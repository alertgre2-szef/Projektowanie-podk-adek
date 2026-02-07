/**
 * ============================================================
 * Edytor podkładek — wersja prosta (UX+)
 * ============================================================
 */

/* ===================== [SEKCJA 1] STAŁE ===================== */
const CANVAS_PX = 1181;
const CUT_RATIO = 0.90;

// Założenie produkcyjne: 1181 px = 10 cm @ 300 DPI
const PRINT_DPI = 300;

// Nowe progi jakości (Ty już zmieniałeś u siebie — zostawiam jak było u mnie)
const DPI_WEAK_MAX = 50;     // 0–50  = słaba
const DPI_MED_MAX = 100;     // 50–100 = średnia
const DPI_GOOD_MAX = 200;    // 100–200 = dobra
// 200+ = super

const REPO_BASE = (() => {
  const p = location.pathname;
  const i = p.indexOf("/editor/");
  return i >= 0 ? p.slice(0, i) : "";
})();

const CACHE_VERSION = "2026-02-07-03";
function withV(url) {
  return `${url}?v=${encodeURIComponent(CACHE_VERSION)}`;
}

/* ===================== [SEKCJA 2] DOM ===================== */
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const photoInput = document.getElementById("photoInput");
const nickInput = document.getElementById("nickInput");

const btnSquare = document.getElementById("btnSquare");
const btnCircle = document.getElementById("btnCircle");

const clipLayer = document.getElementById("clipLayer");
const shadeLayer = document.getElementById("shadeLayer");
const cutGuide = document.getElementById("cutGuide");
const safeGuide = document.getElementById("safeGuide");

const templateGrid = document.getElementById("templateGrid");

const btnDownloadPreview = document.getElementById("btnDownloadPreview");
const btnDownloadPrint = document.getElementById("btnDownloadPrint");

/* UX: toolbar + status + toast */
const btnUndo = document.getElementById("btnUndo");
const btnRedo = document.getElementById("btnRedo");
const btnZoomOut = document.getElementById("btnZoomOut");
const btnZoomIn = document.getElementById("btnZoomIn");
const btnFit = document.getElementById("btnFit");
const btnCenter = document.getElementById("btnCenter");

const statusBar = document.getElementById("statusBar");
const toastContainer = document.getElementById("toastContainer");

// żeby dotyk nie scrollował strony podczas przesuwania/zoom
canvas.style.touchAction = "none";

/* ===================== [SEKCJA 3] STAN ===================== */
let shape = "square";
let uploadedImg = null;
let currentTemplate = null;
let templateEditImg = null;

let coverScale = 1;
let userScale = 1;
let offsetX = 0;
let offsetY = 0;

const MIN_USER_SCALE = 1.0;
const MAX_USER_SCALE = 6.0;

/* ===================== [SEKCJA 3B] TOAST + STATUS + HISTORIA + JAKOŚĆ ===================== */

// DOMYŚLNIE 20 sekund
const TOAST_DEFAULT_MS = 20000;

function toast(msg, ms = TOAST_DEFAULT_MS) {
  if (!toastContainer) return;

  const el = document.createElement("div");
  el.className = "toast";

  // treść
  const text = document.createElement("div");
  text.className = "toastText";
  text.textContent = msg;
  el.appendChild(text);

  // przycisk zamknięcia
  const close = document.createElement("button");
  close.type = "button";
  close.className = "toastClose";
  close.setAttribute("aria-label", "Zamknij");
  close.textContent = "×";
  el.appendChild(close);

  // obsługa zamykania
  let timer = 0;
  const removeToast = () => {
    if (timer) window.clearTimeout(timer);
    el.remove();
  };

  close.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    removeToast();
  });

  toastContainer.appendChild(el);

  timer = window.setTimeout(() => {
    removeToast();
  }, ms);
}

function fmtZoomPct() {
  return `${Math.round(userScale * 100)}%`;
}

function templateName() {
  if (!currentTemplate) return "—";
  return currentTemplate?.name || currentTemplate?.id || "—";
}

function getEffectiveDpi() {
  if (!uploadedImg) return null;
  const s = coverScale * userScale;
  if (!s || s <= 0) return null;
  return PRINT_DPI / s;
}

function qualityLabelFromDpi(dpi) {
  if (dpi == null) return "—";
  if (dpi < DPI_WEAK_MAX) return "Słaba";
  if (dpi < DPI_MED_MAX) return "Średnia";
  if (dpi < DPI_GOOD_MAX) return "Dobra";
  return "Super";
}

function applyStatusBarQualityStyle(dpi) {
  if (!statusBar) return;

  let bg = "#f8fafc";
  let border = "#e5e7eb";

  if (dpi == null) {
    bg = "#f8fafc";
    border = "#e5e7eb";
  } else if (dpi < DPI_WEAK_MAX) {
    bg = "#ffe8e8";
    border = "#f5b5b5";
  } else if (dpi < DPI_MED_MAX) {
    bg = "#fff6d6";
    border = "#f1d08a";
  } else if (dpi < DPI_GOOD_MAX) {
    bg = "#e9fbe9";
    border = "#9bd59b";
  } else {
    bg = "#ddf7e3";
    border = "#6fcf8a";
  }

  statusBar.style.background = bg;
  statusBar.style.borderColor = border;
}

let qualityWarnLevel = 0; // 0=brak, 1=warn, 2=strong

function levelFromDpi(dpi) {
  if (dpi == null) return 0;
  if (dpi < DPI_WEAK_MAX) return 2;
  if (dpi < DPI_MED_MAX) return 1;
  return 0;
}

function maybeWarnQuality(force = false) {
  if (!uploadedImg) return;

  const dpi = getEffectiveDpi();
  if (!dpi) return;

  const level = levelFromDpi(dpi);
  if (!force && level <= qualityWarnLevel) return;
  qualityWarnLevel = level;

  if (level === 2) {
    toast(
      `Uwaga: jakość może być słaba (ok. ${Math.round(dpi)} DPI). ` +
      `Najlepiej wygląda zdjęcie z oryginału (np. prosto z aparatu/telefonu). ` +
      `Pamiętaj, że komunikatory (np. WhatsApp/Messenger) często pomniejszają i kompresują zdjęcia.`
    );
  } else if (level === 1) {
    toast(
      `Uwaga: zdjęcie ma średnią jakość (ok. ${Math.round(dpi)} DPI). ` +
      `Jeśli możesz, użyj oryginalnego pliku – komunikatory często pogarszają jakość przez kompresję.`
    );
  }
}

function updateStatusBar() {
  if (!statusBar) return;

  const sh = shape === "circle" ? "Okrąg" : "Kwadrat";
  const dpi = getEffectiveDpi();
  const dpiStr = dpi == null ? "—" : `${Math.round(dpi)}`;
  const q = qualityLabelFromDpi(dpi);

  statusBar.textContent =
    `Kształt: ${sh} | Szablon: ${templateName()} | Zoom: ${fmtZoomPct()} | DPI: ${dpiStr} | Jakość: ${q}`;

  applyStatusBarQualityStyle(dpi);
}

/* ---- Undo/Redo (5 kroków) ---- */
const HISTORY_MAX = 5;
let history = [];
let historyIndex = -1;
let suppressHistory = false;

function snapshot() {
  return {
    shape,
    userScale,
    offsetX,
    offsetY,
    templateId: currentTemplate ? currentTemplate.id : null,
  };
}

function sameSnap(a, b) {
  if (!a || !b) return false;
  return (
    a.shape === b.shape &&
    a.userScale === b.userScale &&
    a.offsetX === b.offsetX &&
    a.offsetY === b.offsetY &&
    a.templateId === b.templateId
  );
}

function pushHistory() {
  if (suppressHistory) return;

  const snap = snapshot();
  const last = history[historyIndex];
  if (last && sameSnap(last, snap)) return;

  if (historyIndex < history.length - 1) {
    history = history.slice(0, historyIndex + 1);
  }

  history.push(snap);

  if (history.length > HISTORY_MAX) {
    history.shift();
  }

  historyIndex = history.length - 1;
  updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
  if (btnUndo) btnUndo.disabled = historyIndex <= 0;
  if (btnRedo) btnRedo.disabled = historyIndex >= history.length - 1;

  if (btnUndo) btnUndo.style.opacity = btnUndo.disabled ? "0.5" : "1";
  if (btnRedo) btnRedo.style.opacity = btnRedo.disabled ? "0.5" : "1";
}

async function applyStateFromHistory(snap) {
  if (!snap) return;

  suppressHistory = true;

  setShape(snap.shape, { skipHistory: true });

  if (!snap.templateId) {
    clearTemplateSelection({ skipHistory: true });
  } else {
    currentTemplate = { id: snap.templateId, name: snap.templateId };
    await applyTemplate(currentTemplate, { skipHistory: true, silentErrors: true });
  }

  userScale = clamp(snap.userScale, MIN_USER_SCALE, MAX_USER_SCALE);
  offsetX = snap.offsetX;
  offsetY = snap.offsetY;

  applyClampToOffsets();
  redraw();
  updateStatusBar();

  suppressHistory = false;
  updateUndoRedoButtons();
}

async function undo() {
  if (historyIndex <= 0) return;
  historyIndex--;
  await applyStateFromHistory(history[historyIndex]);
}

async function redo() {
  if (historyIndex >= history.length - 1) return;
  historyIndex++;
  await applyStateFromHistory(history[historyIndex]);
}

/* ===================== [SEKCJA 4] KSZTAŁT + SPADY + SAFE ===================== */
function setShadeSquare() {
  shadeLayer.style.clipPath = "";
  shadeLayer.style.background =
    "linear-gradient(rgba(0,0,0,0.50), rgba(0,0,0,0.50)) top / 100% 5% no-repeat," +
    "linear-gradient(rgba(0,0,0,0.50), rgba(0,0,0,0.50)) bottom / 100% 5% no-repeat," +
    "linear-gradient(rgba(0,0,0,0.50), rgba(0,0,0,0.50)) left / 5% 90% no-repeat," +
    "linear-gradient(rgba(0,0,0,0.50), rgba(0,0,0,0.50)) right / 5% 90% no-repeat";
}

function setShadeCircle() {
  const CIRCLE_SHADE_STOP_PCT = 63;

  shadeLayer.style.clipPath = "";
  shadeLayer.style.background =
    `radial-gradient(circle at 50% 50%, ` +
    `rgba(0,0,0,0) 0%, ` +
    `rgba(0,0,0,0) ${CIRCLE_SHADE_STOP_PCT}%, ` +
    `rgba(0,0,0,0.50) ${CIRCLE_SHADE_STOP_PCT}%, ` +
    `rgba(0,0,0,0.50) 100%)`;
}

function setSafeGuideForShape() {
  if (!safeGuide) return;
  safeGuide.style.borderRadius = shape === "circle" ? "999px" : "10px";
}

function setShape(next, opts = {}) {
  shape = next;

  btnSquare.classList.toggle("active", shape === "square");
  btnCircle.classList.toggle("active", shape === "circle");

  if (shape === "circle") {
    clipLayer.style.clipPath = "circle(50% at 50% 50%)";
    cutGuide.style.borderRadius = "999px";
    setShadeCircle();
  } else {
    const rPx = Math.round(CANVAS_PX * 0.05);
    clipLayer.style.clipPath = `inset(0 round ${rPx}px)`;
    cutGuide.style.borderRadius = "10px";
    setShadeSquare();
  }

  setSafeGuideForShape();
  redraw();
  updateStatusBar();

  if (!opts.skipHistory) pushHistory();
}

btnSquare.addEventListener("click", () => setShape("square"));
btnCircle.addEventListener("click", () => setShape("circle"));

/* ===================== [SEKCJA 5] RYSOWANIE ===================== */
function clear() {
  ctx.clearRect(0, 0, CANVAS_PX, CANVAS_PX);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function getDrawRect(img, s = coverScale * userScale, ox = offsetX, oy = offsetY) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;

  const w = iw * s;
  const h = ih * s;

  let x = (CANVAS_PX - w) / 2 + ox;
  let y = (CANVAS_PX - h) / 2 + oy;

  const minX = CANVAS_PX - w;
  const maxX = 0;
  const minY = CANVAS_PX - h;
  const maxY = 0;

  x = clamp(x, minX, maxX);
  y = clamp(y, minY, maxY);

  return { x, y, w, h, s };
}

function applyClampToOffsets() {
  if (!uploadedImg) return;

  const iw = uploadedImg.naturalWidth;
  const ih = uploadedImg.naturalHeight;

  const s = coverScale * userScale;
  const w = iw * s;
  const h = ih * s;

  const minX = CANVAS_PX - w;
  const maxX = 0;
  const minY = CANVAS_PX - h;
  const maxY = 0;

  const baseX = (CANVAS_PX - w) / 2;
  const baseY = (CANVAS_PX - h) / 2;

  const x = clamp(baseX + offsetX, minX, maxX);
  const y = clamp(baseY + offsetY, minY, maxY);

  offsetX = x - baseX;
  offsetY = y - baseY;
}

function drawPhotoTransformed(img) {
  const { x, y, w, h } = getDrawRect(img);
  ctx.drawImage(img, x, y, w, h);
}

function drawTemplateEditOverlay() {
  if (!templateEditImg) return;
  ctx.drawImage(templateEditImg, 0, 0, CANVAS_PX, CANVAS_PX);
}

function redraw() {
  clear();
  if (uploadedImg) drawPhotoTransformed(uploadedImg);
  drawTemplateEditOverlay();
}

/* ===================== [SEKCJA 6] WCZYTANIE ZDJĘCIA ===================== */
function resetPhotoTransformToCover() {
  if (!uploadedImg) return;

  const iw = uploadedImg.naturalWidth;
  const ih = uploadedImg.naturalHeight;

  coverScale = Math.max(CANVAS_PX / iw, CANVAS_PX / ih);
  userScale = 1.0;
  offsetX = 0;
  offsetY = 0;

  applyClampToOffsets();
}

photoInput.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  const img = new Image();

  img.onload = () => {
    uploadedImg = img;
    qualityWarnLevel = 0;

    resetPhotoTransformToCover();
    redraw();
    updateStatusBar();
    pushHistory();

    toast("Zdjęcie wgrane ✅");
    maybeWarnQuality(true);

    URL.revokeObjectURL(url);
  };

  img.src = url;
});

/* ===================== [SEKCJA 6B] DRAG + ZOOM (MYSZ/DOTYK) ===================== */
function clientToCanvasPx(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  const scale = CANVAS_PX / r.width;
  const x = (clientX - r.left) * scale;
  const y = (clientY - r.top) * scale;
  return { x, y };
}

function setUserScaleKeepingPoint(newUserScale, anchorPxX, anchorPxY) {
  if (!uploadedImg) return;

  newUserScale = clamp(newUserScale, MIN_USER_SCALE, MAX_USER_SCALE);

  const iw = uploadedImg.naturalWidth;
  const ih = uploadedImg.naturalHeight;

  const s1 = coverScale * userScale;
  const w1 = iw * s1;
  const h1 = ih * s1;
  const x1 = (CANVAS_PX - w1) / 2 + offsetX;
  const y1 = (CANVAS_PX - h1) / 2 + offsetY;

  const u = (anchorPxX - x1) / s1;
  const v = (anchorPxY - y1) / s1;

  const s2 = coverScale * newUserScale;
  const w2 = iw * s2;
  const h2 = ih * s2;

  const x2 = anchorPxX - u * s2;
  const y2 = anchorPxY - v * s2;

  const baseX2 = (CANVAS_PX - w2) / 2;
  const baseY2 = (CANVAS_PX - h2) / 2;

  offsetX = x2 - baseX2;
  offsetY = y2 - baseY2;
  userScale = newUserScale;

  applyClampToOffsets();
  redraw();
  updateStatusBar();
  maybeWarnQuality(false);
}

function fitToCover() {
  if (!uploadedImg) return;
  resetPhotoTransformToCover();
  redraw();
  updateStatusBar();
  pushHistory();
  toast("Dopasowano kadr");
  maybeWarnQuality(false);
}

function centerPhoto() {
  if (!uploadedImg) return;
  offsetX = 0;
  offsetY = 0;
  applyClampToOffsets();
  redraw();
  updateStatusBar();
  pushHistory();
  toast("Wyśrodkowano");
}

let isDragging = false;
let dragLastX = 0;
let dragLastY = 0;

const pointers = new Map();
let pinchStartDist = 0;
let pinchStartScale = 1;

let gestureActive = false;
let gestureMoved = false;

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function mid(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

canvas.addEventListener("pointerdown", (e) => {
  if (!uploadedImg) return;

  canvas.setPointerCapture(e.pointerId);
  const p = clientToCanvasPx(e.clientX, e.clientY);
  pointers.set(e.pointerId, { x: p.x, y: p.y });

  if (!gestureActive) {
    gestureActive = true;
    gestureMoved = false;
  }

  if (pointers.size === 1) {
    isDragging = true;
    dragLastX = p.x;
    dragLastY = p.y;
  }

  if (pointers.size === 2) {
    const pts = Array.from(pointers.values());
    pinchStartDist = distance(pts[0], pts[1]);
    pinchStartScale = userScale;
    isDragging = false;
  }

  e.preventDefault();
});

canvas.addEventListener("pointermove", (e) => {
  if (!uploadedImg) return;
  if (!pointers.has(e.pointerId)) return;

  const p = clientToCanvasPx(e.clientX, e.clientY);
  pointers.set(e.pointerId, { x: p.x, y: p.y });

  if (pointers.size === 2) {
    const pts = Array.from(pointers.values());
    const d = distance(pts[0], pts[1]);
    const c = mid(pts[0], pts[1]);

    if (pinchStartDist > 0) {
      const factor = d / pinchStartDist;
      const nextScale = pinchStartScale * factor;
      setUserScaleKeepingPoint(nextScale, c.x, c.y);
      gestureMoved = true;
    }
    e.preventDefault();
    return;
  }

  if (isDragging && pointers.size === 1) {
    const dx = p.x - dragLastX;
    const dy = p.y - dragLastY;

    if (Math.abs(dx) + Math.abs(dy) > 0) gestureMoved = true;

    offsetX += dx;
    offsetY += dy;

    dragLastX = p.x;
    dragLastY = p.y;

    applyClampToOffsets();
    redraw();
    updateStatusBar();
    e.preventDefault();
  }
});

function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);

  if (pointers.size < 2) {
    pinchStartDist = 0;
    pinchStartScale = userScale;
  }

  if (pointers.size === 0) {
    isDragging = false;

    if (gestureActive) {
      if (gestureMoved) pushHistory();
      gestureActive = false;
      gestureMoved = false;
      maybeWarnQuality(false);
    }
  }

  e.preventDefault();
}

canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener("pointerleave", endPointer);

canvas.addEventListener(
  "wheel",
  (e) => {
    if (!uploadedImg) return;

    const { x, y } = clientToCanvasPx(e.clientX, e.clientY);
    const zoom = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    setUserScaleKeepingPoint(userScale * zoom, x, y);

    wheelHistoryCommit();
    e.preventDefault();
  },
  { passive: false }
);

let wheelTimer = 0;
function wheelHistoryCommit() {
  if (wheelTimer) window.clearTimeout(wheelTimer);
  wheelTimer = window.setTimeout(() => {
    pushHistory();
    wheelTimer = 0;
  }, 180);
}

/* ===================== [SEKCJA 6C] TOOLBAR BUTTONS ===================== */
if (btnFit) btnFit.addEventListener("click", fitToCover);
if (btnCenter) btnCenter.addEventListener("click", centerPhoto);

if (btnZoomIn) {
  btnZoomIn.addEventListener("click", () => {
    if (!uploadedImg) return toast("Najpierw wgraj zdjęcie.");
    const x = CANVAS_PX / 2;
    const y = CANVAS_PX / 2;
    setUserScaleKeepingPoint(userScale * 1.12, x, y);
    pushHistory();
  });
}

if (btnZoomOut) {
  btnZoomOut.addEventListener("click", () => {
    if (!uploadedImg) return toast("Najpierw wgraj zdjęcie.");
    const x = CANVAS_PX / 2;
    const y = CANVAS_PX / 2;
    setUserScaleKeepingPoint(userScale / 1.12, x, y);
    pushHistory();
  });
}

if (btnUndo) btnUndo.addEventListener("click", undo);
if (btnRedo) btnRedo.addEventListener("click", redo);

window.addEventListener("keydown", (e) => {
  const isMac = navigator.platform.toLowerCase().includes("mac");
  const mod = isMac ? e.metaKey : e.ctrlKey;

  if (mod && !e.shiftKey && e.key.toLowerCase() === "z") {
    e.preventDefault();
    undo();
    return;
  }
  if ((mod && e.shiftKey && e.key.toLowerCase() === "z") || (mod && e.key.toLowerCase() === "y")) {
    e.preventDefault();
    redo();
    return;
  }
});

/* ===================== [SEKCJA 7] SZABLONY ===================== */
async function loadTemplates() {
  const url = `${REPO_BASE}/assets/templates/index.json`;
  const res = await fetch(withV(url), { cache: "no-store" });
  if (!res.ok) throw new Error(`Nie mogę wczytać: ${url}`);

  const data = await res.json();
  const list = Array.isArray(data?.coasters) ? data.coasters : [];

  const normalized = list
    .filter((t) => t && t.id)
    .map((t) => ({ id: t.id, name: t.title || t.name || t.id }));

  return [{ id: "__none__", name: "Brak szablonu" }, ...normalized];
}

function templateFolderUrl(id) {
  return `${REPO_BASE}/assets/templates/coasters/${encodeURIComponent(id)}/`;
}

function renderTemplateGrid(templates) {
  templateGrid.innerHTML = "";

  templates.forEach((t) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "templateItem";

    if (t.id === "__none__") {
      item.textContent = "Brak";
      item.classList.add("templateItem--none");
      item.onclick = () => clearTemplateSelection();
      templateGrid.appendChild(item);
      return;
    }

    const img = document.createElement("img");
    img.src = withV(templateFolderUrl(t.id) + "thumb.webp");
    img.loading = "lazy";
    item.appendChild(img);

    item.onclick = async () => {
      currentTemplate = t;
      await applyTemplate(t);
      updateStatusBar();
      pushHistory();
      toast(`Wybrano szablon: ${templateName()}`);
    };

    templateGrid.appendChild(item);
  });
}

async function applyTemplate(t, opts = {}) {
  const url = withV(templateFolderUrl(t.id) + "edit.png");
  const img = new Image();
  img.crossOrigin = "anonymous";

  img.onload = () => {
    templateEditImg = img;
    redraw();
  };

  img.onerror = () => {
    if (!opts.silentErrors) {
      console.error("Nie mogę wczytać:", url);
      toast("Nie mogę wczytać szablonu.");
    }
  };

  img.src = url;
}

function clearTemplateSelection(opts = {}) {
  currentTemplate = null;
  templateEditImg = null;
  redraw();
  updateStatusBar();
  if (!opts.skipHistory) pushHistory();
}

/* ===================== [SEKCJA 8] EKSPORT ===================== */
btnDownloadPreview.addEventListener("click", () => {
  const a = document.createElement("a");
  const nick = (nickInput.value || "projekt").trim().replace(/[^\w\-]+/g, "_");
  a.download = `${nick}_preview.png`;
  a.href = canvas.toDataURL("image/png");
  a.click();
  toast("Zapisano PODGLĄD PNG ✅");
});

btnDownloadPrint.addEventListener("click", () => {
  if (!uploadedImg) {
    toast("Najpierw wgraj zdjęcie.");
    return;
  }
  if (!currentTemplate) {
    toast("Wybierz szablon, aby wygenerować plik do druku.");
    return;
  }

  const printUrl = withV(templateFolderUrl(currentTemplate.id) + "print.png");
  const printImg = new Image();
  printImg.crossOrigin = "anonymous";

  printImg.onload = () => {
    clear();
    drawPhotoTransformed(uploadedImg);
    ctx.drawImage(printImg, 0, 0, CANVAS_PX, CANVAS_PX);

    const a = document.createElement("a");
    const nick = (nickInput.value || "projekt").trim().replace(/[^\w\-]+/g, "_");
    a.download = `${nick}_${currentTemplate.id}_PRINT.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();

    redraw();
    toast("Zapisano DRUK PNG ✅");
  };

  printImg.onerror = () => {
    toast("Nie mogę wczytać print.png dla wybranego szablonu.");
    console.error("Nie mogę wczytać:", printUrl);
  };

  printImg.src = printUrl;
});

/* ===================== [SEKCJA 9] START ===================== */
(async function init() {
  setShape("square", { skipHistory: true });
  clearTemplateSelection({ skipHistory: true });

  try {
    const templates = await loadTemplates();
    renderTemplateGrid(templates);
  } catch (err) {
    console.error(err);
    templateGrid.innerHTML = `<div class="smallText">Nie udało się wczytać szablonów.</div>`;
    toast("Nie udało się wczytać szablonów.");
  }

  redraw();
  updateStatusBar();
  pushHistory();
})();
