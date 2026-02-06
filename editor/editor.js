/**
 * ============================================================
 * Edytor podkładek — wersja prosta
 * ============================================================
 * Źródło listy szablonów: assets/templates/index.json
 * Struktura:
 * {
 *   "coasters": [
 *     { "id": "ramka_01", "title": "Ramka 01" },
 *     ...
 *   ]
 * }
 *
 * Pliki szablonu:
 * assets/templates/coasters/<id>/thumb.webp
 * assets/templates/coasters/<id>/edit.png
 * assets/templates/coasters/<id>/print.png
 * ============================================================
 */

/* ===================== [SEKCJA 1] STAŁE ===================== */
const CANVAS_PX = 1181; // 10cm @ 300dpi ≈ 1181px
const CUT_RATIO = 0.90; // 9/10 = 0.9 (na razie niewykorzystane w rysowaniu)

/**
 * Baza repo liczona automatycznie (żeby nie wpisywać na sztywno).
 * Dla GH Pages: /Projektowanie-podk-adek/editor/index.html -> /Projektowanie-podk-adek
 */
const REPO_BASE = (() => {
  const p = location.pathname;
  const i = p.indexOf("/editor/");
  return i >= 0 ? p.slice(0, i) : "";
})();

/* ===================== [SEKCJA 2] DOM ===================== */
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

/* ===================== [SEKCJA 3] STAN ===================== */
let shape = "square";              // square | circle
let uploadedImg = null;            // Image()
let currentTemplate = null;        // { id, name }
let templateEditImg = null;        // Image() — overlay do podglądu

/* ===================== [SEKCJA 4] KSZTAŁT ===================== */
function setShape(next) {
  shape = next;

  btnSquare.classList.toggle("active", shape === "square");
  btnCircle.classList.toggle("active", shape === "circle");

  if (shape === "circle") {
    clipLayer.style.clipPath = "circle(50% at 50% 50%)";
    cutGuide.style.borderRadius = "999px";
  } else {
    // R=5mm -> ~59px
    const rPx = Math.round(CANVAS_PX * 0.05);
    clipLayer.style.clipPath = `inset(0 round ${rPx}px)`;
    cutGuide.style.borderRadius = "10px";
  }

  redraw();
}

btnSquare.addEventListener("click", () => setShape("square"));
btnCircle.addEventListener("click", () => setShape("circle"));

/* ===================== [SEKCJA 5] RYSOWANIE ===================== */
function clear() {
  ctx.clearRect(0, 0, CANVAS_PX, CANVAS_PX);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);
}

function drawPhotoCover(img) {
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
  if (uploadedImg) drawPhotoCover(uploadedImg);
  drawTemplateEditOverlay();
}

/* ===================== [SEKCJA 6] WCZYTANIE ZDJĘCIA ===================== */
photoInput.addEventListener("change", (e) => {
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

/* ===================== [SEKCJA 7] SZABLONY ===================== */
async function loadTemplates() {
  const url = `${REPO_BASE}/assets/templates/index.json`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Nie mogę wczytać: ${url} (HTTP ${res.status})`);

  const data = await res.json();
  const list = Array.isArray(data?.coasters) ? data.coasters : [];

  // normalizacja (title -> name)
  return list
    .filter((t) => t && t.id)
    .map((t) => ({ id: t.id, name: t.title || t.name || t.id }));
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
    item.title = t.name || t.id;

    const img = document.createElement("img");
    img.alt = t.name || t.id;
    img.loading = "lazy";
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
  const url = templateFolderUrl(t.id) + "edit.png";
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    templateEditImg = img;
    redraw();
  };
  img.onerror = () => {
    console.error("Nie mogę wczytać:", url);
  };
  img.src = url;
}

/* ===================== [SEKCJA 8] EKSPORT ===================== */
btnDownloadPreview.addEventListener("click", () => {
  const a = document.createElement("a");
  const nick = (nickInput.value || "projekt").trim().replace(/[^\w\-]+/g, "_");
  a.download = `${nick}_preview.png`;
  a.href = canvas.toDataURL("image/png");
  a.click();
});

btnDownloadPrint.addEventListener("click", () => {
  if (!currentTemplate) {
    alert("Najpierw wybierz szablon, żeby pobrać plik print.png.");
    return;
  }

  const url = templateFolderUrl(currentTemplate.id) + "print.png";
  const a = document.createElement("a");
  const nick = (nickInput.value || "projekt").trim().replace(/[^\w\-]+/g, "_");
  a.download = `${nick}_${currentTemplate.id}_print.png`;
  a.href = url;
  a.click();
});

/* ===================== [SEKCJA 9] START ===================== */
(async function init() {
  setShape("square");

  try {
    const templates = await loadTemplates();
    renderTemplateGrid(templates);

    if (templates[0]) {
      currentTemplate = templates[0];
      await applyTemplate(templates[0]);
    }
  } catch (err) {
    console.error(err);
    templateGrid.innerHTML = `<div class="smallText">Nie udało się wczytać szablonów.</div>`;
  }

  redraw();
})();
