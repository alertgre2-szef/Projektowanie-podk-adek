/**
 * ============================================================
 * Edytor podkładek — wersja prosta (GitHub Pages)
 * ============================================================
 * Założenia:
 * - GitHub Pages nie listuje katalogów → używamy pliku index.json
 * - Wyświetlamy miniatury (thumb.webp)
 * - Na podgląd nakładamy edit.png (ramka do projektowania)
 * - Print (print.png) pobieramy jako plik „produkcyjny” (tymczasowo)
 *
 * Najczęstsze problemy:
 * - zła ścieżka do index.json
 * - inna struktura JSON (coasters vs templates)
 * - brak danych → brak miniatur
 * ============================================================
 */


/* ============================================================
   [SEKCJA 0] Diagnostyka / logi
   ============================================================ */
console.log("✅ editor.js załadowany | path:", location.pathname);
window.addEventListener("unhandledrejection", (e) => {
  console.error("❌ Unhandled Promise Rejection:", e.reason);
});


/* ============================================================
   [SEKCJA 1] Stałe i elementy DOM
   ============================================================ */
const CANVAS_PX = 1181; // 10cm @ 300dpi ≈ 1181px
const CUT_RATIO = 0.90; // 9/10 = 0.9

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const photoInput = document.getElementById("photoInput");
const nickInput = document.getElementById("nickInput");

const btnSquare = document.getElementById("btnSquare");
const btnCircle = document.getElementById("btnCircle");

const clipLayer = document.getElementById("clipLayer");
const cutGuide = document.getElementById("cutGuide");

const templateGrid = document.getElementById("templateGrid");

const btnDownloadPreview = document.getElementById("btnDownloadPreview");
const btnDownloadPrint = document.getElementById("btnDownloadPrint");


/* ============================================================
   [SEKCJA 2] Stan aplikacji
   ============================================================ */
let shape = "square";              // square | circle
let uploadedImg = null;            // Image()
let currentTemplate = null;        // { id, name, thumb, edit, print }
let templateEditImg = null;        // Image() — overlay do podglądu


/* ============================================================
   [SEKCJA 3] Ustawienia wizualne / zmiana kształtu
   ============================================================ */
function setShape(next) {
  shape = next;

  // UI: aktywny przycisk
  btnSquare?.classList.toggle("active", shape === "square");
  btnCircle?.classList.toggle("active", shape === "circle");

  // Klip na podglądzie (tylko wizualnie)
  if (shape === "circle") {
    clipLayer.style.clipPath = "circle(50% at 50% 50%)";
    cutGuide.style.borderRadius = "999px";
  } else {
    // zaokrąglenie R=5mm → w px: 5mm = 0.5cm → 0.5cm * 1181px/10cm ≈ 59px
    const rPx = Math.round(CANVAS_PX * 0.05); // 5% z 1181 ≈ 59
    clipLayer.style.clipPath = `inset(0 round ${rPx}px)`;
    cutGuide.style.borderRadius = "10px";
  }

  redraw();
}

// Podpinamy przyciski kształtu (jeśli elementy istnieją)
if (btnSquare && btnCircle) {
  btnSquare.addEventListener("click", () => setShape("square"));
  btnCircle.addEventListener("click", () => setShape("circle"));
} else {
  console.warn("⚠️ Brak btnSquare/btnCircle w DOM — sprawdź index.html");
}


/* ============================================================
   [SEKCJA 4] Rysowanie na canvas (podgląd)
   ============================================================ */
function clear() {
  ctx.clearRect(0, 0, CANVAS_PX, CANVAS_PX);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);
}

function drawPhotoCover(img) {
  // Prosty „cover” na całe 10x10
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const scale = Math.max(CANVAS_PX / iw, CANVAS_PX / ih);
  const w = iw * scale;
  const h = ih * scale;
  const x = (CANVAS_PX - w) / 2;
  const y = (CANVAS_PX - h) / 2;
  ctx.drawImage(img, x, y, w, h);
}

function drawTemplateEditOverlay() {
  if (!templateEditImg) return;
  ctx.drawImage(templateEditImg, 0, 0, CANVAS_PX, CANVAS_PX);
}

function redraw() {
  clear();

  if (uploadedImg) {
    drawPhotoCover(uploadedImg);
  }

  // Nakładka „edit”
  drawTemplateEditOverlay();

  // (Tekst dodamy później)
}


/* ============================================================
   [SEKCJA 5] Wgrywanie zdjęcia
   ============================================================ */
photoInput?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    uploadedImg = img;
    redraw();
    URL.revokeObjectURL(url);
  };
  img.src = url;
});


/* ============================================================
   [SEKCJA 6] Szablony (index.json) + miniatury
   ============================================================ */

/**
 * Uwaga dot. GH Pages:
 * Repo jest pod adresem:
