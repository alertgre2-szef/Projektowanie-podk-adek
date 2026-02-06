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
 *   https://<user>.github.io/Projektowanie-podk-adek/
 * Dlatego twardy base "/Projektowanie-podk-adek" jest OK.
 */
const REPO_BASE = "/Projektowanie-podk-adek";

/**
 * W Twoim projekcie spotkaliśmy 2 warianty lokalizacji index.json:
 * 1) assets/templates/index.json           (na screenie)
 * 2) assets/templates/coasters/index.json  (stara ścieżka)
 *
 * I 2 warianty struktury danych:
 * A) { "coasters": [ {id, title} ] }
 * B) { "templates": [ {id, name} ] }
 *
 * Ten loader obsługuje oba.
 */
async function loadTemplates() {
  const candidates = [
    `${REPO_BASE}/assets/templates/index.json`,
    `${REPO_BASE}/assets/templates/coasters/index.json`,
  ];

  let lastErr = null;

  for (const url of candidates) {
    try {
      console.log("➡️ Próba wczytania szablonów:", url);
      const res = await fetch(url, { cache: "no-store" });
      console.log("⬅️ status:", res.status, url);

      if (!res.ok) throw new Error(`HTTP ${res.status} dla ${url}`);
      const data = await res.json();

      // Normalizacja: wspieramy data.coasters i data.templates
      const rawList = Array.isArray(data?.coasters)
        ? data.coasters
        : Array.isArray(data?.templates)
          ? data.templates
          : [];

      if (!rawList.length) {
        console.warn("⚠️ index.json wczytany, ale lista jest pusta lub ma inną strukturę:", data);
      }

      // Normalizacja pól: title/name → name
      const normalized = rawList.map((t) => ({
        id: t.id,
        name: t.name || t.title || t.id,
      })).filter(t => !!t.id);

      console.log("✅ Szablony znormalizowane:", normalized);
      return normalized;
    } catch (err) {
      lastErr = err;
      console.warn("⚠️ Nie udało się z:", url, err);
    }
  }

  // Jeśli wszystkie próby padły:
  throw lastErr || new Error("Nie udało się wczytać żadnego index.json");
}

/**
 * Buduje URL folderu szablonu, np.
 * /Projektowanie-podk-adek/assets/templates/coasters/ramka_01/
 */
function templateFolderUrl(id) {
  return `${REPO_BASE}/assets/templates/coasters/${encodeURIComponent(id)}/`;
}

/**
 * Renderuje siatkę miniatur szablonów w #templateGrid
 */
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

/**
 * Wczytuje edit.png jako overlay na canvas i odrysowuje podgląd
 */
async function applyTemplate(t) {
  const url = templateFolderUrl(t.id) + "edit.png";

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    templateEditImg = img;
    redraw();
  };
  img.onerror = () => {
    console.error("❌ Nie mogę wczytać edit.png:", url);
  };
  img.src = url;
}


/* ============================================================
   [SEKCJA 7] Eksport
   ============================================================ */
btnDownloadPreview?.addEventListener("click", () => {
  // Zapis podglądu (to co widzi klient)
  const a = document.createElement("a");
  const nick = (nickInput.value || "projekt").trim().replace(/[^\w\-]+/g, "_");
  a.download = `${nick}_preview.png`;
  a.href = canvas.toDataURL("image/png");
  a.click();
});

btnDownloadPrint?.addEventListener("click", async () => {
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


/* ============================================================
   [SEKCJA 8] Start aplikacji
   ============================================================ */
(async function init() {
  console.log("✅ init() start");

  // Domyślne ustawienia
  setShape("square");

  try {
    const templates = await loadTemplates();
    renderTemplateGrid(templates);

    // (Opcjonalnie) automatycznie wybierz pierwszy template jako demo
    if (templates[0]) {
      currentTemplate = templates[0];
      await applyTemplate(templates[0]);
    }
  } catch (err) {
    console.error("❌ Błąd init() / szablony:", err);
    templateGrid.innerHTML = `
      <div class="smallText">
        Nie udało się wczytać szablonów. Sprawdź plik:
        <br><b>assets/templates/index.json</b> lub <b>assets/templates/coasters/index.json</b>
        <br>oraz strukturę JSON (coasters/templates).
      </div>`;
  }

  redraw();
})();
