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

// Progi ostrzeżeń (możesz zmienić, jeśli chcesz bardziej/ mniej czułe)
const WARN_DPI = 260;      // ostrzeżenie
const STRONG_WARN_DPI = 200; // mocne ostrzeżenie

const REPO_BASE = (() => {
  const p = location.pathname;
  const i = p.indexOf("/editor/");
  return i >= 0 ? p.slice(0, i) : "";
})();

const CACHE_VERSION = "2026-02-06-07";
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

/**
 * Transform zdjęcia:
 * - coverScale: automatyczny “cover” na start
 * - userScale: zoom użytkownika
 * - offsetX/Y: przesunięcie w px
 */
let coverScale = 1;
let userScale = 1;
let offsetX = 0;
let offsetY = 0;

const MIN_USER_SCALE = 1.0;
const MAX_USER_SCALE = 6.0;

/* ===================== [SEKCJA 3B] TOAST + STATUS + HISTORIA + JAKOŚĆ ===================== */
function toast(msg, ms = 2400) {
  if (!toastContainer) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  toastContainer.appendChild(el);

  window.setTimeout(() => {
    el.remove();
  }, ms);
}

function fmtZoomPct() {
  return `${Math.round(userScale * 100)}%`;
}

function templateName() {
  if (!currentTemplate) return "—";
  return currentTemplate?.name || currentTemplate?.id || "—";
}

/* --- JAKOŚĆ / DPI --- */
function getEffectiveDpi() {
  if (!uploadedImg) return null;
  const s = coverScale * userScale;
  if (!s || s <= 0) return null;
  // gdy s>1 obraz jest powiększany => DPI spada
  return PRINT_DPI / s;
}

let qualityWarnLevel = 0; // 0=brak, 1=warn, 2=strong (żeby nie spamować)
function maybeWarnQuality(force = false) {
  if (!uploadedImg) return;

  const dpi = getEffectiveDpi();
  if (!dpi) return;

  // ustal poziom ostrzeżenia
  let level = 0;
  if (dpi < STRONG_WARN_DPI) level = 2;
  else if (dpi < WARN_DPI) level = 1;

  if (!force && level <= qualityWarnLevel) return;

  qualityWarnLevel = level;

  if (level === 2) {
    toast(
      `Uwaga: jakość może być słaba (ok. ${Math.round(dpi)} DPI). ` +
      `Najlepiej wygląda zdjęcie z oryginału (np. prosto z aparatu/tel
