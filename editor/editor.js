/**
 * ============================================================
 * Edytor podkładek — wersja prosta
 * ============================================================
 */

/* ===================== [SEKCJA 1] STAŁE ===================== */
const CANVAS_PX = 1181;
const CUT_RATIO = 0.90;

const REPO_BASE = (() => {
  const p = location.pathname;
  const i = p.indexOf("/editor/");
  return i >= 0 ? p.slice(0, i) : "";
})();

const CACHE_VERSION = "2026-02-06-04";
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

const templateGrid = document.getElementById("templateGrid");

const btnDownloadPreview = document.getElementById("btnDownloadPreview");
const btnDownloadPrint = document.getElementById("btnDownloadPrint");

/* ===================== [SEKCJA 3] STAN ===================== */
let shape = "square";
let uploadedImg = null;
let currentTemplate = null;
let templateEditImg = null;

/* ===================== [SEKCJA 4] KSZTAŁT + SPADY ===================== */
function setShadeSquare() {
  // Kwadrat: przygaszenie spadu (poza 9×9) jako 4 pasy
  shadeLayer.style.clipPath = ""; // nie potrzebujemy clip-path (to są pasy)
  shadeLayer.style.background =
    "linear-gradient(rgba(0,0,0,0.50), rgba(0,0,0,0.50)) top / 100% 5% no-repeat," +
    "linear-gradient(rgba(0,0,0,0.50), rgba(0,0,0,0.50)) bottom / 100% 5% no-repeat," +
    "linear-gradient(rgba(0,0,0,0.50), rgba(0,0,0,0.50)) left / 5% 90% no-repeat," +
    "linear-gradient(rgba(0,0,0,0.50), rgba(0,0,0,0.50)) right / 5% 90% no-repeat";
}

function setShadeCircle() {
  // Okrąg: przygaszamy WSZYSTKO poza okręgiem (dziura w środku)
  // 90% średnicy => promień = 45% pełnego pola
  shadeLayer.style.clipPath = ""; // nie używamy clip-path, robimy "dziurę" gradientem
  shadeLayer.style.background =
    "radial-gradient(circle at 50% 50%," +
    "rgba(0,0,0,0) 0 45%," +
    "rgba(0,0,0,0.50) 45% 100%)";
}

function setShape(next) {
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
      item.onclick = clearTemplateSelection;
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
    };

    templateGrid.appendChild(item);
  });
}

async function applyTemplate(t) {
  const url = withV(templateFolderUrl(t.id) + "edit.png");
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

function clearTemplateSelection() {
  currentTemplate = null;
  templateEditImg = null;
  redraw();
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
  if (!uploadedImg) {
    alert("Najpierw wgraj zdjęcie.");
    return;
  }
  if (!currentTemplate) {
    alert("Najpierw wybierz szablon, aby wygenerować plik do druku.");
    return;
  }

  const printUrl = withV(templateFolderUrl(currentTemplate.id) + "print.png");
  const printImg = new Image();
  printImg.crossOrigin = "anonymous";

  printImg.onload = () => {
    clear();
    drawPhotoCover(uploadedImg);
    ctx.drawImage(printImg, 0, 0, CANVAS_PX, CANVAS_PX);

    const a = document.createElement("a");
    const nick = (nickInput.value || "projekt").trim().replace(/[^\w\-]+/g, "_");
    a.download = `${nick}_${currentTemplate.id}_PRINT.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();

    redraw();
  };

  printImg.onerror = () => {
    alert("Nie mogę wczytać print.png dla wybranego szablonu.");
    console.error("Nie mogę wczytać:", printUrl);
  };

  printImg.src = printUrl;
});

/* ===================== [SEKCJA 9] START ===================== */
(async function init() {
  setShape("square");
  clearTemplateSelection();

  try {
    const templates = await loadTemplates();
    renderTemplateGrid(templates);
  } catch (err) {
    console.error(err);
    templateGrid.innerHTML = `<div class="smallText">Nie udało się wczytać szablonów.</div>`;
  }

  redraw();
})();
