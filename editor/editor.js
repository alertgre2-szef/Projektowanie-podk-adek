// editor/editor.js
/**
 * PROJECT: Web Editor – Product Designer
 * FILE: editor/editor.js
 * ROLE: Frontend editor runtime (token → productConfig → render → export/upload)
 * VERSION: 2026-02-11-18
 */

/* ========START======== [SEKCJA 01] UTIL + DEBUG =========START======== */
const REPO_BASE = (() => {
  const p = location.pathname;
  const i = p.indexOf("/editor/");
  return i >= 0 ? p.slice(0, i) : "";
})();

/** CACHE_VERSION: wersja runtime (cache-busting w assetach) */
const CACHE_VERSION = "2026-02-11-17";
window.CACHE_VERSION = CACHE_VERSION;

function withV(url) {
  try {
    const u = new URL(url, location.origin);
    u.searchParams.set("v", CACHE_VERSION);
    return u.toString();
  } catch {
    const glue = String(url).includes("?") ? "&" : "?";
    return `${url}${glue}v=${encodeURIComponent(CACHE_VERSION)}`;
  }
}

function toAbsUrl(u) {
  if (!u) return "";
  try { return new URL(String(u), location.origin).toString(); }
  catch { return String(u); }
}
function uniq(arr) {
  const out = [];
  const seen = new Set();
  for (const x of arr) {
    const k = String(x || "");
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}
function repoAwareCandidates(u) {
  const s = String(u || "").trim();
  if (!s) return [];
  if (s.startsWith("/") && REPO_BASE && !s.startsWith(REPO_BASE + "/")) {
    const a = toAbsUrl(REPO_BASE + s);
    const b = toAbsUrl(s);
    return uniq([a, b]);
  }
  return uniq([toAbsUrl(s)]);
}
function repoAwareSingle(u) {
  const c = repoAwareCandidates(u);
  return c[0] || "";
}

const DEBUG =
  (typeof location !== "undefined" && (location.search || "").includes("debug=1")) ||
  (typeof localStorage !== "undefined" && localStorage.getItem("EDITOR_DEBUG") === "1");

function dlog(...args) { if (DEBUG) console.log("[EDITOR]", ...args); }
function derr(...args) { console.error("[EDITOR]", ...args); }

function getQueryParam(name) {
  try {
    const sp = new URLSearchParams(location.search || "");
    const v = sp.get(name);
    return (v || "").trim();
  } catch { return ""; }
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
/* ========END======== [SEKCJA 01] UTIL + DEBUG =========END======== */





/* ========START======== [SEKCJA 02] THEME =========START======== */
const THEME_KEY = "EDITOR_THEME";
function systemPrefersDark() {
  try { return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches; }
  catch { return false; }
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
  if (fromUrl) { applyTheme(fromUrl, { persist: true }); return; }

  let fromStorage = "";
  try { fromStorage = normalizeTheme(localStorage.getItem(THEME_KEY)); } catch {}
  if (fromStorage) { applyTheme(fromStorage, { persist: false }); return; }

  applyTheme(systemPrefersDark() ? "dark" : "light", { persist: false });
}
function wireThemeButtons() {
  const bL = document.getElementById("btnThemeLight");
  const bD = document.getElementById("btnThemeDark");
  if (bL) bL.addEventListener("click", () => applyTheme("light", { persist: true }));
  if (bD) bD.addEventListener("click", () => applyTheme("dark", { persist: true }));
}
/* ========END======== [SEKCJA 02] THEME =========END======== */


/* ========START======== [SEKCJA 03] URL PARAMS (NICK/ORDER/QTY) =========START======== */
function _parseHashParams() {
  const h = (location.hash || "").replace(/^#/, "").trim();
  if (!h) return new URLSearchParams();
  try { return new URLSearchParams(h.includes("=") ? h : ""); }
  catch { return new URLSearchParams(); }
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
function getNickFromUrl() { return getUrlParamAny(["nick", "order", "order_id"]); }
function getOrderIdFromUrl() { return getUrlParamAny(["order_id", "order"]); }
function getQtyFromUrl() {
  const raw = getUrlParamAny(["qty", "q", "quantity", "count", "n"]);
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1;
  const i = Math.floor(n);
  return Math.max(1, Math.min(99, i));
}
/* ========END======== [SEKCJA 03] URL PARAMS (NICK/ORDER/QTY) =========END======== */


/* ========START======== [SEKCJA 04] SLOTY (N sztuk) + LOCALSTORAGE =========START======== */
const QTY = getQtyFromUrl();
let currentSlot = 0; // 0..QTY-1
let slots = []; // wypełniane po init

// GLOBAL: blokada interakcji podczas applySlotState (anti-race)
let isApplyingSlot = false;

function slotKeyBaseV1() {
  const t = String(getQueryParam("token") || "no_token");
  const oid = String(getOrderIdFromUrl() || getNickFromUrl() || "no_order");
  return `EDITOR_SLOTS_V1|${t}|${oid}|qty=${QTY}`;
}

function slotKeyBase() {
  // V3: izolacja per domena + repo_base, żeby nie mieszać środowisk
  const t = String(getQueryParam("token") || "no_token");
  const oid = String(getOrderIdFromUrl() || getNickFromUrl() || "no_order");
  const scope = `${location.origin}${REPO_BASE}`;
  return `EDITOR_SLOTS_V3|${scope}|${t}|${oid}|qty=${QTY}`;
}

function migrateSlotsKeyIfNeeded() {
  try {
    const newKey = slotKeyBase();
    if (localStorage.getItem(newKey)) return;

    const oldKey = slotKeyBaseV1();
    const raw = localStorage.getItem(oldKey);
    if (!raw) return;

    localStorage.setItem(newKey, raw);
  } catch {}
}

function slotUiEls() {
  return {
    card: document.getElementById("slotCard"),
    prev: document.getElementById("btnSlotPrev"),
    next: document.getElementById("btnSlotNext"),
    ind: document.getElementById("slotIndicator"),
    prog: document.getElementById("slotProgress"),
  };
}

function updateSlotUi() {
  const els = slotUiEls();
  if (!els.card) return;

  if (QTY <= 1) {
    els.card.style.display = "none";
    return;
  }
  els.card.style.display = "";

  if (els.ind) els.ind.textContent = `${currentSlot + 1} / ${QTY}`;

  const done = slots.filter(s => !!s.photoDataUrl).length;
  if (els.prog) els.prog.textContent = `Ukończono: ${done} / ${QTY}`;

  const disabledByBusy = productionLocked || isApplyingSlot;

  if (els.prev) els.prev.disabled = disabledByBusy || currentSlot <= 0;
  if (els.next) els.next.disabled = disabledByBusy || currentSlot >= QTY - 1;
}

function toast(msg, ms = 10000) {
  const toastContainer = document.getElementById("toastContainer");
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

function saveSlotsToLocal() {
  try {
    const key = slotKeyBase();
    const snapshot = slots.map((s) => ({
      // UWAGA: photoDataUrl = ORYGINALNE zdjęcie (DataURL z FileReader), NIE zrzut z canvasa
      photoDataUrl: s.photoDataUrl || "",
      shape: s.shape || "square",
      templateId: s.templateId || "",
      rotationDeg: Number(s.rotationDeg || 0),
      userScale: Number(s.userScale || 1),
      offsetX: Number(s.offsetX || 0),
      offsetY: Number(s.offsetY || 0),
      freeMove: !!s.freeMove,
    }));
    localStorage.setItem(key, JSON.stringify({ v: 2, qty: QTY, slots: snapshot }));
  } catch {}
}

function loadSlotsFromLocal() {
  try {
    const key = slotKeyBase();
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || (data.v !== 1 && data.v !== 2) || data.qty !== QTY || !Array.isArray(data.slots)) return null;
    return data.slots;
  } catch {
    return null;
  }
}

let slotApplySeq = 0;

/** wheel commit potrafi odpalić się po zmianie slota — ignorujemy spóźnione commity */
let wheelTimer = 0;
let wheelCommitSlot = 0;

async function setSlot(index) {
  const next = Math.max(0, Math.min(QTY - 1, index));
  if (next === currentSlot) return;

  // jeśli trwa apply slotu — ignoruj klik
  if (isApplyingSlot) return;

  // Blokujemy interakcje i sloty na czas przełączenia
  isApplyingSlot = true;
  updateSlotUi();

  // anuluj opóźniony wheel-commit, żeby nie zapisał się do innego slota
  if (wheelTimer) {
    window.clearTimeout(wheelTimer);
    wheelTimer = 0;
  }

  // commit gestów (jeśli był) zanim zmienimy slot
  try { commitGestureIfActive(); } catch {}

  // "odklejenie" pointerów i stanów drag/pinch (PC i mobile)
  try {
    if (typeof pointers !== "undefined" && pointers && typeof pointers.clear === "function") pointers.clear();
    if (typeof isDragging !== "undefined") isDragging = false;
    if (typeof pinchStartDist !== "undefined") pinchStartDist = 0;
    if (typeof pinchStartScale !== "undefined") pinchStartScale = userScale;
  } catch {}

  // Zapisz stan bieżącego slota (źródło prawdy)
  persistCurrentSlotState();
  saveSlotsToLocal();

  currentSlot = next;

  const mySeq = ++slotApplySeq;
  await applySlotState(mySeq);

  isApplyingSlot = false;
  updateSlotUi();
  updateStatusBar();
}

function wireSlotUi() {
  const els = slotUiEls();
  if (!els.prev || !els.next) return;

  els.prev.addEventListener("click", () => setSlot(currentSlot - 1));
  els.next.addEventListener("click", () => setSlot(currentSlot + 1));
}
/* ========END======== [SEKCJA 04] SLOTY (N sztuk) + LOCALSTORAGE =========END======== */





/* ========START======== [SEKCJA 05] DOM SELF-TEST + DOM QUERY =========START======== */
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
  "appTitleText",
  "appSubtitleText",
];
function checkRequiredDom() {
  const missing = [];
  for (const id of REQUIRED_IDS) if (!document.getElementById(id)) missing.push(id);
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

const domReport = checkRequiredDom();
if (!domReport.ok) throw new Error("Missing required DOM elements: " + domReport.missing.join(", "));

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

const btnFreeMove = document.getElementById("btnFreeMove");
const btnSendToProduction = document.getElementById("btnSendToProduction");

const statusBar = document.getElementById("statusBar");

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

const productionHint = document.getElementById("productionHint");

// MODAL nick
const nickModal = document.getElementById("nickModal");
const nickModalInput = document.getElementById("nickModalInput");
const nickModalClose = document.getElementById("nickModalClose");
const nickModalCancel = document.getElementById("nickModalCancel");
const nickModalSave = document.getElementById("nickModalSave");
const nickModalHint = document.getElementById("nickModalHint");

// fallback/manual product selector
const productSelectCard = document.getElementById("productSelectCard");
const productSelect = document.getElementById("productSelect");
const btnApplyProductSelect = document.getElementById("btnApplyProductSelect");

canvas.style.touchAction = "none";
/* ========END======== [SEKCJA 05] DOM SELF-TEST + DOM QUERY =========END======== */


/* ========START======== [SEKCJA 06] WERSJA W UI =========START======== */
function updateUiVersionBadge() {
  const el = document.getElementById("appVersion");
  if (!el) return;
  el.textContent = " • v" + CACHE_VERSION;
}
/* ========END======== [SEKCJA 06] WERSJA W UI =========END======== */


/* ========START======== [SEKCJA 07] BACKEND CONFIG (project.php) =========START======== */
const TOKEN = getQueryParam("token");

function setUiTitleSubtitle(title, subtitle) {
  const t = document.getElementById("appTitleText");
  const s = document.getElementById("appSubtitleText");
  if (t && typeof title === "string") t.textContent = title;
  if (s && typeof subtitle === "string") s.textContent = subtitle;
}

async function fetchJsonWithTimeout(url, { timeoutMs = 6500 } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const res = await fetch(url, { cache: "no-store", signal: ac.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * mode:
 * - "backend"  => konfiguracja z tokena (project.php)
 * - "manual"   => pełny tryb ręczny (bez tokena / gdy backend niedostępny)
 */
function normalizeProductConfig(raw, { token, mode }) {
  const schema_version = 1;

  const ui = {
    title: (raw?.ui?.title ?? raw?.title ?? raw?.product?.name ?? "Edytor produktu").toString(),
    subtitle: (raw?.ui?.subtitle ?? raw?.subtitle ?? "").toString(),
  };

  const productType = (raw?.product?.type ?? raw?.type ?? "coaster").toString();

  const product = raw?.product && typeof raw.product === "object" ? {
    type: productType,
    name: (raw?.product?.name ?? raw?.name ?? "").toString(),
    size_mm: {
      w: Number(raw?.product?.size_mm?.w ?? raw?.size_mm?.w ?? 100) || 100,
      h: Number(raw?.product?.size_mm?.h ?? raw?.size_mm?.h ?? 100) || 100,
    },
    corner_radius_mm: Number(raw?.product?.corner_radius_mm ?? raw?.corner_radius_mm ?? 5) || 0,
    shape_default: (raw?.product?.shape_default ?? raw?.shape_default ?? raw?.product?.shape ?? "square").toString(),
    shape_options: Array.isArray(raw?.product?.shape_options)
      ? raw.product.shape_options.map(String)
      : ["square", "circle"],
  } : null;

  const render = {
    canvas_px: Number(raw?.render?.canvas_px ?? raw?.canvas_px ?? 1181) || 1181,
    cut_ratio: Number(raw?.render?.cut_ratio ?? raw?.cut_ratio ?? 0.90) || 0.90,
    print_dpi: Number(raw?.render?.print_dpi ?? raw?.print_dpi ?? raw?.product?.dpi ?? 300) || 300,
  };

  const masks = {
    square: repoAwareSingle(raw?.assets?.masks?.square) || `${REPO_BASE}/editor/assets/masks/mask_square.png`,
    circle: repoAwareSingle(raw?.assets?.masks?.circle) || `${REPO_BASE}/editor/assets/masks/mask_circle.png`,
  };

  const list_urls_raw = raw?.assets?.templates?.list_urls;
  let list_urls = [];

  if (Array.isArray(list_urls_raw) && list_urls_raw.length) {
    list_urls = uniq(list_urls_raw.flatMap((x) => repoAwareCandidates(x)));
  } else {
    list_urls = uniq([
      ...repoAwareCandidates(raw?.templates_endpoint),
      ...repoAwareCandidates(`${REPO_BASE}/api/templates.php`),
      ...repoAwareCandidates(`${REPO_BASE}/assets/templates/list.json`),
      ...repoAwareCandidates(`${REPO_BASE}/assets/templates/index.json`),
    ]);
  }

  const folder_base =
    repoAwareSingle(raw?.assets?.templates?.folder_base) ||
    `${REPO_BASE}/assets/templates/coasters/`;

  const api = {
    project_url: repoAwareSingle(raw?.api?.project_url) || `${REPO_BASE}/api/project.php`,
    upload_url:
      repoAwareSingle(raw?.api?.upload_url) ||
      repoAwareSingle(raw?.upload_endpoint) ||
      `${REPO_BASE}/api/upload.php`,
  };

  return {
    schema_version,
    mode,
    token: token || "",
    ui,
    product,
    render,
    assets: { masks, templates: { list_urls, folder_base } },
    api,
    raw: DEBUG ? raw : undefined,
  };
}

async function loadConfigFromBackend(token) {
  if (!token) return null;

  const projectUrl = `${REPO_BASE}/api/project.php?token=${encodeURIComponent(token)}`;

  try {
    const raw = await fetchJsonWithTimeout(projectUrl, { timeoutMs: 6500 });

    if (raw && raw.ok === true && raw.productConfig && typeof raw.productConfig === "object") {
      const cfg = normalizeProductConfig(raw.productConfig, { token, mode: "backend" });
      dlog("project.php ok:", raw.mode, cfg);
      return cfg;
    }

    if (raw && typeof raw === "object") {
      const cfg = normalizeProductConfig(raw, { token, mode: "backend" });
      dlog("project.php legacy:", cfg);
      return cfg;
    }

    throw new Error("Nieprawidłowa konfiguracja (pusty payload)");
  } catch (e) {
    dlog("loadConfigFromBackend failed:", e);
    return null;
  }
}
/* ========END======== [SEKCJA 07] BACKEND CONFIG (project.php) =========END======== */


/* ========START======== [SEKCJA 08] FALLBACK = PEŁNY TRYB RĘCZNY =========START======== */
const MANUAL_PRESETS = [
  {
    id: "coaster_square_100_r5",
    ui: { title: "Edytor podkładki", subtitle: "Projekt 10×10 cm (spad)." },
    product: { type: "coaster", name: "Podkładka 10×10", size_mm: { w: 100, h: 100 }, corner_radius_mm: 5, shape_default: "square", shape_options: ["square", "circle"] },
    render: { canvas_px: 1181, cut_ratio: 0.90, print_dpi: 300 },
    api: { upload_url: `${REPO_BASE}/api/upload.php` },
  },
  {
    id: "coaster_circle_100",
    ui: { title: "Edytor podkładki", subtitle: "Projekt 10 cm (okrąg, spad)." },
    product: { type: "coaster", name: "Podkładka 10 cm", size_mm: { w: 100, h: 100 }, corner_radius_mm: 0, shape_default: "circle", shape_options: ["circle", "square"] },
    render: { canvas_px: 1181, cut_ratio: 0.90, print_dpi: 300 },
    api: { upload_url: `${REPO_BASE}/api/upload.php` },
  },
];

let manualChooserWired = false;

function showProductManualChooser() {
  if (!productSelectCard || !productSelect || !btnApplyProductSelect) {
    toast("Brak konfiguracji z backendu — tryb ręczny (ustawienia domyślne).");
    return;
  }

  productSelectCard.style.display = "block";
  productSelect.innerHTML =
    `<option value="">— wybierz —</option>` +
    MANUAL_PRESETS.map(p => `<option value="${p.id}">${p.ui.title} — ${p.ui.subtitle}</option>`).join("");

  btnApplyProductSelect.disabled = true;

  if (!manualChooserWired) {
    manualChooserWired = true;

    productSelect.addEventListener("change", () => {
      btnApplyProductSelect.disabled = !productSelect.value;
    });

    btnApplyProductSelect.addEventListener("click", async () => {
      const id = productSelect.value;
      const preset = MANUAL_PRESETS.find(p => p.id === id);
      if (!preset) return;

      const cfg = normalizeProductConfig(preset, { token: "", mode: "manual" });
      await applyProductConfig(cfg);

      productSelectCard.style.display = "none";
      toast("Ustawienia produktu zastosowane (tryb ręczny).");
    });
  }

  setUiTitleSubtitle("Edytor", "Wybierz produkt (tryb ręczny).");
}
/* ========END======== [SEKCJA 08] FALLBACK = PEŁNY TRYB RĘCZNY =========END======== */


/* ========START======== [SEKCJA 09] RUNTIME PARAMS + MASKI =========START======== */
let CANVAS_PX = 1181;
let CUT_RATIO = 0.90;
let PRINT_DPI = 300;

const DPI_WEAK_MAX = 50;
const DPI_MED_MAX = 100;
const DPI_GOOD_MAX = 200;

let maskEl = null;
let MASK_URLS = {
  square: `${REPO_BASE}/editor/assets/masks/mask_square.png`,
  circle: `${REPO_BASE}/editor/assets/masks/mask_circle.png`,
};

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
/* ========END======== [SEKCJA 09] RUNTIME PARAMS + MASKI =========END======== */


/* ========START======== [SEKCJA 10] STAN + DIRTY + STATUS BAR =========START======== */
let productConfig = null;

let shape = "square";
let uploadedImg = null;

let currentTemplate = null;
let templateEditImg = null;

let coverScale = 1;
let userScale = 1;
let offsetX = 0;
let offsetY = 0;

let rotationDeg = 0;
function normDeg(d) {
  let x = Number(d) || 0;
  x = ((x % 360) + 360) % 360;
  if (x > 180) x -= 360;
  return x;
}
function degToRad(d) { return (d * Math.PI) / 180; }

let freeMove = false;
const MIN_USER_SCALE_LOCKED = 1.0;
const MIN_USER_SCALE_FREE = 0.10;
const MAX_USER_SCALE = 6.0;
function getMinUserScale() { return freeMove ? MIN_USER_SCALE_FREE : MIN_USER_SCALE_LOCKED; }

let isDirty = false;
let productionLocked = false;

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

function fmtZoomPct() { return `${Math.round(userScale * 100)}%`; }
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

  if (dpi == null) { bg = "#f8fafc"; border = "#e5e7eb"; }
  else if (dpi < DPI_WEAK_MAX) { bg = "#ffe8e8"; border = "#f5b5b5"; }
  else if (dpi < DPI_MED_MAX) { bg = "#fff6d6"; border = "#f1d08a"; }
  else if (dpi < DPI_GOOD_MAX) { bg = "#e9fbe9"; border = "#9bd59b"; }
  else { bg = "#ddf7e3"; border = "#6fcf8a"; }

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
  const lockStr = freeMove ? "Swobodny" : "Zablokowany";

  const prod = productConfig?.product?.type ? String(productConfig.product.type) : "—";
  const mmW = productConfig?.product?.size_mm?.w ?? 0;
  const mmH = productConfig?.product?.size_mm?.h ?? 0;

  const slotInfo = QTY > 1 ? ` | Sztuka: ${currentSlot + 1}/${QTY}` : "";
  const modeStr = productConfig?.mode === "backend" ? "backend" : "ręczny";

  statusBar.textContent =
    `Tryb: ${modeStr} | Produkt: ${prod} ${mmW}×${mmH}mm | Kształt: ${sh} | Szablon: ${templateName()} | Zoom: ${fmtZoomPct()} | Obrót: ${rot} | Kadr: ${lockStr} | DPI: ${dpiStr} | Jakość: ${q}${slotInfo}`;

  applyStatusBarQualityStyle(dpi);
}
/* ========END======== [SEKCJA 10] STAN + DIRTY + STATUS BAR =========END======== */


/* ========START======== [SEKCJA 11] EXPORT BUTTONS (WYSYŁKA ZAWSZE AKTYWNA) =========START======== */
function refreshExportButtons() {
  const hasPhoto = !!uploadedImg;

  if (btnDownloadPreview) btnDownloadPreview.disabled = !hasPhoto || productionLocked;

  // WYSYŁKA ZAWSZE AKTYWNA (backend + ręczny fallback)
  if (btnSendToProduction) btnSendToProduction.disabled = productionLocked;

  if (productionHint) {
    const uploadUrl = productConfig?.api?.upload_url || `${REPO_BASE}/api/upload.php`;
    const modeStr = productConfig?.mode === "backend" ? "Konfiguracja z backendu (token)" : "Tryb ręczny (bez tokena)";
    productionHint.innerHTML =
      `${modeStr}. ` +
      `Wysyłka: <b>aktywna</b> → <code>${uploadUrl}</code><br>` +
      `Po wysłaniu projekt trafia do produkcji i <b>nie będzie można wprowadzić zmian</b>.`;
  }

  updateSlotUi();
}
/* ========END======== [SEKCJA 11] EXPORT BUTTONS (WYSYŁKA ZAWSZE AKTYWNA) =========END======== */


/* ========START======== [SEKCJA 12] KADR (FREE MOVE) =========START======== */
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function syncFreeMoveButton() {
  if (!btnFreeMove) return;
  btnFreeMove.classList.toggle("active", freeMove === true);
  btnFreeMove.setAttribute("aria-pressed", freeMove ? "true" : "false");
  btnFreeMove.textContent = freeMove ? "🔓 Kadr" : "🔒 Kadr";
}

function setFreeMove(next, { silent = false, skipHistory = false } = {}) {
  const n = !!next;

  if (n === true && freeMove === false && !silent) {
    const ok = window.confirm(
      "Odblokować kadr?\n\n" +
      "To pozwala przesuwać zdjęcie poza obszar projektu ORAZ pomniejszać poniżej 100%.\n\n" +
      "UWAGA: możesz przypadkowo ustawić zdjęcie tak, że w druku wyjdą puste/białe pola albo ważne elementy wypadną.\n\n" +
      "Kontynuować?"
    );
    if (!ok) return;
    toast("Kadr odblokowany — możesz przesuwać i pomniejszać swobodnie. ⚠️");
  }

  freeMove = n;
  syncFreeMoveButton();

  if (!freeMove) {
    if (userScale < MIN_USER_SCALE_LOCKED) userScale = MIN_USER_SCALE_LOCKED;
    applyClampToOffsets();
  }

  // twarda izolacja: zapisujemy do bieżącego slota natychmiast
  if (slots[currentSlot]) {
    slots[currentSlot].freeMove = freeMove;
    slots[currentSlot].userScale = userScale;
    slots[currentSlot].offsetX = offsetX;
    slots[currentSlot].offsetY = offsetY;
    slots[currentSlot].rotationDeg = rotationDeg;
  }

  redraw();
  updateStatusBar();

  if (!skipHistory) pushHistory();
  if (!skipHistory) markDirty();

  saveSlotsToLocal();
}
if (btnFreeMove) btnFreeMove.addEventListener("click", () => setFreeMove(!freeMove));
/* ========END======== [SEKCJA 12] KADR (FREE MOVE) =========END======== */



/* ========START======== [SEKCJA 13] HISTORIA (UNDO/REDO) =========START======== */
const HISTORY_MAX = 5;

// Historia jest teraz PER-SLOT (izolacja transformacji)
let historyBySlot = [];
let suppressHistory = false;

function ensureHistoryStore() {
  if (historyBySlot.length === QTY) return;
  historyBySlot = Array.from({ length: QTY }, () => ({ stack: [], index: -1 }));
}
function hist() {
  ensureHistoryStore();
  return historyBySlot[currentSlot];
}

function snapshot() {
  return {
    shape,
    userScale,
    offsetX,
    offsetY,
    rotationDeg,
    freeMove,
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
    a.freeMove === b.freeMove &&
    a.templateId === b.templateId
  );
}

// Gwarantuje bazowy wpis historii dla aktualnego slota (bez brudzenia)
function seedHistoryIfEmpty() {
  const h = hist();
  if (h.stack.length > 0) return;
  const snap = snapshot();
  h.stack = [snap];
  h.index = 0;
  updateUndoRedoButtons();
}

function pushHistory() {
  if (suppressHistory) return;

  const h = hist();
  const snap = snapshot();
  const last = h.stack[h.index];
  if (last && sameSnap(last, snap)) return;

  if (h.index < h.stack.length - 1) h.stack = h.stack.slice(0, h.index + 1);

  h.stack.push(snap);
  if (h.stack.length > HISTORY_MAX) h.stack.shift();
  h.index = h.stack.length - 1;

  updateUndoRedoButtons();

  persistCurrentSlotState();
  saveSlotsToLocal();
}

function updateUndoRedoButtons() {
  const h = hist();
  if (btnUndo) btnUndo.disabled = h.index <= 0;
  if (btnRedo) btnRedo.disabled = h.index >= h.stack.length - 1;

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
    await applyTemplate(currentTemplate, { skipHistory: true, silentErrors: true, slotIndex: currentSlot });
  }

  rotationDeg = normDeg(snap.rotationDeg);
  ensureCoverScaleForRotation();

  freeMove = !!snap.freeMove;
  syncFreeMoveButton();

  userScale = clamp(snap.userScale, getMinUserScale(), MAX_USER_SCALE);
  offsetX = snap.offsetX;
  offsetY = snap.offsetY;

  if (!freeMove) applyClampToOffsets();

  redraw();
  updateStatusBar();

  suppressHistory = false;
  updateUndoRedoButtons();

  persistCurrentSlotState();
  saveSlotsToLocal();
}

async function undo() {
  const h = hist();
  if (h.index <= 0) return;
  h.index--;
  await applyStateFromHistory(h.stack[h.index]);
  markDirty();
}

async function redo() {
  const h = hist();
  if (h.index >= h.stack.length - 1) return;
  h.index++;
  await applyStateFromHistory(h.stack[h.index]);
  markDirty();
}

if (btnUndo) btnUndo.addEventListener("click", undo);
if (btnRedo) btnRedo.addEventListener("click", redo);
/* ========END======== [SEKCJA 13] HISTORIA (UNDO/REDO) =========END======== */



/* ========START======== [SEKCJA 14] KSZTAŁT =========START======== */
function setShapeButtonsAvailability(options) {
  const hasSquare = options.includes("square");
  const hasCircle = options.includes("circle");

  if (btnSquare) btnSquare.style.display = hasSquare ? "" : "none";
  if (btnCircle) btnCircle.style.display = hasCircle ? "" : "none";

  const group = document.getElementById("shapeToggle");
  if (group) group.style.display = (hasSquare || hasCircle) ? "" : "none";
}

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
/* ========END======== [SEKCJA 14] KSZTAŁT =========END======== */


/* ========START======== [SEKCJA 15] RYSOWANIE =========START======== */
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
  if (freeMove) return;

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
/* ========END======== [SEKCJA 15] RYSOWANIE =========END======== */


/* ========START======== [SEKCJA 16] ZDJĘCIE (LOAD) + SLOT STATE =========START======== */
function resetPhotoTransformToCover() {
  if (!uploadedImg) return;

  rotationDeg = 0;
  ensureCoverScaleForRotation();

  userScale = 1.0;
  offsetX = 0;
  offsetY = 0;

  freeMove = false;
  syncFreeMoveButton();

  applyClampToOffsets();
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    if (!dataUrl) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Nie mogę wczytać obrazu ze slotu"));
    img.src = dataUrl;
  });
}

function persistCurrentSlotState() {
  if (!slots[currentSlot]) return;

  const s = slots[currentSlot];

  s.shape = shape;
  s.templateId = currentTemplate ? String(currentTemplate.id || "") : "";
  s.rotationDeg = rotationDeg;
  // coverScale: NIE zapisujemy (pochodna)
  s.userScale = userScale;
  s.offsetX = offsetX;
  s.offsetY = offsetY;
  s.freeMove = freeMove;

  // photoDataUrl nie ruszamy automatycznie
}

function persistAndSave() {
  persistCurrentSlotState();
  saveSlotsToLocal();
}

async function applySlotState(seq = 0) {
  const slotIndex = currentSlot;
  const s = slots[slotIndex];
  if (!s) return;

  if (seq && seq !== slotApplySeq) return;

  // ===== HARD SWITCH: natychmiast ustaw runtime z danych slota =====
  rotationDeg = normDeg(s.rotationDeg || 0);
  freeMove = !!s.freeMove;
  syncFreeMoveButton();

  userScale = Number(s.userScale || 1) || 1;
  offsetX = Number(s.offsetX || 0) || 0;
  offsetY = Number(s.offsetY || 0) || 0;

  // usuń obraz runtime na czas doczytania (żeby nie było “starego”)
  uploadedImg = null;
  templateEditImg = null; // też nie pokazuj overlay ze starego slota

  redraw();
  updateStatusBar();
  refreshExportButtons();

  // ===== 1) shape =====
  if (s.shape) await setShape(String(s.shape), { skipHistory: true });
  if (seq && seq !== slotApplySeq) return;
  if (slotIndex !== currentSlot) return;

  // ===== 2) template =====
  if (s.templateId) {
    currentTemplate = { id: s.templateId, name: s.templateId };
    await applyTemplate(currentTemplate, { skipHistory: true, silentErrors: true, slotIndex });
    if (seq && seq !== slotApplySeq) return;
    if (slotIndex !== currentSlot) return;
  } else {
    clearTemplateSelection({ skipHistory: true });
  }

  // ===== 3) photo =====
  if (s.photoDataUrl) {
    try {
      const img = await loadImageFromDataUrl(s.photoDataUrl);
      if (seq && seq !== slotApplySeq) return;
      if (slotIndex !== currentSlot) return;
      uploadedImg = img;
    } catch {
      uploadedImg = null;
      s.photoDataUrl = "";
    }
  } else {
    uploadedImg = null;
  }

  // ===== 4) clamp/cover po wczytaniu zdjęcia =====
  rotationDeg = normDeg(s.rotationDeg || 0);
  freeMove = !!s.freeMove;
  syncFreeMoveButton();

  if (uploadedImg) {
    ensureCoverScaleForRotation();

    userScale = Number(s.userScale || 1) || 1;
    offsetX = Number(s.offsetX || 0) || 0;
    offsetY = Number(s.offsetY || 0) || 0;

    if (!freeMove) {
      if (userScale < MIN_USER_SCALE_LOCKED) userScale = MIN_USER_SCALE_LOCKED;
      applyClampToOffsets();
    }

    // utrwal po clamp (legalne wartości)
    s.rotationDeg = rotationDeg;
    s.freeMove = freeMove;
    s.userScale = userScale;
    s.offsetX = offsetX;
    s.offsetY = offsetY;
  } else {
    coverScale = 1;
    userScale = 1;
    offsetX = 0;
    offsetY = 0;
    rotationDeg = 0;
    freeMove = false;
    syncFreeMoveButton();

    s.rotationDeg = 0;
    s.freeMove = false;
    s.userScale = 1;
    s.offsetX = 0;
    s.offsetY = 0;
  }

  redraw();
  updateStatusBar();
  refreshExportButtons();
  updateSlotUi();

  saveSlotsToLocal();
}

let uploadSeq = 0;

if (photoInput) {
  photoInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const slotAtStart = currentSlot;
    const myUpload = ++uploadSeq;

    const reader = new FileReader();
    reader.onload = async () => {
      if (myUpload !== uploadSeq) return;

      const dataUrl = String(reader.result || "");
      if (!dataUrl) {
        toast("Nie udało się wczytać zdjęcia.");
        return;
      }

      // zapis do slota źródłowego od razu
      if (slots[slotAtStart]) slots[slotAtStart].photoDataUrl = dataUrl;
      saveSlotsToLocal();

      try {
        const img = await loadImageFromDataUrl(dataUrl);

        // jeśli user zmienił slot w międzyczasie — nie ruszaj UI
        if (slotAtStart !== currentSlot) {
          toast(`Zdjęcie wgrane ✅ (podkładka ${slotAtStart + 1}/${QTY})`);
          if (photoInput) photoInput.value = "";
          updateSlotUi();
          return;
        }

        uploadedImg = img;
        qualityWarnLevel = 0;

        resetPhotoTransformToCover();

        // twarda izolacja: zapis transform do bieżącego slota
        if (slots[currentSlot]) {
          slots[currentSlot].photoDataUrl = dataUrl;
          slots[currentSlot].rotationDeg = rotationDeg;
          slots[currentSlot].userScale = userScale;
          slots[currentSlot].offsetX = offsetX;
          slots[currentSlot].offsetY = offsetY;
          slots[currentSlot].freeMove = freeMove;
        }

        redraw();
        updateStatusBar();
        pushHistory();

        refreshExportButtons();
        updateSlotUi();

        toast(`Zdjęcie wgrane ✅ (sztuka ${currentSlot + 1}/${QTY})`);
        maybeWarnQuality(true);

        markDirty();
        saveSlotsToLocal();

        if (photoInput) photoInput.value = "";
      } catch (err) {
        derr(err);
        toast("Nie mogę wczytać zdjęcia.");
      }
    };
    reader.readAsDataURL(file);
  });
}
/* ========END======== [SEKCJA 16] ZDJĘCIE (LOAD) + SLOT STATE =========END======== */





/* ========START======== [SEKCJA 17] OBRÓT =========START======== */
function setRotation(nextDeg, opts = {}) {
  if (!uploadedImg) { toast("Najpierw wgraj zdjęcie."); return; }

  rotationDeg = normDeg(nextDeg);
  ensureCoverScaleForRotation();

  applyClampToOffsets();
  redraw();
  updateStatusBar();
  maybeWarnQuality(false);

  // twarda izolacja: zapis do bieżącego slota natychmiast
  if (slots[currentSlot]) {
    slots[currentSlot].rotationDeg = rotationDeg;
    slots[currentSlot].userScale = userScale;
    slots[currentSlot].offsetX = offsetX;
    slots[currentSlot].offsetY = offsetY;
    slots[currentSlot].freeMove = freeMove;
  }

  if (!opts.skipHistory) pushHistory();
  if (!opts.skipHistory) markDirty();

  saveSlotsToLocal();
}
function rotateBy(deltaDeg) {
  setRotation(rotationDeg + deltaDeg);
  toast(`Obrócono: ${rotationDeg}°`);
}
if (btnRotateLeft) btnRotateLeft.addEventListener("click", () => rotateBy(-30));
if (btnRotateRight) btnRotateRight.addEventListener("click", () => rotateBy(+30));
if (btnRotateReset) btnRotateReset.addEventListener("click", () => setRotation(0));
/* ========END======== [SEKCJA 17] OBRÓT =========END======== */



/* ========START======== [SEKCJA 18] DRAG + ZOOM (GESTY) =========START======== */
function clientToCanvasPx(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  const scale = CANVAS_PX / r.width;
  const x = (clientX - r.left) * scale;
  const y = (clientY - r.top) * scale;
  return { x, y };
}

function _writeTransformToCurrentSlot() {
  if (!slots[currentSlot]) return;
  slots[currentSlot].rotationDeg = rotationDeg;
  slots[currentSlot].userScale = userScale;
  slots[currentSlot].offsetX = offsetX;
  slots[currentSlot].offsetY = offsetY;
  slots[currentSlot].freeMove = freeMove;
}

function setUserScaleKeepingPoint(newUserScale) {
  if (!uploadedImg) return;

  // BLOKADA: jeśli przełączamy slot, nie zapisuj / nie ruszaj
  if (isApplyingSlot) return;

  newUserScale = clamp(newUserScale, getMinUserScale(), MAX_USER_SCALE);
  userScale = newUserScale;

  applyClampToOffsets();
  _writeTransformToCurrentSlot();

  redraw();
  updateStatusBar();
  maybeWarnQuality(false);

  markDirty();
  saveSlotsToLocal();
}

function fitToCover() {
  if (!uploadedImg) return;
  if (isApplyingSlot) return;

  ensureCoverScaleForRotation();
  userScale = 1.0;
  offsetX = 0;
  offsetY = 0;

  if (!freeMove) applyClampToOffsets();
  _writeTransformToCurrentSlot();

  redraw();
  updateStatusBar();
  pushHistory();
  toast("Dopasowano kadr");
  maybeWarnQuality(false);
  markDirty();

  saveSlotsToLocal();
}

function centerPhoto() {
  if (!uploadedImg) return;
  if (isApplyingSlot) return;

  offsetX = 0;
  offsetY = 0;

  if (!freeMove) applyClampToOffsets();
  _writeTransformToCurrentSlot();

  redraw();
  updateStatusBar();
  pushHistory();
  toast("Wyśrodkowano");
  markDirty();

  saveSlotsToLocal();
}

let isDragging = false;
let dragLastX = 0;
let dragLastY = 0;

const pointers = new Map();
let pinchStartDist = 0;
let pinchStartScale = 1;

let gestureActive = false;
let gestureMoved = false;

function commitGestureIfActive() {
  if (!gestureActive) return;

  // jeśli w trakcie była zmiana slota, nie commituj
  if (isApplyingSlot) {
    gestureActive = false;
    gestureMoved = false;
    return;
  }

  if (gestureMoved) {
    pushHistory();
    markDirty();
    saveSlotsToLocal();
  }
  gestureActive = false;
  gestureMoved = false;
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

canvas.addEventListener("pointerdown", (e) => {
  if (!uploadedImg) return;
  if (isApplyingSlot) return;

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
  if (isApplyingSlot) return;
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
    _writeTransformToCurrentSlot();

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
      if (!isApplyingSlot && gestureMoved) {
        pushHistory();
        markDirty();
        saveSlotsToLocal();
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
    if (isApplyingSlot) return;

    const zoom = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    setUserScaleKeepingPoint(userScale * zoom);

    wheelHistoryCommit();
    e.preventDefault();
  },
  { passive: false }
);

function wheelHistoryCommit() {
  // zapamiętaj slot, którego dotyczy wheel
  wheelCommitSlot = currentSlot;

  if (wheelTimer) window.clearTimeout(wheelTimer);
  wheelTimer = window.setTimeout(() => {
    if (isApplyingSlot) { wheelTimer = 0; return; }

    // jeśli w międzyczasie zmieniono slot — nie zapisuj
    if (currentSlot !== wheelCommitSlot) {
      wheelTimer = 0;
      return;
    }

    pushHistory();
    markDirty();
    saveSlotsToLocal();
    wheelTimer = 0;
  }, 180);
}

if (btnFit) btnFit.addEventListener("click", fitToCover);
if (btnCenter) btnCenter.addEventListener("click", centerPhoto);

if (btnZoomIn) {
  btnZoomIn.addEventListener("click", () => {
    if (!uploadedImg) return toast("Najpierw wgraj zdjęcie.");
    if (isApplyingSlot) return;

    setUserScaleKeepingPoint(userScale * 1.12);
    pushHistory();
    markDirty();
    saveSlotsToLocal();
  });
}
if (btnZoomOut) {
  btnZoomOut.addEventListener("click", () => {
    if (!uploadedImg) return toast("Najpierw wgraj zdjęcie.");
    if (isApplyingSlot) return;

    if (!freeMove && userScale <= MIN_USER_SCALE_LOCKED + 1e-6) {
      toast("Aby bardziej pomniejszyć, odblokuj 🔓 Kadr.");
      return;
    }

    setUserScaleKeepingPoint(userScale / 1.12);
    pushHistory();
    markDirty();
    saveSlotsToLocal();
  });
}
/* ========END======== [SEKCJA 18] DRAG + ZOOM (GESTY) =========END======== */




/* ========START======== [SEKCJA 19] SZABLONY =========START======== */
let templateReqSeq = 0;

async function fetchJsonFirstOk(urls) {
  let lastErr = null;
  for (const u of urls) {
    try {
      const res = await fetch(withV(u), { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("Brak źródła JSON");
}

async function loadTemplatesFromConfig() {
  const candidates = productConfig?.assets?.templates?.list_urls || [
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

function templateFolderBase() {
  return productConfig?.assets?.templates?.folder_base || `${REPO_BASE}/assets/templates/coasters/`;
}
function templateFolderUrl(id) {
  const base = templateFolderBase();
  const b = base.endsWith("/") ? base : (base + "/");
  return `${b}${encodeURIComponent(id)}/`;
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
        persistAndSave();
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

      // zapis templateId natychmiast
      persistAndSave();

      await applyTemplate(t, { slotIndex: currentSlot });

      updateStatusBar();
      pushHistory();
      toast(`Wybrano szablon: ${templateName()}`);
      markDirty();
      persistAndSave();
    };

    templateGrid.appendChild(item);
  });
}

async function applyTemplate(t, opts = {}) {
  const mySeq = ++templateReqSeq;
  const startedSlot = Number.isFinite(opts?.slotIndex) ? opts.slotIndex : currentSlot;
  const startedTemplateId = String(t?.id || "");

  const url = withV(templateFolderUrl(t.id) + "edit.png");
  const img = new Image();
  img.crossOrigin = "anonymous";

  return await new Promise((resolve) => {
    img.onload = () => {
      if (mySeq !== templateReqSeq) return resolve(false);
      if (currentSlot !== startedSlot) return resolve(false);
      if (!currentTemplate || String(currentTemplate.id || "") !== startedTemplateId) return resolve(false);

      templateEditImg = img;
      redraw();

      persistAndSave();
      resolve(true);
    };

    img.onerror = () => {
      if (!opts.silentErrors) {
        derr("Nie mogę wczytać:", url);
        toast("Nie mogę wczytać szablonu.");
      }
      resolve(false);
    };

    img.src = url;
  });
}

function clearTemplateSelection(opts = {}) {
  currentTemplate = null;
  templateEditImg = null;
  redraw();
  updateStatusBar();
  if (!opts.skipHistory) pushHistory();

  persistAndSave();
}
/* ========END======== [SEKCJA 19] SZABLONY =========END======== */


/* ========START======== [SEKCJA 20] EXPORT (NAZWY + PREVIEW JPG) =========START======== */
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
function sanitizeFileBase(raw) { return safeFileToken(raw, "projekt"); }
function sanitizeOrderId(raw) { return safeFileToken(raw, "").slice(0, 60); }

if (btnDownloadPreview) {
  btnDownloadPreview.addEventListener("click", () => {
    if (!uploadedImg) {
      toast("Najpierw wgraj zdjęcie, aby pobrać podgląd.");
      return;
    }

    const a = document.createElement("a");
    const nick = sanitizeFileBase(nickInput?.value);
    const pid = productConfig?.product?.type ? safeFileToken(productConfig.product.type, "produkt") : "produkt";
    const slotSuffix = QTY > 1 ? `_s${String(currentSlot + 1).padStart(2, "0")}of${QTY}` : "";
    a.download = `${nick}_${pid}${slotSuffix}_preview.jpg`;
    a.href = canvas.toDataURL("image/jpeg", 0.70);
    a.click();
    toast("Zapisano PODGLĄD JPG ✅");
  });
}
/* ========END======== [SEKCJA 20] EXPORT (NAZWY + PREVIEW JPG) =========END======== */


/* ========START======== [SEKCJA 21] OVERLAYS + LOCK UI =========START======== */
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
    "btnFreeMove",
    "btnThemeLight", "btnThemeDark",
    "btnDownloadPreview",
    "btnSendToProduction",
    "btnSlotPrev", "btnSlotNext",
    "btnApplyProductSelect",
    "productSelect",
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
/* ========END======== [SEKCJA 21] OVERLAYS + LOCK UI =========END======== */


/* ========START======== [SEKCJA 22] UPLOAD + PROJECT JSON + RENDER PRINT =========START======== */
const PROJECT_JSON_SCHEMA_VERSION = 2;

function roundNum(x, digits = 6) {
  const n = Number(x);
  if (!Number.isFinite(n)) return null;
  const m = Math.pow(10, digits);
  return Math.round(n * m) / m;
}

function buildProjectJson({ slotIndex, slotTotal, baseOrderId }) {
  const nick = (nickInput?.value || "").trim();
  const dpi = getEffectiveDpi();
  const urlNickRaw = getNickFromUrl();
  const urlOrderIdRaw = getOrderIdFromUrl();
  const orderId =
    sanitizeOrderId(urlOrderIdRaw) ||
    sanitizeOrderId(nick) ||
    "";

  const nowIso = new Date().toISOString();

  return JSON.stringify({
    schema_version: PROJECT_JSON_SCHEMA_VERSION,
    app: { name: "product-editor", version: CACHE_VERSION, repo_base: REPO_BASE },
    created_at_iso: nowIso,
    source_url: location.href,

    order: {
      nick: nick || "",
      order_id: orderId || "",
      base_order_id: baseOrderId || orderId || "",
      url_nick_raw: urlNickRaw || "",
      url_order_id_raw: urlOrderIdRaw || "",
      qty: slotTotal,
      slot_index: slotIndex + 1,
    },

    product: {
      type: productConfig?.product?.type || "unknown",
      shape: shape,
      size_mm: productConfig?.product?.size_mm || { w: 0, h: 0 },
      corner_radius_mm: productConfig?.product?.corner_radius_mm ?? null,
    },

    template: currentTemplate
      ? { id: String(currentTemplate.id || ""), name: String(currentTemplate.name || currentTemplate.id || "") }
      : null,

    transform: {
      coverScale: roundNum(coverScale, 8),
      userScale: roundNum(userScale, 8),
      offsetX: roundNum(offsetX, 3),
      offsetY: roundNum(offsetY, 3),
      rotation_deg: rotationDeg,
      free_move: freeMove,
      canvas_px: CANVAS_PX,
      print_dpi: PRINT_DPI,
      cut_ratio: CUT_RATIO,
    },

    quality: { effective_dpi: dpi == null ? null : Math.round(dpi), label: qualityLabelFromDpi(dpi) },

    cache_version: CACHE_VERSION,
    ts_iso: nowIso,
  }, null, 2);
}

/** NICK: czerwony tekst + biała obwódka (w spadzie) — tylko na PRINT */
function drawNickLabelOnPrint() {
  const nick = (nickInput?.value || "").trim();
  if (!nick) return;

  const fontPx = Math.max(12, Math.round((PRINT_DPI * 6) / 72));
  const pad = Math.max(2, Math.round(fontPx * 0.22));

  // 0px od krawędzi (maksymalnie blisko)
  const x = 0;
  const y = 0;

  ctx.save();
  ctx.font = `bold ${fontPx}px Arial, sans-serif`;
  ctx.textBaseline = "top";
  ctx.lineJoin = "round";

  const text = nick.length > 32 ? (nick.slice(0, 32) + "…") : nick;

  // Lepsza czytelność: mocniejsza obwódka + delikatny cień (nadal biały kontur, czerwony środek)
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = Math.max(1, Math.round(fontPx * 0.10));
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // biała obwódka (grubsza)
  ctx.lineWidth = Math.max(3, Math.round(fontPx * 0.30));
  ctx.strokeStyle = "#ffffff";
  ctx.strokeText(text, x + pad, y + pad);

  // wyłącz cień dla wypełnienia (czystsza czerwień)
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;

  // czerwony fill
  ctx.fillStyle = "#d00000";
  ctx.fillText(text, x + pad, y + pad);

  ctx.restore();
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
        drawNickLabelOnPrint();
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
        drawNickLabelOnPrint();
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

async function renderSheetFromSlotBlobsJpg(slotBlobs, cols, rows) {
  const maxRowsSafe = 10;
  if (rows > maxRowsSafe) throw new Error("Zbyt duży arkusz (za dużo wierszy)");

  const sheetCanvas = document.createElement("canvas");
  sheetCanvas.width = CANVAS_PX * cols;
  sheetCanvas.height = CANVAS_PX * rows;
  const sctx = sheetCanvas.getContext("2d");

  sctx.fillStyle = "#ffffff";
  sctx.fillRect(0, 0, sheetCanvas.width, sheetCanvas.height);

  const bitmaps = [];
  for (const b of slotBlobs) {
    if (typeof createImageBitmap === "function") {
      bitmaps.push(await createImageBitmap(b));
    } else {
      bitmaps.push(await new Promise((resolve, reject) => {
        const url = URL.createObjectURL(b);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Nie mogę wczytać blob do arkusza")); };
        img.src = url;
      }));
    }
  }

  for (let i = 0; i < cols * rows; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);

    const x = col * CANVAS_PX;
    const y = row * CANVAS_PX;

    if (i < bitmaps.length) {
      const bm = bitmaps[i];
      sctx.drawImage(bm, x, y, CANVAS_PX, CANVAS_PX);
      if (bm.close) try { bm.close(); } catch {}
    } else {
      sctx.fillStyle = "#ffffff";
      sctx.fillRect(x, y, CANVAS_PX, CANVAS_PX);
    }
  }

  return await new Promise((resolve, reject) => {
    sheetCanvas.toBlob((blob) => {
      if (!blob) return reject(new Error("Nie udało się wygenerować arkusza"));
      resolve(blob);
    }, "image/jpeg", 1.0);
  });
}

async function uploadToServer(blob, jsonText, filename, orderIdForUpload, fileBaseOrEmpty) {
  const fd = new FormData();

  if (orderIdForUpload) fd.append("order_id", orderIdForUpload);
  if (fileBaseOrEmpty) fd.append("file_base", String(fileBaseOrEmpty));

  fd.append("jpg", blob, filename);
  fd.append("json", jsonText);

  const headers = {};
  if (productConfig?.token) headers["X-Project-Token"] = productConfig.token;

  const uploadUrl = productConfig?.api?.upload_url || `${REPO_BASE}/api/upload.php`;

  const res = await fetch(uploadUrl, {
    method: "POST",
    headers,
    body: fd,
  });

  const txt = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`Upload HTTP ${res.status}: ${txt || "błąd"}`);

  let data = null;
  try { data = txt ? JSON.parse(txt) : null; } catch {}

  if (data && data.ok === false) throw new Error(data.error || "Upload nieudany");
  return data || { ok: true };
}
/* ========END======== [SEKCJA 22] UPLOAD + PROJECT JSON + RENDER PRINT =========END======== */




/* ========START======== [SEKCJA 23] MODAL NICK =========START======== */
let pendingSendAfterNick = false;
let lastFocusElBeforeModal = null;

function focusNickFieldWithHint() {
  toast("Uzupełnij podpis / nick, aby wysłać projekt do realizacji.");

  if (nickInput) {
    try { nickInput.focus({ preventScroll: true }); } catch { try { nickInput.focus(); } catch {} }
    try { nickInput.scrollIntoView({ behavior: "smooth", block: "center" }); } catch {}
    nickInput.style.outline = "2px solid #f59e0b";
    setTimeout(() => { nickInput.style.outline = ""; }, 1200);
  } else {
    alert("Uzupełnij podpis / nick, aby wysłać projekt do realizacji.");
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
/* ========END======== [SEKCJA 23] MODAL NICK =========END======== */


/* ========START======== [SEKCJA 24] SEND (KOMPLET + ARKUSZ) =========START======== */
function dpiWarningText(dpi) {
  if (dpi == null) return null;

  const v = Math.round(dpi);
  const q = qualityLabelFromDpi(dpi);

  const common =
    `Wykryta jakość: ${q} (ok. ${v} DPI).\n\n` +
    `Jeśli zaakceptujesz, wydruk może być mniej ostry/pikselowy.\n\n`;

  if (dpi < DPI_WEAK_MAX) return common + "Czy mimo to chcesz wysłać projekt do realizacji?";
  if (dpi < DPI_MED_MAX) return common + "Czy mimo to chcesz kontynuować wysyłkę?";
  return null;
}

function slotHasPhoto(i) {
  return !!(slots[i] && slots[i].photoDataUrl);
}

function joinNumsPolish(nums) {
  const a = nums.map(String);
  if (a.length === 0) return "";
  if (a.length === 1) return a[0];
  if (a.length === 2) return `${a[0]} i ${a[1]}`;
  return `${a.slice(0, -1).join(", ")} i ${a[a.length - 1]}`;
}

async function ensureAllSlotsHavePhotosOrConfirm() {
  if (QTY <= 1) return true;

  const missing = [];
  for (let i = 0; i < QTY; i++) if (!slotHasPhoto(i)) missing.push(i + 1);
  if (missing.length === 0) return true;

  const label = missing.length === 1
    ? `Brakuje zdjęcia w podkładce nr ${missing[0]}.`
    : `Brakuje zdjęcia w podkładkach nr ${joinNumsPolish(missing)}.`;

  const msg =
    `${label}\n\n` +
    `Aby wysłać komplet, uzupełnij brakujące podkładki.\n\n` +
    `Przejść do pierwszego brakującego?`;

  const ok = window.confirm(msg);
  if (ok) await setSlot(missing[0] - 1);
  return false;
}

async function sendToProduction(skipNickCheck = false) {
  if (productionLocked) return;

  const nick = (nickInput?.value || "").trim();
  if (!skipNickCheck && !nick) {
    openNickModal();
    return;
  }

  if (!(await ensureAllSlotsHavePhotosOrConfirm())) return;

  const first = window.confirm("Czy na pewno chcesz wysłać projekt do realizacji?");
  if (!first) return;

  const second = window.confirm(
    "To ostatni krok.\n\nPo wysłaniu projekt trafia do produkcji i nie będzie można wprowadzić zmian.\n\nKontynuować?"
  );
  if (!second) return;

  closeErrorOverlay();
  setUiLocked(true, "Trwa wysyłanie do realizacji…");
  toast("Wysyłanie do realizacji…");

  try {
    persistCurrentSlotState();
    saveSlotsToLocal();

    const urlOrderIdRaw = getOrderIdFromUrl();
    const baseOrderId =
      sanitizeOrderId(urlOrderIdRaw) ||
      sanitizeOrderId(nick) ||
      "";

    const nickBase = sanitizeFileBase(nick || baseOrderId || "projekt");

    // jeden wspólny order_id dla wszystkich uploadów => jeden katalog na serwerze
    const commonOrderIdForUpload = baseOrderId || nickBase || "projekt";

    const slotPrintBlobs = [];

    for (let i = 0; i < QTY; i++) {
      await setSlot(i);

      const dpi = getEffectiveDpi();
      const dpiWarn = dpiWarningText(dpi);
      if (dpiWarn) {
        const ok = window.confirm(`Podkładka ${i + 1}/${QTY}:\n\n` + dpiWarn);
        if (!ok) {
          setUiLocked(false);
          toast("Wysyłka przerwana (ostrzeżenie jakości).");
          closeErrorOverlay();
          updateSlotUi();
          return;
        }
      }

      const jsonText = buildProjectJson({ slotIndex: i, slotTotal: QTY, baseOrderId: commonOrderIdForUpload });
      const jpgBlob = await renderProductionJpgBlob();
      slotPrintBlobs.push(jpgBlob);

      const fileBase = `${nickBase}_${String(i + 1).padStart(2, "0")}`;

      await uploadToServer(
        jpgBlob,
        jsonText,
        `${fileBase}.jpg`,
        commonOrderIdForUpload,
        fileBase
      );
    }

    if (QTY > 1) {
      const cols = 2;
      const rows = Math.ceil(QTY / 2);

      try {
        const sheetBlob = await renderSheetFromSlotBlobsJpg(slotPrintBlobs, cols, rows);

        const sheetBase = `${nickBase}_ARKUSZ_${cols}x${rows}`;
        const sheetJson = JSON.stringify({
          schema_version: 1,
          type: "coaster_sheet",
          app_version: CACHE_VERSION,
          order: { base_order_id: commonOrderIdForUpload, nick: nick || "", qty: QTY },
          layout: {
            cols,
            rows,
            cell_mm: { w: 100, h: 100 },
            sheet_mm: { w: cols * 100, h: rows * 100 },
          },
          files: Array.from({ length: QTY }).map((_, idx) => ({
            slot: idx + 1,
            file_base: `${nickBase}_${String(idx + 1).padStart(2, "0")}`,
          })),
        }, null, 2);

        await uploadToServer(
          sheetBlob,
          sheetJson,
          `${sheetBase}.jpg`,
          commonOrderIdForUpload,
          sheetBase
        );
      } catch (e) {
        derr(e);
        toast("Uwaga: nie udało się wygenerować arkusza (dodatkowego) — sloty wysłane poprawnie.");
      }
    }

    markClean();
    setBusyOverlay(false);

    showFinalOverlay(
      "Wysłano do realizacji ✅",
      QTY > 1
        ? `Wysłano komplet: ${QTY} szt. (+ arkusz 2×${Math.ceil(QTY / 2)})`
        : "Projekt został przekazany do produkcji."
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
  } finally {
    updateSlotUi();
  }
}

if (btnSendToProduction) btnSendToProduction.addEventListener("click", () => sendToProduction(false));
if (nickInput) nickInput.addEventListener("input", () => { markDirty(); saveSlotsToLocal(); });

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
/* ========END======== [SEKCJA 24] SEND (KOMPLET + ARKUSZ) =========END======== */


/* ========START======== [SEKCJA 25] APPLY productConfig =========START======== */
function applyNickFromUrlIfEmpty() {
  if (!nickInput) return;
  const current = (nickInput.value || "").trim();
  if (current) return;

  const v = (getNickFromUrl() || getOrderIdFromUrl() || "").trim();
  if (!v) return;

  nickInput.value = v;
}

async function applyProductConfig(cfg) {
  productConfig = cfg;

  CANVAS_PX = cfg.render.canvas_px;
  CUT_RATIO = cfg.render.cut_ratio;
  PRINT_DPI = cfg.render.print_dpi;

  if (canvas.width !== CANVAS_PX || canvas.height !== CANVAS_PX) {
    canvas.width = CANVAS_PX;
    canvas.height = CANVAS_PX;
  }

  MASK_URLS = { ...MASK_URLS, ...cfg.assets.masks };

  const sizeW = cfg.product?.size_mm?.w ?? 0;
  const sizeH = cfg.product?.size_mm?.h ?? 0;
  const autoTitle = cfg.ui.title || cfg.product?.name || "Edytor produktu";
  const autoSub = cfg.ui.subtitle || `Projekt ${sizeW}×${sizeH} mm (spad).`;
  setUiTitleSubtitle(autoTitle, autoSub);

  const shapeOptions = (cfg.product?.shape_options || ["square", "circle"]).map(String);
  setShapeButtonsAvailability(shapeOptions);

  const desired = String(cfg.product?.shape_default || "square");
  const initialShape = shapeOptions.includes(desired) ? desired : (shapeOptions[0] || "square");
  await setShape(initialShape, { skipHistory: true });

  applyMaskForShape(shape);

  try {
    const templates = await loadTemplatesFromConfig();
    renderTemplateGrid(templates);
  } catch (err) {
    derr(err);
    if (templateGrid) templateGrid.innerHTML = `<div class="smallText">Nie udało się wczytać szablonów.</div>`;
    toast("Nie udało się wczytać szablonów.");
  }

  refreshExportButtons();
  updateStatusBar();
}
/* ========END======== [SEKCJA 25] APPLY productConfig =========END======== */


/* ========START======== [SEKCJA 26] INIT =========START======== */
(async function init() {
  function ensureResetProjectButton() {
    const ID = "btnResetProject";
    let btn = document.getElementById(ID);
    if (btn) return btn;

    btn = document.createElement("button");
    btn.type = "button";
    btn.id = ID;
    btn.textContent = "↺ Reset projektu";
    btn.title = "Wyczyść zapisane zdjęcia/sloty dla tego zamówienia na tym urządzeniu";

    // Bez zależności od CSS — ma działać wszędzie
    btn.style.position = "fixed";
    btn.style.right = "12px";
    btn.style.bottom = "12px";
    btn.style.zIndex = "9999";
    btn.style.padding = "10px 12px";
    btn.style.borderRadius = "12px";
    btn.style.border = "1px solid rgba(0,0,0,0.15)";
    btn.style.background = "#ffffff";
    btn.style.color = "#111827";
    btn.style.font = "600 13px/1.1 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    btn.style.boxShadow = "0 8px 20px rgba(0,0,0,0.12)";
    btn.style.cursor = "pointer";
    btn.style.opacity = "0.92";

    btn.addEventListener("mouseenter", () => { btn.style.opacity = "1"; });
    btn.addEventListener("mouseleave", () => { btn.style.opacity = "0.92"; });

    document.body.appendChild(btn);
    return btn;
  }

  async function resetProjectNow() {
    if (productionLocked) return;

    const ok = window.confirm(
      "Zresetować projekt na tym urządzeniu?\n\n" +
      "• usunie zapisane zdjęcia/sloty (localStorage)\n" +
      "• wyczyści kadrowanie i szablony\n\n" +
      "To dotyczy tylko tego zamówienia i tej przeglądarki."
    );
    if (!ok) return;

    try {
      // zatrzymaj opóźnione commity
      if (wheelTimer) { window.clearTimeout(wheelTimer); wheelTimer = 0; }
      commitGestureIfActive();

      // usuń zapisy (nowy + stary klucz migracji)
      try {
        localStorage.removeItem(slotKeyBase());
        localStorage.removeItem(slotKeyBaseV1());
      } catch {}

      // reset runtime stanu slotów
      slots = new Array(QTY).fill(null).map(() => ({
        photoDataUrl: "",
        shape: "square",
        templateId: "",
        rotationDeg: 0,
        userScale: 1,
        offsetX: 0,
        offsetY: 0,
        freeMove: false,
      }));

      // reset historii per-slot (jeśli istnieje)
      if (typeof historyBySlot !== "undefined") {
        historyBySlot = Array.from({ length: QTY }, () => ({ stack: [], index: -1 }));
      }
      if (typeof uploadSeq !== "undefined") {
        uploadSeq++; // unieważnij ewentualne trwające uploady
      }

      // wyczyść bieżący runtime widoku
      currentSlot = 0;
      slotApplySeq++;
      await applySlotState(slotApplySeq);

      // zapisz świeży stan (pusty)
      saveSlotsToLocal();

      markClean();
      refreshExportButtons();
      updateSlotUi();

      toast("Projekt zresetowany ✅");
    } catch (e) {
      derr(e);
      toast("Nie udało się zresetować projektu.");
    }
  }

  initTheme();
  wireThemeButtons();

  updateUiVersionBadge();
  applyNickFromUrlIfEmpty();
  syncFreeMoveButton();

  slots = new Array(QTY).fill(null).map(() => ({
    photoDataUrl: "", // ORYGINAŁ (DataURL)
    shape: "square",
    templateId: "",
    rotationDeg: 0,
    userScale: 1,
    offsetX: 0,
    offsetY: 0,
    freeMove: false,
  }));

  migrateSlotsKeyIfNeeded();
  const saved = loadSlotsFromLocal();
  if (saved && saved.length === QTY) {
    for (let i = 0; i < QTY; i++) {
      const s = saved[i] || {};
      slots[i] = {
        ...slots[i],
        photoDataUrl: String(s.photoDataUrl || ""),
        shape: String(s.shape || "square"),
        templateId: String(s.templateId || ""),
        rotationDeg: Number(s.rotationDeg || 0),
        userScale: Number(s.userScale || 1),
        offsetX: Number(s.offsetX || 0),
        offsetY: Number(s.offsetY || 0),
        freeMove: !!s.freeMove,
      };
    }
  }

  wireSlotUi();
  updateSlotUi();

  setUiTitleSubtitle("Edytor", "Ładowanie konfiguracji…");
  refreshExportButtons();

  const cfg = await loadConfigFromBackend(TOKEN);

  if (cfg) {
    await applyProductConfig(cfg);
    toast("Konfiguracja załadowana ✅");
  } else {
    showProductManualChooser();

    const manualCfg = normalizeProductConfig(MANUAL_PRESETS[0], { token: "", mode: "manual" });
    await applyProductConfig(manualCfg);

    toast("Backend/token niedostępny — uruchomiono tryb ręczny.");
  }

  currentSlot = 0;
  await applySlotState();

  redraw();
  updateStatusBar();
  pushHistory();
  markClean();

  // przycisk resetu projektu (dla testów i dla klientów)
  const resetBtn = ensureResetProjectButton();
  resetBtn.disabled = false;
  resetBtn.addEventListener("click", (e) => {
    e.preventDefault();
    resetProjectNow();
  });

  dlog("Loaded", { CACHE_VERSION, DEBUG, TOKEN, mode: productConfig?.mode, QTY });
})();
/* ========END======== [SEKCJA 26] INIT =========END======== */


/* === KONIEC PLIKU — editor/editor.js | FILE_VERSION: 2026-02-11-18 === */
