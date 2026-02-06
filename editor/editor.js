/**
 * Edytor podkładek — wersja prosta
 * - GitHub Pages nie potrafi listować katalogów → używamy index.json
 * - Wyświetlamy miniatury (thumb.webp)
 * - Na podgląd nakładamy edit.png (ramka do projektowania)
 * - Print (print.png) pobieramy jako plik „produkcyjny” (tymczasowo)
 */

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

// Stan
let shape = "square";              // square | circle
let uploadedImg = null;            // Image()
let currentTemplate = null;        // { id, name, thumb, edit, print }
let templateEditImg = null;        // Image() — overlay do podglądu

// Ustawienia wizualne
function setShape(next) {
  shape = next;

  btnSquare.classList.toggle("active", shape === "square");
  btnCircle.classList.toggle("active", shape === "circle");

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

btnSquare.addEventListener("click", () => setShape("square"));
btnCircle.addEventListener("click", () => setShape("circle"));

// Rysowanie
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

  // (Na razie nie rysujemy tekstu — dodamy w kolejnym kroku)
}

photoInput.addEventListener("change", async (e) => {
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

// Templates (index.json)
async function loadTemplates() {
  // Ścieżka względna do editor/
  // editor/… → assets/… to: ../assets/…
  const res = await fetch("../assets/templates/coasters/index.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Nie mogę wczytać index.json z szablonami.");
  const data = await res.json();
  return data.templates || [];
}

function templateFolderUrl(id) {
  return `../assets/templates/coasters/${encodeURIComponent(id)}/`;
}

function renderTemplateGrid(templates) {
  templateGrid.innerHTML = "";

  templates.forEach((t) => {
    const item = document.createElement("div");
    item.className = "templateItem";
    item.title = t.name || t.id;

    const img = document.createElement("img");
    img.alt = t.name || t.id;
    img.src = templateFolderUrl(t.id) + "thumb.webp";

    item.appendChild(img);

    item.addEventListener("click", async () => {
      currentTemplate = t;
      await applyTemplate(t);
    });

    templateGrid.appendChild(item);
  });
}

async function applyTemplate(t) {
  // Wczytaj edit.png i odrysuj
  const url = templateFolderUrl(t.id) + "edit.png";
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    templateEditImg = img;
    redraw();
  };
  img.src = url;
}

btnDownloadPreview.addEventListener("click", () => {
  // Zapis podglądu (to co widzi klient)
  const a = document.createElement("a");
  const nick = (nickInput.value || "projekt").trim().replace(/[^\w\-]+/g, "_");
  a.download = `${nick}_preview.png`;
  a.href = canvas.toDataURL("image/png");
  a.click();
});

btnDownloadPrint.addEventListener("click", async () => {
  if (!currentTemplate) {
    alert("Najpierw wybierz szablon (opcjonalnie), żeby pobrać plik print.png.");
    return;
  }
  const url = templateFolderUrl(currentTemplate.id) + "print.png";

  // Pobierz plik bez otwierania nowej karty
  const a = document.createElement("a");
  const nick = (nickInput.value || "projekt").trim().replace(/[^\w\-]+/g, "_");
  a.download = `${nick}_${currentTemplate.id}_print.png`;
  a.href = url;
  a.click();
});

// Start
(async function init() {
  setShape("square");

  try {
    const templates = await loadTemplates();
    renderTemplateGrid(templates);

    // automatycznie wybierz pierwszy template jako demo (możesz wywalić)
    if (templates[0]) {
      currentTemplate = templates[0];
      await applyTemplate(templates[0]);
    }
  } catch (err) {
    console.error(err);
    templateGrid.innerHTML = `<div class="smallText">Nie udało się wczytać szablonów. Sprawdź, czy istnieje plik: assets/templates/coasters/index.json</div>`;
  }

  redraw();
})();
