/**
 * ============================================================
 * Edytor podkładek — wersja prosta (UX+)
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

const CACHE_VERSION = "2026-02-08-01";
function withV(url) {
  return `${url}?v=${encodeURIComponent(CACHE_VERSION)}`;
}

/* ===================== [UPLOAD DO REALIZACJI] ===================== */
const UPLOAD_ENDPOINT = `${REPO_BASE}/api/upload.php`;
const UPLOAD_TOKEN = "4f9c7d2a8e1b5f63c0a9e72d41f8b6c39e5a0d7f1b2c8e4a6d9f3c1b7e0a2f5";

/* ===================== [SEKCJA 2] DOM ===================== */
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const previewEl = document.getElementById("preview");

const photoInput = document.getElementById("photoInput");
const nickInput = document.getElementById("nickInput");

const btnSquare = document.getElementById("btnSquare");
const btnCircle = document.getElementById("btnCircle");

const clipLayer = document.getElementById("clipLayer");
const shadeLayer = document.getElementById("shadeLayer");
const dangerLayer = document.getElementById("dangerLayer");
const cutGuide = document.getElementById("cutGuide");
const safeGuide = document.getElementById("safeGuide");

const templateGrid = document.getElementById("templateGrid");

const btnDownloadPreview = document.getElementById("btnDownloadPreview");

const btnUndo = document.getElementById("btnUndo");
const btnRedo = document.getElementById("btnRedo");
const btnZoomOut = document.getElementById("btnZoomOut");
const btnZoomIn = document.getElementById("btnZoomIn");
const btnFit = document.getElementById("btnFit");
const btnCenter = document.getElementById("btnCenter");

const btnSendToProduction = document.getElementById("btnSendToProduction");

const statusBar = document.getElementById("statusBar");
const toastContainer = document.getElementById("toastContainer");

const finalOverlay = document.getElementById("finalOverlay");
const finalOverlayTitle = document.getElementById("finalOverlayTitle");
const finalOverlayMsg = document.getElementById("finalOverlayMsg");

// MODAL nick
const nickModal = document.getElementById("nickModal");
const nickModalInput = document.getElementById("nickModalInput");
const nickModalClose = document.getElementById("nickModalClose");
const nickModalCancel = document.getElementById("nickModalCancel");
const nickModalSave = document.getElementById("nickModalSave");
const nickModalHint = document.getElementById("nickModalHint");

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
const TOAST_DEFAULT_MS = 20000;

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

/* ===================== [SEKCJA 4] KSZTAŁT + SPADY + SAFE + DANGER ===================== */
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

let dangerRingEl = null;
function renderDangerOverlay() {
  if (!dangerLayer || !previewEl) return;

  if (!dangerRingEl) {
    dangerRingEl = document.createElement("div");
    dangerRingEl.style.position = "absolute";
    dangerRingEl.style.boxSizing = "border-box";
    dangerRingEl.style.pointerEvents = "none";
    dangerRingEl.style.zIndex = "14";
    dangerRingEl.style.mixBlendMode = "multiply";
    dangerLayer.appendChild(dangerRingEl);
  }

  const r = previewEl.getBoundingClientRect();
  const size = Math.min(r.width, r.height);

  const insetPx = Math.round(size * 0.05);
  const thickPx = Math.round(size * 0.05);

  dangerRingEl.style.left = `${insetPx}px`;
  dangerRingEl.style.top = `${insetPx}px`;
  dangerRingEl.style.width = `${Math.max(0, size - insetPx * 2)}px`;
  dangerRingEl.style.height = `${Math.max(0, size - insetPx * 2)}px`;
  dangerRingEl.style.border = `${thickPx}px solid rgba(255, 208, 0, 0.22)`;

  if (shape === "
