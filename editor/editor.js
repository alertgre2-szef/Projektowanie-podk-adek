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

const CACHE_VERSION = "2026-02-06-06";
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

// ważne dla dotyku (żeby nie “scrollowało” strony zamiast przesuwać/zoomować zdjęcie)
canvas.style.touchAction = "none";

/* ===================== [SEKCJA 3] STAN ===================== */
let shape = "square";
let uploadedImg = null;
let currentTemplate = null;
let templateEditImg = null;

/**
 * Transform zdjęcia:
 * - coverScale: automatyczny “cover” na start (żeby wypełnić 10x10)
 * - userScale: zoom użytkownika (min 1.0)
 * - offsetX/Y: przesunięcie w px (w przestrzeni CANVAS_PX)
 */
let coverScale = 1;
let userScale = 1; // 1 = domyślny cover
let offsetX = 0;
let offsetY = 0;

const MIN_USER_SCALE = 1.0;
const MAX_USER_SCALE = 6.0;

/* ===================== [SEKCJA 4] KSZTAŁT + SPADY ===================== */
function setShadeSquare() {
  shadeLayer.style.clipPath = "";
  shadeLayer.style.background =
    "linear-gradient(rgba(0,0,0,0.50), rgba(0,0,0,0.50)) top / 100% 5% no-repeat," +
    "linear-gradient(rgba(0,0,0,0.50), rgba(0,0,0,0.50)) bottom / 100% 5% no-repeat," +
    "linear-gradient(rgba(0,0,0,0.50), rgba(0,0,0,0.50)) left / 5% 90% no-repeat," +
    "linear-gradient(rgba(0,0,0,0.50), rgba(0,0,0,0.50)) right / 5% 90% no-repeat";
}

function setShadeCircle() {
  const CIRCLE_CUT_RATIO = CUT_RATIO;
  const r = 50 * CIRCLE_CUT_RATIO; // promień w %
  const rStr = `${r}%`;

  shadeLayer.style.clipPath = "";
  shadeLayer.style.background =
    `radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 0 ${rStr}, rgba(0,0,0,0.50) ${rStr} 100%)`;
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

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function getDrawRect(img, s = coverScale * userScale, ox = offsetX, oy = offsetY) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;

  const w = iw * s;
  const h = ih * s;

  // bazowo wyśrodkowane + przesunięcie użytkownika
  let x = (CANVAS_PX - w) / 2 + ox;
  let y = (CANVAS_PX - h) / 2 + oy;

  // ograniczenia, żeby nie dało się “zgubić” zdjęcia (ma zawsze pokrywać cały canvas)
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

  // chcemy, żeby x = center + offset było w [minX..maxX]
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
    resetPhotoTransformToCover();
    redraw();
    URL.revokeObjectURL(url);
  };

  img.src = url;
});

/* ===================== [SEKCJA 6B] DRAG + ZOOM (MYSZ/DOTYK) ===================== */
function clientToCanvasPx(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  const scale = CANVAS_PX / r.width; // canvas jest skalowany CSS-em
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

  // współrzędne w obrazie pod kursorem/palcami
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
}

// DRAG (pointer)
let isDragging = false;
let dragLastX = 0;
let dragLastY = 0;

const pointers = new Map(); // pointerId -> {x,y, clientX, clientY}
let pinchStartDist = 0;
let pinchStartScale = 1;
let pinchAnchor = null;

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
  pointers.set(e.pointerId, { x: p.x, y: p.y, clientX: e.clientX, clientY: e.clientY });

  if (pointers.size === 1) {
    isDragging = true;
    dragLastX = p.x;
    dragLastY = p.y;
  }

  if (pointers.size === 2) {
    // start pinch
    const pts = Array.from(pointers.values());
    pinchStartDist = distance(pts[0], pts[1]);
    pinchStartScale = userScale;
    pinchAnchor = mid(pts[0], pts[1]);
    isDragging = false;
  }

  e.preventDefault();
});

canvas.addEventListener("pointermove", (e) => {
  if (!uploadedImg) return;
  if (!pointers.has(e.pointerId)) return;

  const p = clientToCanvasPx(e.clientX, e.clientY);
  pointers.set(e.pointerId, { x: p.x, y: p.y, clientX: e.clientX, clientY: e.clientY });

  if (pointers.size === 2) {
    const pts = Array.from(pointers.values());
    const d = distance(pts[0], pts[1]);
    const c = mid(pts[0], pts[1]);

    if (pinchStartDist > 0) {
      const factor = d / pinchStartDist;
      const nextScale = pinchStartScale * factor;
      setUserScaleKeepingPoint(nextScale, c.x, c.y);
    }
    e.preventDefault();
    return;
  }

  if (isDragging && pointers.size === 1) {
    const dx = p.x - dragLastX;
    const dy = p.y - dragLastY;

    offsetX += dx;
    offsetY += dy;

    dragLastX = p.x;
    dragLastY = p.y;

    applyClampToOffsets();
    redraw();
    e.preventDefault();
  }
});

function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);

  if (pointers.size < 2) {
    pinchStartDist = 0;
    pinchAnchor = null;
    pinchStartScale = userScale;
  }

  if (pointers.size === 0) {
    isDragging = false;
  }

  e.preventDefault();
}

canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener("pointerleave", endPointer);

// ZOOM kółkiem myszy
canvas.addEventListener(
  "wheel",
  (e) => {
    if (!uploadedImg) return;

    const { x, y } = clientToCanvasPx(e.clientX, e.clientY);
    const zoom = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    setUserScaleKeepingPoint(userScale * zoom, x, y);

    e.preventDefault();
  },
  { passive: false }
);

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
    drawPhotoTransformed(uploadedImg); // <- WAŻNE: dokładnie to co klient ustawił
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
