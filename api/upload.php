<?php
declare(strict_types=1);

/**
 * api/upload.php
 * FILE_VERSION: 2026-02-14-01
 *
 * KONTRAKT TRYBÓW:
 *  - DEMO (mode=demo): upload ALWAYS OFF (403), niezależnie od tokena.
 *  - PRODUKCJA: upload ON tylko gdy jest poprawny project token.
 *
 * Autoryzacja (kanałowo-neutralna):
 *  - preferowane: X-Project-Token
 *  - alternatywnie: Authorization: Bearer <token>
 *  - awaryjnie: GET ?token=..., POST project_token=
 *
 * Legacy upload token:
 *  - domyślnie WYŁĄCZONY (blokujemy chaos).
 *  - można włączyć tylko przez ENV: LEGACY_UPLOAD_TOKEN
 *
 * Wejście:
 *  - obraz: pole "jpg" lub "png" (kompatybilność)
 *  - json: pole POST "json" lub plik "json_file"
 *  - order_id: POST "order_id" (opcjonalnie)  -> dla katalogu
 *  - file_base: POST "file_base" (opcjonalnie) -> nazwa pliku (bez rozszerzenia), np. "nick_01"
 *  - mode: GET/POST "mode" (opcjonalnie) -> "demo" blokuje upload
 *
 * Zapis:
 *  uploads/<base_order_id|no_order>/{file_base_or_generated}.{jpg|png} + {same}.json
 *
 * Wyjście:
 *  { ok:true, id, image_url, json_url, request_id, server_ts }
 */

const MAX_IMAGE_BYTES = 25_000_000; // 25 MB
const MAX_JSON_BYTES  = 2_000_000;  // 2 MB

const SHORT_SUFFIX_LEN = 5;
const NAME_TRIES = 20;

// log
const LOG_DIR_NAME = 'logs';
const LOG_FILE_NAME = 'upload.log';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

function respond_json(int $code, array $payload): void {
  http_response_code($code);
  echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

function mask_token(string $t): string {
  $t = trim($t);
  if ($t === '') return '';
  $len = strlen($t);
  if ($len <= 6) return str_repeat('*', $len);
  return substr($t, 0, 3) . str_repeat('*', max(0, $len - 6)) . substr($t, -3);
}

function get_client_ip(): string {
  return (string)($_SERVER['REMOTE_ADDR'] ?? '');
}

function now_iso(): string {
  return gmdate('c');
}

function ensure_dir(string $path, int $mode = 0755): void {
  if (is_dir($path)) return;
  if (!mkdir($path, $mode, true) && !is_dir($path)) {
    respond_json(500, [
      'ok' => false,
      'error_code' => 'SERVER_CANNOT_CREATE_DIR',
      'error_message' => 'Cannot create required directory',
    ]);
  }
}

function log_line(string $line): void {
  $baseDir = realpath(__DIR__ . '/..');
  if ($baseDir === false) return;

  $logDir = __DIR__ . DIRECTORY_SEPARATOR . LOG_DIR_NAME;
  if (!is_dir($logDir)) @mkdir($logDir, 0755, true);

  $path = $logDir . DIRECTORY_SEPARATOR . LOG_FILE_NAME;
  @file_put_contents($path, $line . "\n", FILE_APPEND);
}

function fail(int $code, string $error_code, string $error_message, array $extra = []): void {
  global $REQUEST_ID, $AUTH_CONTEXT, $ORDER_ID_CLEAN, $ORDER_DIR_NAME, $FILE_BASE_CLEAN, $MODE;

  $payload = array_merge([
    'ok' => false,
    'error_code' => $error_code,
    'error_message' => $error_message,
    'request_id' => $REQUEST_ID,
    'server_ts' => now_iso(),
  ], $extra);

  $ip = get_client_ip();
  $tokenMasked = mask_token((string)($AUTH_CONTEXT['project_token'] ?? ''));
  $orderMasked = (string)($ORDER_ID_CLEAN ?? '');
  $dirName = (string)($ORDER_DIR_NAME ?? '');
  $fileBase = (string)($FILE_BASE_CLEAN ?? '');
  $mode = (string)($MODE ?? '');

  log_line(sprintf(
    '[%s] request_id=%s ip=%s status=%d ok=0 code=%s mode=%s auth_mode=%s order_id=%s dir=%s file_base=%s token=%s msg=%s',
    now_iso(),
    $REQUEST_ID,
    $ip,
    $code,
    $error_code,
    $mode,
    (string)($AUTH_CONTEXT['mode'] ?? ''),
    $orderMasked,
    $dirName,
    $fileBase,
    $tokenMasked,
    str_replace(["\n", "\r"], [' ', ' '], $error_message)
  ));

  respond_json($code, $payload);
}

/* ==== REQUEST CONTEXT ==== */
$REQUEST_ID = bin2hex(random_bytes(8));
$AUTH_CONTEXT = ['mode' => 'none', 'project_token' => ''];
$ORDER_ID_CLEAN = '';
$ORDER_DIR_NAME = '';
$FILE_BASE_CLEAN = '';
$MODE = strtolower(trim((string)($_GET['mode'] ?? ($_POST['mode'] ?? ''))));

/**
 * DEMO kontrakt: upload zawsze OFF.
 * Nawet jeśli ktoś dopnie token do demo linku, to tu nadal blokujemy.
 */
if ($MODE === 'demo') {
  // logujemy krótko, ale nie przechodzimy dalej
  log_line(sprintf(
    '[%s] request_id=%s ip=%s status=403 ok=0 code=%s mode=demo auth_mode=none msg=%s',
    now_iso(),
    $REQUEST_ID,
    get_client_ip(),
    'DEMO_UPLOAD_DISABLED',
    'Upload disabled in demo mode'
  ));

  respond_json(403, [
    'ok' => false,
    'error_code' => 'DEMO_UPLOAD_DISABLED',
    'error_message' => 'Upload is disabled in demo mode',
    'request_id' => $REQUEST_ID,
    'server_ts' => now_iso(),
  ]);
}

function extract_project_token(): string {
  $t = (string)($_SERVER['HTTP_X_PROJECT_TOKEN'] ?? '');
  $t = trim($t);
  if ($t !== '') return $t;

  $auth = trim((string)($_SERVER['HTTP_AUTHORIZATION'] ?? ''));
  if ($auth !== '') {
    if (stripos($auth, 'Bearer ') === 0) {
      $b = trim(substr($auth, 7));
      if ($b !== '') return $b;
    }
  }

  $t = trim((string)($_GET['token'] ?? ''));
  if ($t !== '') return $t;

  $t = trim((string)($_POST['project_token'] ?? ''));
  if ($t !== '') return $t;

  return '';
}

function authorize(): array {
  // PRODUKCJA: wymagamy project tokena
  $projectToken = extract_project_token();

  if ($projectToken === '') {
    // brak tokena != błąd „niezalogowany” frontu → to jest po prostu zabronione
    fail(403, 'UPLOAD_REQUIRES_TOKEN', 'Upload requires a valid project token');
  }

  $cfgPath = __DIR__ . '/project.config.php';
  if (!is_file($cfgPath) || !is_readable($cfgPath)) {
    fail(500, 'SERVER_MISCONFIG', 'project.config.php missing or unreadable');
  }

  $map = require $cfgPath;
  if (!is_array($map)) {
    fail(500, 'SERVER_MISCONFIG', 'project.config.php must return array');
  }

  if (!array_key_exists($projectToken, $map)) {
    fail(401, 'UNAUTHORIZED_UNKNOWN_PROJECT_TOKEN', 'Unauthorized (unknown project token)');
  }

  return ['mode' => 'project', 'project_token' => $projectToken];
}

/**
 * Legacy token (opcjonalnie):
 * domyślnie wyłączony (ENV pusty) – żeby nie było ukrytej furtki.
 * Jeśli chcesz go włączyć, ustaw env LEGACY_UPLOAD_TOKEN na serwerze.
 */
function authorize_legacy_if_enabled(): void {
  $legacySecret = (string)getenv('LEGACY_UPLOAD_TOKEN');
  $legacySecret = trim($legacySecret);
  if ($legacySecret === '') return; // wyłączone

  $legacy = (string)($_SERVER['HTTP_X_UPLOAD_TOKEN'] ?? ($_POST['token'] ?? ''));
  $legacy = trim($legacy);
  if ($legacy !== '' && hash_equals($legacySecret, $legacy)) {
    // legacy jest świadomie włączony
    global $AUTH_CONTEXT;
    $AUTH_CONTEXT = ['mode' => 'legacy', 'project_token' => ''];
  }
}

/* ==== AUTH ==== */
$AUTH_CONTEXT = authorize();
authorize_legacy_if_enabled();

/* ==== ŚCIEŻKI ==== */
$baseDir = realpath(__DIR__ . '/..');
if ($baseDir === false) {
  fail(500, 'SERVER_MISCONFIG', 'Server misconfig: base dir not found');
}

$uploadRoot = $baseDir . DIRECTORY_SEPARATOR . 'uploads';
ensure_dir($uploadRoot, 0755);

/* ==== HELPERS ==== */
function mb_substr_safe(string $s, int $start, int $len): string {
  if (function_exists('mb_substr')) return (string)mb_substr($s, $start, $len, 'UTF-8');
  return substr($s, $start, $len);
}

function clean_id(string $raw, int $maxLen = 32): string {
  $s = trim($raw);
  if ($s === '') return '';

  if (class_exists('Normalizer')) {
    $s = \Normalizer::normalize($s, \Normalizer::FORM_C) ?: $s;
  }

  $s = preg_replace('~\s+~u', '_', $s) ?? $s;
  $s = preg_replace('~[\x00-\x1F\x7F]~u', '', $s) ?? $s;
  $s = str_replace(['\\','/',':','*','?','"','<','>','|'], '_', $s);
  $s = preg_replace('~[^\p{L}\p{N}_-]~u', '', $s) ?? '';
  $s = preg_replace('~_+~u', '_', $s) ?? $s;
  $s = preg_replace('~^-+|_+$|^_+|-+$~u', '', $s) ?? $s;
  $s = ltrim($s, '.');
  $s = mb_substr_safe($s, 0, $maxLen);

  return $s;
}

function random_suffix(int $len): string {
  $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ234567';
  $out = '';
  $max = strlen($alphabet) - 1;
  for ($i = 0; $i < $len; $i++) $out .= $alphabet[random_int(0, $max)];
  return $out;
}

/**
 * Z order_id typu "ABC_s01of05" robimy katalog "ABC".
 */
function base_order_dir_from_clean_order_id(string $clean): string {
  if ($clean === '') return '';
  $base = preg_replace('~_s\d{2}of\d{1,2}$~u', '', $clean) ?? $clean;
  return trim($base, '_-');
}

/**
 * Wybór unikalnej bazy nazwy pliku (bez rozszerzenia).
 * Jeśli preferowana baza wolna -> używamy jej.
 * Jeśli kolizja -> dopisujemy suffix.
 */
function pick_unique_base(string $preferred, string $dir): string {
  $preferred = trim($preferred);

  $tryBases = [];
  if ($preferred !== '') $tryBases[] = $preferred;

  // fallback: losowe
  for ($i = 0; $i < NAME_TRIES; $i++) {
    $tryBases[] = ($preferred !== '' ? ($preferred . '_' . random_suffix(SHORT_SUFFIX_LEN)) : random_suffix(SHORT_SUFFIX_LEN));
  }

  foreach ($tryBases as $base) {
    $png  = $dir . DIRECTORY_SEPARATOR . $base . '.png';
    $jpg  = $dir . DIRECTORY_SEPARATOR . $base . '.jpg';
    $json = $dir . DIRECTORY_SEPARATOR . $base . '.json';
    if (!file_exists($png) && !file_exists($jpg) && !file_exists($json)) return $base;
  }

  // ostatecznie dłuższy suffix
  return ($preferred !== '' ? ($preferred . '_' . random_suffix(SHORT_SUFFIX_LEN + 3)) : random_suffix(SHORT_SUFFIX_LEN + 3));
}

/* ==== ORDER / DIR ==== */
$ORDER_ID_CLEAN = clean_id((string)($_POST['order_id'] ?? ''), 32);
$baseForDir = base_order_dir_from_clean_order_id($ORDER_ID_CLEAN);
$ORDER_DIR_NAME = $baseForDir !== '' ? $baseForDir : 'no_order';

$uploadDir = $uploadRoot . DIRECTORY_SEPARATOR . $ORDER_DIR_NAME;
ensure_dir($uploadDir, 0755);

/* ==== FILE BASE (NAZWA) ==== */
$FILE_BASE_CLEAN = clean_id((string)($_POST['file_base'] ?? ''), 60);

/* ==== PLIK OBRAZU ==== */
$fileKey = null;
if (isset($_FILES['jpg']) && is_uploaded_file($_FILES['jpg']['tmp_name'])) $fileKey = 'jpg';
if ($fileKey === null && isset($_FILES['png']) && is_uploaded_file($_FILES['png']['tmp_name'])) $fileKey = 'png';

if ($fileKey === null) {
  fail(400, 'MISSING_IMAGE', 'Missing image file (expected field jpg or png)');
}

$size = (int)($_FILES[$fileKey]['size'] ?? 0);
if ($size <= 0) {
  fail(400, 'EMPTY_IMAGE', 'Empty image upload');
}
if ($size > MAX_IMAGE_BYTES) {
  fail(413, 'IMAGE_TOO_LARGE', 'Image too large', ['max_bytes' => MAX_IMAGE_BYTES, 'bytes' => $size]);
}

/* ==== MIME CHECK ==== */
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = $finfo->file($_FILES[$fileKey]['tmp_name']) ?: '';

$ext = null;
if ($mime === 'image/png') $ext = 'png';
elseif ($mime === 'image/jpeg' || $mime === 'image/jpg') $ext = 'jpg';
else {
  fail(415, 'UNSUPPORTED_MEDIA_TYPE', 'Only PNG or JPG allowed', ['mime' => $mime]);
}

/* ==== FINAL BASE NAME ==== */
$baseName = pick_unique_base(
  $FILE_BASE_CLEAN !== '' ? $FILE_BASE_CLEAN : $ORDER_ID_CLEAN,
  $uploadDir
);

$id = $baseName;

$imageName = $baseName . '.' . $ext;
$imagePath = $uploadDir . DIRECTORY_SEPARATOR . $imageName;

if (!move_uploaded_file($_FILES[$fileKey]['tmp_name'], $imagePath)) {
  fail(500, 'CANNOT_SAVE_IMAGE', 'Cannot save image');
}

/* ==== JSON (opcjonalny) ==== */
$jsonSaved = false;
$jsonName = $baseName . '.json';
$jsonPath = $uploadDir . DIRECTORY_SEPARATOR . $jsonName;

$jsonText = $_POST['json'] ?? '';
if (is_string($jsonText) && $jsonText !== '') {
  if (strlen($jsonText) > MAX_JSON_BYTES) {
    fail(413, 'JSON_TOO_LARGE', 'JSON too large', ['max_bytes' => MAX_JSON_BYTES, 'bytes' => strlen($jsonText)]);
  }
  $decoded = json_decode($jsonText, true);
  if ($decoded === null && json_last_error() !== JSON_ERROR_NONE) {
    fail(400, 'INVALID_JSON', 'Invalid JSON payload', ['json_error' => json_last_error_msg()]);
  }
  // zapisujemy oryginał (nie normalizujemy), ale wiemy że jest poprawny JSON
  @file_put_contents($jsonPath, $jsonText);
  $jsonSaved = true;
} elseif (isset($_FILES['json_file']) && is_uploaded_file($_FILES['json_file']['tmp_name'])) {
  $js = (int)($_FILES['json_file']['size'] ?? 0);
  if ($js > MAX_JSON_BYTES) {
    fail(413, 'JSON_FILE_TOO_LARGE', 'JSON file too large', ['max_bytes' => MAX_JSON_BYTES, 'bytes' => $js]);
  }

  $raw = (string)file_get_contents($_FILES['json_file']['tmp_name']);
  if ($raw !== '') {
    $decoded = json_decode($raw, true);
    if ($decoded === null && json_last_error() !== JSON_ERROR_NONE) {
      fail(400, 'INVALID_JSON_FILE', 'Invalid JSON file', ['json_error' => json_last_error_msg()]);
    }
  }

  @move_uploaded_file($_FILES['json_file']['tmp_name'], $jsonPath);
  $jsonSaved = true;
}

/* ==== OK RESPONSE ==== */
$baseUrl = 'https://puzzla.nazwa.pl/puzzla/projekt-podkladek/uploads/' . rawurlencode($ORDER_DIR_NAME) . '/';

$ip = get_client_ip();
$tokenMasked = mask_token((string)($AUTH_CONTEXT['project_token'] ?? ''));
log_line(sprintf(
  '[%s] request_id=%s ip=%s status=200 ok=1 mode=%s auth_mode=%s order_id=%s dir=%s file_base=%s token=%s file=%s bytes=%d mime=%s json=%s',
  now_iso(),
  $REQUEST_ID,
  $ip,
  (string)$MODE,
  (string)($AUTH_CONTEXT['mode'] ?? ''),
  (string)$ORDER_ID_CLEAN,
  (string)$ORDER_DIR_NAME,
  (string)$FILE_BASE_CLEAN,
  $tokenMasked,
  $imageName,
  $size,
  $mime,
  $jsonSaved ? '1' : '0'
));

respond_json(200, [
  'ok' => true,
  'mode' => $MODE === '' ? 'prod' : $MODE,
  'auth_mode' => $AUTH_CONTEXT['mode'],
  'id' => $id,
  'order_dir' => $ORDER_DIR_NAME,
  'image_url' => $baseUrl . $imageName,
  'json_url' => $jsonSaved ? ($baseUrl . $jsonName) : null,
  'request_id' => $REQUEST_ID,
  'server_ts' => now_iso(),
]);

/* === KONIEC PLIKU — api/upload.php | FILE_VERSION: 2026-02-14-01 === */
