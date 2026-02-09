/**
 * ============================================================
 * Edytor podkładek — wersja prosta (UX+)
 * FILE_VERSION: 2026-02-09-17
 * - Export: blokada podglądu bez wgranego zdjęcia
 * - UI: spójne odświeżanie enabled/disabled dla eksportu
 * - Theme/Rotate/JSON: jak w poprzedniej wersji
 * ============================================================
 */

/* ===================== [SEKCJA 1] STAŁE ===================== */
const CANVAS_PX = 1181;
const CUT_RATIO = 0.90;

const PRINT_DPI = 300;

const DPI_WEAK_MAX = 50;
const DPI_MED_MAX = 100;
const DPI_GOOD_MAX = 200;

const REPO_BASE = (() => {
  const p = location.pathname;
  const i = p.indexOf("/editor/");
  return i >= 0 ? p.slice(0, i) : "";
})();

const CACHE_VERSION = "2026-02-09-17";
window.CACHE_VERSION = CACHE_VERSION;

function withV(url) {
  return `${url}?v=${encodeURIComponent(CACHE_VERSION)}`;
}

/** Debug toggle:
 *  - dodaj ?debug=1 w URL albo localStorage.EDITOR_DEBUG = "1"
 */
const DEBUG =
  (typeof location !== "undefined" && (location.search || "").includes("debug=1")) ||
  (typeof localStorage !== "undefined" && localStorage.getItem("EDITOR_DEBUG") === "1");

function dlog(...args) {
  if (DEBUG) console.log("[EDITOR]", ...args);
}
function derr(...args) {
  console.error("[EDITOR]", ...args);
}

/* ===================== [THEME] ===================== */
const THEME_KEY = "EDITOR_THEME"; // "light" | "dark"

function getQueryParam(name) {
  try {
    const sp = new URLSearchParams(location.search || "");
    const v = sp.get(name);
    return (v || "").trim();
  } catch {
    return "";
  }
}

function systemPrefersDark() {
  try {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

function normalizeTheme(v) {
  const x = String(v || "").toLowerCase().trim();
  if (x === "dark" || x === "ciemny") return "dark";
  if (x === "light" || x === "jasny") return "light";
  return "";
}

function applyTheme(theme, { persist = true } = {}) {
  const t = normalizeTheme(theme) || "light";
  document.documentElement.dataset.theme = t;

  const bL = document.getElementById("btnThemeLight");
  const bD = document.getElementById("btnThemeDark");
  if (bL) bL.classList.toggle("active", t === "light");
  if (bD) bD.classList.toggle("active", t === "dark");

  if (persist) {
    try { localStorage.setItem(THEME_KEY, t); } catch {}
  }
}

function initTheme() {
  const fromUrl = normalizeTheme(getQueryParam("theme"));
  if (fromUrl) {
    applyTheme(fromUrl, { persist: true });
    return;
  }

  let fromStorage = "";
  try { fromStorage = normalizeTheme(localStorage.getItem(THEME_KEY)); } catch {}
  if (fromStorage) {
    applyTheme(fromStorage, { persist: false });
    return;
  }

  applyTheme(systemPrefersDark() ? "dark" : "light", { persist: false });
}

function wireThemeButtons() {
  const bL = document.getElementById("btnThemeLight");
  const bD = document.getElementById("btnThemeDark");
  if (bL) bL.addEventListener("click", () => applyTheme("light", { persist: true }));
  if (bD) bD.addEventListener("click", () => applyTheme("dark", { persist: true }));
}

/* ===================== [SEKCJA 1B] URL PARAMS (NICK/ORDER) ===================== */
function _parseHashParams() {
  const h = (location.hash || "").replace(/^#/, "").trim();
  if (!h) return new URLSearchParams();
  try {
    return new URLSearchParams(h.includes("=") ? h : "");
  } catch {
    return new URLSearchParams();
  }
}

function getUrlParamAny(keys) {
  const sp = new URLSearchParams(location.search || "");
  const hp = _parseHashParams();

  for (const k of keys) {
    const v1 = sp.get(k);
    if (typeof v1 === "string" && v1.trim()) return v1.trim();

    const v2 = hp.get(k);
    if (typeof v2 === "string" && v2.trim()) return v2.trim();
  }
  return "";
}

function getNickFromUrl() {
  return getUrlParamAny(["nick", "n", "order", "order_id"]);
}

function getOrderIdFromUrl() {
  return getUrlParamAny(["order_id", "order"]);
}

/**
 * Self-test: wymagane elementy DOM (krytyczne do działania).
 * Modal jest opcjonalny (mamy fallback na toast/fokus).
 */
const REQUIRED_IDS = [
  "canvas",
  "preview",
  "photoInput",
  "nickInput",
  "templateGrid",
  "btnDownloadPreview",
  "btnSendToProduction",
  "toastContainer",
  "statusBar",
];

function checkRequiredDom() {
  const missing = [];
  for (const id of REQUIRED_IDS) {
    if (!document.getElementById(id)) missing.push(id);
  }
  const ok = missing.length === 0;

  const report = { ok, missing, cache_version: CACHE_VERSION };
  window.__CHECK_DOM__ = () => report;

  if (!ok) {
    derr("Braki w DOM:", missing);
    alert(
      "BŁĄD: Brakuje elementów w index.html:\n\n- " +
        missing.join("\n- ") +
        "\n\nSprawdź, czy wkleiłeś pełny plik index.html."
    );
  }
  return report;
}

/**
 * Docelowe maski:
 * /editor/assets/masks/mask_square.png
 * /editor/assets/masks/mask_circle.png
 */
const MASK_URLS = {
  square: `${REPO_BASE}/editor/assets/masks/mask_square.png`,
  circle: `${REPO_BASE}/editor/assets/masks/mask_circle.png`,
};

/* ===================== [UPLOAD DO REALIZACJI] ===================== */
const UPLOAD_ENDPOINT = `${REPO_BASE}/api/upload.php`;
const UPLOAD_TOKEN = "4f9c7d2a8e1b5f63c0a9e72d41f8b6c39e5a0d7f1b2c8e4a6d9f3c1b7e0a2f5";

/* ===================== [SEKCJA 2] DOM ===================== */
const domReport = checkRequiredDom();
if (!domReport.ok) {
  throw new Error("Missing required DOM elements: " + domReport.missing.join(", "));
}

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const previewEl = document.getElementById("preview");

const photoInput = document.getElementById("photoInput");
const nickInput = document.getElementById("nickInput");

const btnSquare = document.getElementById("btnSquare");
const btnCircle = document.getElementById("btnCircle");

const templateGrid = document.getElementById("templateGrid");

const btnDownloadPreview = document.getElementById("btnDownloadPreview");

const btnUndo = document.getElementById("btnUndo");
const btnRedo = document.getElementById("btnRedo");
const btnZoomOut = document.getElementById("btnZoomOut");
const btnZoomIn = document.getElementById("btnZoomIn");
const btnFit = document.getElementById("btnFit");
const btnCenter = document.getElementById("btnCenter");

const btnRotateLeft = document.getElementById("btnRotateLeft");
const btnRotateRight = document.getElementById("btnRotateRight");
const btnRotateReset = document.getElementById("btnRotateReset");

const btnSendToProduction = document.getElementById("btnSendToProduction");

const statusBar = document.getElementById("statusBar");
const toastContainer = document.getElementById("toastContainer");

const finalOverlay = document.getElementById("finalOverlay");
const finalOverlayTitle = document.getElementById("finalOverlayTitle");
const finalOverlayMsg = document.getElementById("finalOverlayMsg");

const busyOverlay = document.getElementById("busyOverlay");
const busyOverlayMsg = document.getElementById("busyOverlayMsg");

const errorOverlay = document.getElementById("errorOverlay");
const errorOverlayTitle = document.getElementById("errorOverlayTitle");
const errorOverlayMsg = document.getElementById("errorOverlayMsg");
const errorOverlayRetry = document.getElementById("errorOverlayRetry");
const errorOverlayClose = document.getElementById("errorOverlayClose");

// MODAL nick (opcjonalne)
const nickModal = document.getElementById("nickModal");
const nickModalInput = document.getElementById("nickModalInput");
const nickModalClose = document.getElementById("nickModalClose");
const nickModalCancel = document.getElementById("nickModalCancel");
const nickModalSave = document.getElementById("nickModalSave");
const nickModalHint = document.getElementById("nickModalHint");

// touch
canvas.style.touchAction = "none";

/* ===================== [SEKCJA 2A] WERSJA W UI ===================== */
function updateUiVersionBadge() {
  const el = document.getElementById("appVersion");
  if (!el) return;
  el.textContent = " • v" + CACHE_VERSION;
}

/* ===================== [SEKCJA 2B] MASKA PNG ===================== */
let maskEl = null;

function ensureMaskEl() {
  if (!previewEl) return null;
  if (maskEl && maskEl.isConnected) return maskEl;

  const byId = document.getElementById("maskOverlay");
  if (byId) {
    byId.classList.add("maskOverlay");
    byId.alt = "";
    byId.setAttribute("aria-hidden", "true");
    byId.draggable = false;
    maskEl = byId;
    return maskEl;
  }

  maskEl = previewEl.querySelector("img.maskOverlay");
  if (maskEl) return maskEl;

  const img = document.createElement("img");
  img.className = "maskOverlay";
  img.alt = "";
  img.setAttribute("aria-hidden", "true");
  img.draggable = false;

  previewEl.appendChild(img);
  maskEl = img;
  return maskEl;
}

function applyMaskForShape(nextShape) {
  const el = ensureMaskEl();
  if (!el) return;

  const raw = nextShape === "circle" ? MASK_URLS.circle : MASK_URLS.square;
  el.style.display = "block";
  el.src = withV(raw);
}

/* ===================== [SEKCJA 2C] NICK/ORDER ID Z URL ===================== */
const urlNickRaw = getNickFromUrl();
const urlOrderIdRaw = getOrderIdFromUrl();

function applyNickFromUrlIfEmpty() {
  if (!nickInput) return;
  const current = (nickInput.value || "").trim();
  if (current) return;

  const v = (urlNickRaw || urlOrderIdRaw || "").trim();
  if (!v) return;

  nickInput.value = v;
}

/* ===================== [SEKCJA 3] STAN ===================== */
let shape = "square";
let uploadedImg = null;
let currentTemplate = null;
let templateEditImg = null;

let coverScale = 1;
let userScale = 1;
let offsetX = 0;
let offsetY = 0;

// obrót
let rotationDeg = 0; // -180..180
function normDeg(d) {
  let x = Number(d) || 0;
  x = ((x % 360) + 360) % 360;
  if (x > 180) x -= 360;
  return x;
}
function degToRad(d) { return (d * Math.PI) / 180; }

const MIN_USER_SCALE = 1.0;
const MAX_USER_SCALE = 6.0;

/* ===================== [DIRTY STATE] ===================== */
let isDirty = false;
function markDirty() { isDirty = true; }
function markClean() { isDirty = false; }

function shouldWarnBeforeUnload() {
  if (productionLocked) return false;
  if (!isDirty) return false;
  if (finalOverlay && finalOverlay.style.display === "flex") return false;
  return true;
}

window.addEventListener("beforeunload", (e) => {
  if (!shouldWarnBeforeUnload()) return;
  e.preventDefault();
  e.returnValue = "";
});

/* ===================== [SEKCJA 3B] TOAST + STATUS + HISTORIA + JAKOŚĆ ===================== */
const TOAST_DEFAULT_MS = 10000;

function toast(msg, ms = TOAST_DEFAULT_MS) {
  if (!toastContainer) return;

  const el = document.createElement("div");
  el.className = "toast";

  const text = document.createElement("div");
  text.className = "toastText";
  text.textContent = msg;
  el.appendChild(text);

  const close = document.createElement("button");
  close.type = "button";
  close.className = "toastClose";
  close.setAttribute("aria-label", "Zamknij");
  close.textContent = "×";
  el.appendChild(close);

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
  timer = window.setTimeout(() => removeToast(), ms);
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

let qualityWarnLevel = 0;

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

  if (level === 2) toast(`Uwaga: jakość może być słaba (ok. ${Math.round(dpi)} DPI).`);
  else if (level === 1) toast(`Uwaga: zdjęcie ma średnią jakość (ok. ${Math.round(dpi)} DPI).`);
}

function updateStatusBar() {
  if (!statusBar) return;

  const sh = shape === "circle" ? "Okrąg" : "Kwadrat";
  const dpi = getEffectiveDpi();
  const dpiStr = dpi == null ? "—" : `${Math.round(dpi)}`;
  const q = qualityLabelFromDpi(dpi);

  const rot = rotationDeg ? `${rotationDeg}°` : "0°";

  statusBar.textContent =
    `Kształt: ${sh} | Szablon: ${templateName()} | Zoom: ${fmtZoomPct()} | Obrót: ${rot} | DPI: ${dpiStr} | Jakość: ${q}`;

  applyStatusBarQualityStyle(dpi);
}

/* ===================== [EXPORT BUTTONS ENABLED STATE] ===================== */
function refreshExportButtons() {
  const hasPhoto = !!uploadedImg;
  if (btnDownloadPreview) btnDownloadPreview.disabled = !hasPhoto || productionLocked;
  // send button jest blokowany w setUiLocked, ale zostawiamy spójność:
  if (btnSendToProduction) btnSendToProduction.disabled = productionLocked;
}

/* ---- Undo/Redo (5 kroków) ---- */
const HISTORY_MAX = 5;
let history = [];
let historyIndex = -1;
let suppressHistory = false;

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function snapshot() {
  return {
    shape,
    userScale,
    offsetX,
    offsetY,
    rotationDeg,
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
    a.rotationDeg === b.rotationDeg &&
    a.templateId === b.templateId
  );
}

function pushHistory() {
  if (suppressHistory) return;

  const snap = snapshot();
  const last = history[historyIndex];
  if (last && sameSnap(last, snap)) return;

  if (historyIndex < history.length - 1) history = history.slice(0, historyIndex + 1);

  history.push(snap);

  if (history.length > HISTORY_MAX) history.shift();
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

  await setShape(snap.shape, { skipHistory: true });

  if (!snap.templateId) {
    clearTemplateSelection({ skipHistory: true });
  } else {
    currentTemplate = { id: snap.templateId, name: snap.templateId };
    await applyTemplate(currentTemplate, { skipHistory: true, silentErrors: true });
  }

  rotationDeg = normDeg(snap.rotationDeg);
  ensureCoverScaleForRotation();

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
  markDirty();
}

async function redo() {
  if (historyIndex >= history.length - 1) return;
  historyIndex++;
  await applyStateFromHistory(history[historyIndex]);
  markDirty();
}

/* ===================== [SEKCJA 4] KSZTAŁT ===================== */
async function setShape(next, opts = {}) {
  shape = next;

  if (btnSquare) btnSquare.classList.toggle("active", shape === "square");
  if (btnCircle) btnCircle.classList.toggle("active", shape === "circle");

  applyMaskForShape(shape);

  redraw();
  updateStatusBar();

  if (!opts.skipHistory) pushHistory();
  if (!opts.skipHistory) markDirty();
}

if (btnSquare) btnSquare.addEventListener("click", () => setShape("square"));
if (btnCircle) btnCircle.addEventListener("click", () => setShape("circle"));

/* ===================== [SEKCJA 5] RYSOWANIE ===================== */
function clear() {
  ctx.clearRect(0, 0, CANVAS_PX, CANVAS_PX);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);
}

function requiredScaleForRotation(iw, ih, rad) {
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  const sx = CANVAS_PX / (c * iw + s * ih);
  const sy = CANVAS_PX / (s * iw + c * ih);
  return Math.max(sx, sy);
}

function ensureCoverScaleForRotation() {
  if (!uploadedImg) return;
  const iw = uploadedImg.naturalWidth;
  const ih = uploadedImg.naturalHeight;
  const rad = degToRad(rotationDeg);
  coverScale = requiredScaleForRotation(iw, ih, rad);
}

function applyClampToOffsets() {
  if (!uploadedImg) return;

  const iw = uploadedImg.naturalWidth;
  const ih = uploadedImg.naturalHeight;

  const rad = degToRad(rotationDeg);
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));

  const scale = coverScale * userScale;
  const w = iw * scale;
  const h = ih * scale;

  const ex = (c * w + s * h) / 2;
  const ey = (s * w + c * h) / 2;

  let cx = CANVAS_PX / 2 + offsetX;
  let cy = CANVAS_PX / 2 + offsetY;

  const minCx = CANVAS_PX - ex;
  const maxCx = ex;
  const minCy = CANVAS_PX - ey;
  const maxCy = ey;

  cx = clamp(cx, minCx, maxCx);
  cy = clamp(cy, minCy, maxCy);

  offsetX = cx - CANVAS_PX / 2;
  offsetY = cy - CANVAS_PX / 2;
}

function drawPhotoTransformed(img) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;

  const rad = degToRad(rotationDeg);
  const scale = coverScale * userScale;

  const w = iw * scale;
  const h = ih * scale;

  const cx = CANVAS_PX / 2 + offsetX;
  const cy = CANVAS_PX / 2 + offsetY;

  ctx.save();
  ctx.translate(cx, cy);
  if (rotationDeg) ctx.rotate(rad);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
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

  rotationDeg = 0;
  ensureCoverScaleForRotation();

  userScale = 1.0;
  offsetX = 0;
  offsetY = 0;

  applyClampToOffsets();
}

if (photoInput) {
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

      refreshExportButtons();

      toast("Zdjęcie wgrane ✅");
      maybeWarnQuality(true);

      markDirty();

      URL.revokeObjectURL(url);
    };

    img.src = url;
  });
}

/* ===================== [OBRÓT] ===================== */
function setRotation(nextDeg, opts = {}) {
  if (!uploadedImg) {
    toast("Najpierw wgraj zdjęcie.");
    return;
  }

  rotationDeg = normDeg(nextDeg);
  ensureCoverScaleForRotation();

  applyClampToOffsets();
  redraw();
  updateStatusBar();
  maybeWarnQuality(false);

  if (!opts.skipHistory) pushHistory();
  if (!opts.skipHistory) markDirty();
}

function rotateBy(deltaDeg) {
  setRotation(rotationDeg + deltaDeg);
  toast(`Obrócono: ${rotationDeg}°`);
}

if (btnRotateLeft) btnRotateLeft.addEventListener("click", () => rotateBy(-30));
if (btnRotateRight) btnRotateRight.addEventListener("click", () => rotateBy(+30));
if (btnRotateReset) btnRotateReset.addEventListener("click", () => setRotation(0));

/* ===================== [DRAG + ZOOM] ===================== */
function clientToCanvasPx(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  const scale = CANVAS_PX / r.width;
  const x = (clientX - r.left) * scale;
  const y = (clientY - r.top) * scale;
  return { x, y };
}

function setUserScaleKeepingPoint(newUserScale) {
  if (!uploadedImg) return;

  newUserScale = clamp(newUserScale, MIN_USER_SCALE, MAX_USER_SCALE);
  userScale = newUserScale;

  applyClampToOffsets();
  redraw();
  updateStatusBar();
  maybeWarnQuality(false);

  markDirty();
}

function fitToCover() {
  if (!uploadedImg) return;
  ensureCoverScaleForRotation();
  userScale = 1.0;
  offsetX = 0;
  offsetY = 0;
  applyClampToOffsets();
  redraw();
  updateStatusBar();
  pushHistory();
  toast("Dopasowano kadr");
  maybeWarnQuality(false);
  markDirty();
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
  markDirty();
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

    if (pinchStartDist > 0) {
      const factor = d / pinchStartDist;
      const nextScale = pinchStartScale * factor;
      setUserScaleKeepingPoint(nextScale);
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
      if (gestureMoved) {
        pushHistory();
        markDirty();
      }
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

    const zoom = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    setUserScaleKeepingPoint(userScale * zoom);

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
    markDirty();
    wheelTimer = 0;
  }, 180);
}

/* ===================== [TOOLBAR] ===================== */
if (btnFit) btnFit.addEventListener("click", fitToCover);
if (btnCenter) btnCenter.addEventListener("click", centerPhoto);

if (btnZoomIn) {
  btnZoomIn.addEventListener("click", () => {
    if (!uploadedImg) return toast("Najpierw wgraj zdjęcie.");
    setUserScaleKeepingPoint(userScale * 1.12);
    pushHistory();
    markDirty();
  });
}

if (btnZoomOut) {
  btnZoomOut.addEventListener("click", () => {
    if (!uploadedImg) return toast("Najpierw wgraj zdjęcie.");
    setUserScaleKeepingPoint(userScale / 1.12);
    pushHistory();
    markDirty();
  });
}

if (btnUndo) btnUndo.addEventListener("click", undo);
if (btnRedo) btnRedo.addEventListener("click", redo);

/* ===================== [SEKCJA 7] SZABLONY ===================== */
async function fetchJsonFirstOk(urls) {
  let lastErr = null;
  for (const u of urls) {
    try {
      const res = await fetch(withV(u), { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Brak źródła JSON");
}

async function loadTemplates() {
  const candidates = [
    `${REPO_BASE}/api/templates.php`,
    `${REPO_BASE}/assets/templates/list.json`,
    `${REPO_BASE}/assets/templates/index.json`,
  ];

  const data = await fetchJsonFirstOk(candidates);

  const list =
    Array.isArray(data?.coasters) ? data.coasters :
    Array.isArray(data?.templates) ? data.templates :
    [];

  const normalized = list
    .filter((t) => t && t.id)
    .map((t) => ({ id: t.id, name: t.title || t.name || t.id }));

  return [{ id: "__none__", name: "Brak szablonu" }, ...normalized];
}

function templateFolderUrl(id) {
  return `${REPO_BASE}/assets/templates/coasters/${encodeURIComponent(id)}/`;
}

function renderTemplateGrid(templates) {
  if (!templateGrid) return;
  templateGrid.innerHTML = "";

  templates.forEach((t) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "templateItem";

    if (t.id === "__none__") {
      item.textContent = "Brak";
      item.classList.add("templateItem--none");
      item.onclick = () => {
        clearTemplateSelection();
        markDirty();
      };
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
      markDirty();
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
      derr("Nie mogę wczytać:", url);
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

/* ===================== [SEKCJA 8] EKSPORT / NAZWY ===================== */
function safeFileToken(raw, fallback = "projekt") {
  let s = String(raw || "").trim();
  if (!s) return fallback;

  s = s.normalize("NFC");

  s = s.replace(/[\u0000-\u001F\u007F]/g, "");
  s = s.replace(/[\\\/:*?"<>|]/g, "_");
  s = s.replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^\.+/, "");
  s = s.slice(0, 60);

  return s || fallback;
}

function sanitizeFileBase(raw) {
  return safeFileToken(raw, "projekt");
}

function sanitizeOrderId(raw) {
  return safeFileToken(raw, "").slice(0, 60);
}

if (btnDownloadPreview) {
  btnDownloadPreview.addEventListener("click", () => {
    if (!uploadedImg) {
      toast("Najpierw wgraj zdjęcie, aby pobrać podgląd.");
      return;
    }

    const a = document.createElement("a");
    const nick = sanitizeFileBase(nickInput?.value);
    a.download = `${nick}_preview.jpg`;
    a.href = canvas.toDataURL("image/jpeg", 0.70);
    a.click();
    toast("Zapisano PODGLĄD JPG ✅");
  });
}

/* ===================== [SEKCJA 8B] WYŚLIJ DO REALIZACJI ===================== */
let productionLocked = false;

function setBusyOverlay(visible, msg) {
  if (!busyOverlay) return;
  busyOverlay.style.display = visible ? "flex" : "none";
  if (busyOverlayMsg && typeof msg === "string") busyOverlayMsg.textContent = msg;
}

function setUiLocked(locked, busyMsg = "Trwa operacja…") {
  productionLocked = locked;

  const ids = [
    "btnSquare", "btnCircle",
    "btnUndo", "btnRedo",
    "btnZoomOut", "btnZoomIn", "btnFit", "btnCenter",
    "btnRotateLeft", "btnRotateRight", "btnRotateReset",
    "btnThemeLight", "btnThemeDark",
    "btnDownloadPreview",
    "btnSendToProduction"
  ];

  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = locked;
  });

  if (photoInput) photoInput.disabled = locked;
  if (nickInput) nickInput.disabled = locked;

  if (templateGrid) {
    templateGrid.querySelectorAll("button").forEach((b) => (b.disabled = locked));
    templateGrid.style.opacity = locked ? "0.6" : "1";
    templateGrid.style.pointerEvents = locked ? "none" : "auto";
  }

  if (canvas) canvas.style.opacity = locked ? "0.85" : "1";

  document.documentElement.setAttribute("aria-busy", locked ? "true" : "false");
  setBusyOverlay(locked, busyMsg);

  refreshExportButtons();
}

function showFinalOverlay(title, msg) {
  setBusyOverlay(false);

  if (!finalOverlay) {
    alert(`${title}\n\n${msg}`);
    return;
  }
  if (finalOverlayTitle) finalOverlayTitle.textContent = title;
  if (finalOverlayMsg) finalOverlayMsg.textContent = msg;

  finalOverlay.style.display = "flex";
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
}

function showErrorOverlay(title, msg) {
  setBusyOverlay(false);

  if (!errorOverlay) {
    alert(`${title}\n\n${msg}`);
    return;
  }
  if (errorOverlayTitle) errorOverlayTitle.textContent = title || "Nie udało się wysłać";
  if (errorOverlayMsg) errorOverlayMsg.textContent = msg || "Wystąpił błąd. Spróbuj ponownie.";

  errorOverlay.style.display = "flex";
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
}

function closeErrorOverlay() {
  if (!errorOverlay) return;
  const ae = document.activeElement;
  if (ae && errorOverlay.contains(ae)) {
    try { ae.blur(); } catch {}
  }
  errorOverlay.style.display = "none";
  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";
}

function renderProductionWithPrintOverlayToBlob(mime, qualityOrNull) {
  return new Promise((resolve, reject) => {
    if (!uploadedImg) return reject(new Error("Brak zdjęcia"));

    const finish = () => {
      try {
        canvas.toBlob(
          (blob) => {
            redraw();
            if (!blob) return reject(new Error("Nie udało się wygenerować pliku"));
            resolve(blob);
          },
          mime,
          qualityOrNull == null ? undefined : qualityOrNull
        );
      } catch (e) {
        redraw();
        reject(e);
      }
    };

    if (!currentTemplate) {
      try {
        clear();
        drawPhotoTransformed(uploadedImg);
        finish();
      } catch (e) {
        redraw();
        reject(e);
      }
      return;
    }

    const printUrl = withV(templateFolderUrl(currentTemplate.id) + "print.png");
    const printImg = new Image();
    printImg.crossOrigin = "anonymous";

    printImg.onload = () => {
      try {
        clear();
        drawPhotoTransformed(uploadedImg);
        ctx.drawImage(printImg, 0, 0, CANVAS_PX, CANVAS_PX);
        finish();
      } catch (e) {
        redraw();
        reject(e);
      }
    };

    printImg.onerror = () => reject(new Error("Nie mogę wczytać print.png (do realizacji)"));
    printImg.src = printUrl;
  });
}

function renderProductionJpgBlob() {
  return renderProductionWithPrintOverlayToBlob("image/jpeg", 1.0);
}

const PROJECT_JSON_SCHEMA_VERSION = 1;

function roundNum(x, digits = 6) {
  const n = Number(x);
  if (!Number.isFinite(n)) return null;
  const m = Math.pow(10, digits);
  return Math.round(n * m) / m;
}

function buildProjectJson() {
  const nick = (nickInput?.value || "").trim();
  const dpi = getEffectiveDpi();
  const orderId =
    sanitizeOrderId(urlOrderIdRaw) ||
    sanitizeOrderId(nick) ||
    "";

  const nowIso = new Date().toISOString();

  const payload = {
    schema_version: PROJECT_JSON_SCHEMA_VERSION,
    app: { name: "coaster-editor", version: CACHE_VERSION, repo_base: REPO_BASE },
    created_at_iso: nowIso,
    source_url: location.href,

    order: {
      nick: nick || "",
      order_id: orderId || "",
      url_nick_raw: urlNickRaw || "",
      url_order_id_raw: urlOrderIdRaw || "",
    },

    product: { type: "coaster", shape: shape, size_mm: { w: 100, h: 100 } },

    template: currentTemplate
      ? { id: String(currentTemplate.id || ""), name: String(currentTemplate.name || currentTemplate.id || "") }
      : null,

    transform: {
      coverScale: roundNum(coverScale, 8),
      userScale: roundNum(userScale, 8),
      offsetX: roundNum(offsetX, 3),
      offsetY: roundNum(offsetY, 3),
      rotation_deg: rotationDeg,
      canvas_px: CANVAS_PX,
      print_dpi: PRINT_DPI,
      cut_ratio: CUT_RATIO,
    },

    quality: { effective_dpi: dpi == null ? null : Math.round(dpi), label: qualityLabelFromDpi(dpi) },

    // legacy
    cache_version: CACHE_VERSION,
    ts_iso: nowIso,
    nick: nick,
    shape: shape,
    dpi: dpi == null ? null : Math.round(dpi),
    url: location.href,
  };

  return JSON.stringify(payload, null, 2);
}

async function uploadToServer(blob, jsonText, filename) {
  const fd = new FormData();

  const orderId =
    sanitizeOrderId(urlOrderIdRaw) ||
    sanitizeOrderId(nickInput?.value || "");

  if (orderId) fd.append("order_id", orderId);

  fd.append("png", blob, filename);
  fd.append("json", jsonText);

  const res = await fetch(UPLOAD_ENDPOINT, {
    method: "POST",
    headers: { "X-Upload-Token": UPLOAD_TOKEN },
    body: fd,
  });

  const txt = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`Upload HTTP ${res.status}: ${txt || "błąd"}`);

  let data = null;
  try { data = txt ? JSON.parse(txt) : null; } catch {}

  if (data && data.ok === false) throw new Error(data.error || "Upload nieudany");
  return data || { ok: true };
}

/* ===================== [MODAL NICK] ===================== */
let pendingSendAfterNick = false;
let lastFocusElBeforeModal = null;

function focusNickFieldWithHint() {
  const msg = "Uzupełnij podpis / nick (np. nazwisko lub nr zamówienia), aby wysłać projekt do realizacji.";
  toast(msg);

  if (nickInput) {
    try { nickInput.focus({ preventScroll: true }); } catch { try { nickInput.focus(); } catch {} }
    try { nickInput.scrollIntoView({ behavior: "smooth", block: "center" }); } catch {}
    nickInput.style.outline = "2px solid #f59e0b";
    setTimeout(() => { nickInput.style.outline = ""; }, 1200);
  } else {
    alert(msg);
  }
}

function openNickModal() {
  if (!nickModal || !nickModalInput || !nickModalSave) {
    focusNickFieldWithHint();
    return;
  }

  pendingSendAfterNick = true;
  lastFocusElBeforeModal = document.activeElement;

  nickModal.style.display = "flex";
  nickModal.setAttribute("aria-hidden", "false");

  if (nickModalHint) nickModalHint.style.display = "none";

  const current = (nickInput?.value || "").trim();
  nickModalInput.value = current;
  setTimeout(() => nickModalInput.focus(), 0);

  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
}

function closeNickModal(opts = { cancel: false }) {
  if (opts?.cancel) pendingSendAfterNick = false;
  if (!nickModal) return;

  const ae = document.activeElement;
  if (ae && nickModal.contains(ae)) {
    try { ae.blur(); } catch {}
  }

  nickModal.style.display = "none";
  nickModal.setAttribute("aria-hidden", "true");

  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";

  setTimeout(() => {
    if (nickInput) nickInput.focus();
    else if (lastFocusElBeforeModal && typeof lastFocusElBeforeModal.focus === "function") {
      lastFocusElBeforeModal.focus();
    }
  }, 0);
}

function confirmNickFromModal() {
  const v = (nickModalInput?.value || "").trim();
  if (!v) {
    if (nickModalHint) nickModalHint.style.display = "block";
    if (nickModalInput) {
      nickModalInput.style.borderColor = "#ef4444";
      nickModalInput.focus();
    }
    return;
  }

  if (nickInput) {
    nickInput.value = v;
    markDirty();
  }
  if (nickModalInput) nickModalInput.style.borderColor = "#e5e7eb";

  const shouldSend = pendingSendAfterNick === true;

  closeNickModal({ cancel: false });

  if (shouldSend) {
    pendingSendAfterNick = false;
    sendToProduction(true);
  }
}

if (nickModalClose) nickModalClose.addEventListener("click", () => closeNickModal({ cancel: true }));
if (nickModalCancel) nickModalCancel.addEventListener("click", () => closeNickModal({ cancel: true }));
if (nickModalSave) nickModalSave.addEventListener("click", confirmNickFromModal);

if (nickModal) {
  nickModal.addEventListener("click", (e) => {
    if (e.target === nickModal) closeNickModal({ cancel: true });
  });
}

window.addEventListener("keydown", (e) => {
  if (!nickModal || nickModal.style.display !== "flex") return;

  if (e.key === "Escape") {
    e.preventDefault();
    closeNickModal({ cancel: true });
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    confirmNickFromModal();
    return;
  }
});

/* ===================== [SEND] ===================== */
function dpiWarningText(dpi) {
  if (dpi == null) return null;

  const v = Math.round(dpi);
  const q = qualityLabelFromDpi(dpi);

  const common =
    `Wykryta jakość: ${q} (ok. ${v} DPI).\n\n` +
    `To wynika z rozdzielczości oryginalnego zdjęcia i aktualnego powiększenia w edytorze.\n` +
    `Jeśli zaakceptujesz, wydruk może być mniej ostry/pikselowy.\n\n`;

  if (dpi < DPI_WEAK_MAX) return common + "Czy mimo to chcesz wysłać projekt do realizacji?";
  if (dpi < DPI_MED_MAX) return common + "Czy mimo to chcesz kontynuować wysyłkę?";
  return null;
}

async function sendToProduction(skipNickCheck = false) {
  if (productionLocked) return;

  if (!uploadedImg) {
    toast("Najpierw wgraj zdjęcie.");
    return;
  }

  const nick = (nickInput?.value || "").trim();
  if (!skipNickCheck && !nick) {
    openNickModal();
    return;
  }

  const first = window.confirm("Czy na pewno chcesz wysłać projekt do realizacji?");
  if (!first) return;

  const dpi = getEffectiveDpi();
  const dpiWarn = dpiWarningText(dpi);
  if (dpiWarn) {
    const ok = window.confirm(dpiWarn);
    if (!ok) return;
  }

  const second = window.confirm(
    "To ostatni krok.\n\nPo wysłaniu projekt trafia do produkcji i nie będzie można wprowadzić zmian.\n\nKontynuować?"
  );
  if (!second) return;

  closeErrorOverlay();
  setUiLocked(true, "Trwa wysyłanie do realizacji…");
  toast("Wysyłanie do realizacji…");

  try {
    const jsonText = buildProjectJson();
    const jpgBlob = await renderProductionJpgBlob();
    await uploadToServer(jpgBlob, jsonText, "projekt_PRINT.jpg");

    markClean();
    setBusyOverlay(false);

    showFinalOverlay(
      "Wysłano do realizacji ✅",
      "Projekt został przekazany do produkcji. Zmiana nie będzie możliwa."
    );
  } catch (err) {
    derr(err);
    setUiLocked(false);

    const msg =
      "Nie udało się wysłać projektu.\n\n" +
      "Sprawdź połączenie z internetem i spróbuj ponownie.\n\n" +
      (DEBUG ? `Szczegóły: ${String(err)}` : "");

    showErrorOverlay("Błąd wysyłania", msg);
    toast("Błąd wysyłania. Spróbuj ponownie.");
  }
}

if (btnSendToProduction) {
  btnSendToProduction.addEventListener("click", () => sendToProduction(false));
}
if (nickInput) {
  nickInput.addEventListener("input", () => markDirty());
}

/* ===================== [ERROR OVERLAY BUTTONS] ===================== */
if (errorOverlayRetry) {
  errorOverlayRetry.addEventListener("click", (e) => {
    e.preventDefault();
    closeErrorOverlay();
    sendToProduction(false);
  });
}
if (errorOverlayClose) {
  errorOverlayClose.addEventListener("click", (e) => {
    e.preventDefault();
    closeErrorOverlay();
  });
}
if (errorOverlay) {
  errorOverlay.addEventListener("click", (e) => {
    if (e.target === errorOverlay) closeErrorOverlay();
  });
}

/* ===================== [START] ===================== */
(async function init() {
  initTheme();
  wireThemeButtons();

  updateUiVersionBadge();
  applyNickFromUrlIfEmpty();

  await setShape("square", { skipHistory: true });
  clearTemplateSelection({ skipHistory: true });

  // Na starcie: brak zdjęcia => eksport ma być zablokowany
  refreshExportButtons();

  try {
    const templates = await loadTemplates();
    renderTemplateGrid(templates);
  } catch (err) {
    derr(err);
    if (templateGrid) templateGrid.innerHTML = `<div class="smallText">Nie udało się wczytać szablonów.</div>`;
    toast("Nie udało się wczytać szablonów.");
  }

  redraw();
  updateStatusBar();
  pushHistory();

  markClean();
  dlog("Loaded", { CACHE_VERSION, DEBUG });
})();

/* === KONIEC PLIKU — editor/editor.js | FILE_VERSION: 2026-02-09-17 === */
