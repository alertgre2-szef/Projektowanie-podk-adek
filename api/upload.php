<?php
declare(strict_types=1);

/**
 * api/upload.php
 * FILE_VERSION: 2026-02-11-02
 *
 * Autoryzacja (kanałowo-neutralna):
 *  - preferowane: X-Project-Token
 *  - alternatywnie: Authorization: Bearer <token>
 *  - awaryjnie: GET ?token=..., POST project_token=
 *  - legacy: X-Upload-Token (stały sekret) lub POST token=
 *
 * Wejście:
 *  - obraz: pole "jpg" lub "png" (kompatybilność)
 *  - json: pole POST "json" lub plik "json_file"
 *  - order_id: POST "order_id" (opcjonalnie)
 *
 * Wyjście:
 *  { ok:true, id, image_url, json_url, request_id, server_ts }
 */

const LEGACY_UPLOAD_TOKEN = '4f9c7d2a8e1b5f63c0a9e72d41f8b6c39e5a0d7f1b2c8e4a6d9f3c1b7e0a2f5';

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
  // prosto, bez zaufania do X-Forwarded-For (można rozszerzyć później)
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
  global $REQUEST_ID, $AUTH_CONTEXT, $ORDER_ID_CLEAN;

  $payload = array_merge([
    'ok' => false,
    'error_code' => $error_code,
    'error_message' => $error_message,
    'request_id' => $REQUEST_ID,
    'server_ts' => now_iso(),
  ], $extra);

  // log
  $ip = get_client_ip();
  $tokenMasked = mask_token((string)($AUTH_CONTEXT['project_token'] ?? ''));
  $orderMasked = (string)($ORDER_ID_CLEAN ?? '');
  log_line(sprintf(
    '[%s] request_id=%s ip=%s status=%d ok=0 code=%s order_id=%s token=%s msg=%s',
    now_iso(),
    $REQUEST_ID,
    $ip,
    $code,
    $error_code,
    $orderMasked,
    $tokenMasked,
    str_replace(["\n", "\r"], [' ', ' '], $error_message)
  ));

  respond_json($code, $payload);
}

/* ==== REQUEST CONTEXT ==== */
$REQUEST_ID = bin2hex(random_bytes(8));
$AUTH_CONTEXT = ['mode' => 'none', 'project_token' => ''];
$ORDER_ID_CLEAN = '';

/**
 * Token extraction:
 * - X-Project-Token
 * - Authorization: Bearer <token>
 * - GET token
 * - POST project_token
 */
function extract_project_token(): string {
  $t = (string)($_SERVER['HTTP_X_PROJECT_TOKEN'] ?? '');
  $t = trim($t);
  if ($t !== '') return $t;

  $auth = trim((string)($_SERVER['HTTP_AUTHORIZATION'] ?? ''));
  if ($auth !== '') {
    // Bearer <token>
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
  $projectToken = extract_project_token();

  if ($projectToken !== '') {
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

  // legacy upload token (awaryjnie)
  $legacy = (string)($_SERVER['HTTP_X_UPLOAD_TOKEN'] ?? ($_POST['token'] ?? ''));
  $legacy = trim($legacy);
  if ($legacy !== '' && hash_equals(LEGACY_UPLOAD_TOKEN, $legacy)) {
    return ['mode' => 'legacy', 'project_token' => ''];
  }

  fail(401, 'UNAUTHORIZED', 'Unauthorized');
}

/* ==== AUTH ==== */
$AUTH_CONTEXT = authorize();

/* ==== ŚCIEŻKI ==== */
$baseDir = realpath(__DIR__ . '/..');
if ($baseDir === false) {
  fail(500, 'SERVER_MISCONFIG', 'Server misconfig: base dir not found');
}

$uploadDir = $baseDir . DIRECTORY_SEPARATOR . 'uploads';
ensure_dir($uploadDir, 0755);

/* ==== HELPERS ==== */
function mb_substr_safe(string $s, int $start, int $len): string {
  if (function_exists('mb_substr')) return (string)mb_substr($s, $start, $len, 'UTF-8');
  return substr($s, $start, $len);
}

function clean_id(string $raw): string {
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
  $s = mb_substr_safe($s, 0, 32);

  return $s;
}

function random_suffix(int $len): string {
  $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ234567';
  $out = '';
  $max = strlen($alphabet) - 1;
  for ($i = 0; $i < $len; $i++) $out .= $alphabet[random_int(0, $max)];
  return $out;
}

function pick_unique_id(string $prefix, string $uploadDir): string {
  for ($i = 0; $i < NAME_TRIES; $i++) {
    $suffix = random_suffix(SHORT_SUFFIX_LEN);
    $id = $prefix !== '' ? ($prefix . '_' . $suffix) : $suffix;

    $png  = $uploadDir . DIRECTORY_SEPARATOR . $id . '.png';
    $jpg  = $uploadDir . DIRECTORY_SEPARATOR . $id . '.jpg';
    $json = $uploadDir . DIRECTORY_SEPARATOR . $id . '.json';

    if (!file_exists($png) && !file_exists($jpg) && !file_exists($json)) return $id;
  }

  $suffix = random_suffix(SHORT_SUFFIX_LEN + 3);
  return $prefix !== '' ? ($prefix . '_' . $suffix) : $suffix;
}

/* ==== ID PLIKU ==== */
$ORDER_ID_CLEAN = clean_id((string)($_POST['order_id'] ?? ''));
$id = pick_unique_id($ORDER_ID_CLEAN, $uploadDir);

/* ==== PLIK OBRAZU ==== */
/**
 * Kompatybilność:
 * - nowy frontend: field "jpg"
 * - stary frontend: field "png"
 */
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

$imageName = $id . '.' . $ext;
$imagePath = $uploadDir . DIRECTORY_SEPARATOR . $imageName;

if (!move_uploaded_file($_FILES[$fileKey]['tmp_name'], $imagePath)) {
  fail(500, 'CANNOT_SAVE_IMAGE', 'Cannot save image');
}

/* ==== JSON (opcjonalny) ==== */
$jsonSaved = false;
$jsonName = $id . '.json';
$jsonPath = $uploadDir . DIRECTORY_SEPARATOR . $jsonName;

$jsonText = $_POST['json'] ?? '';
if (is_string($jsonText) && $jsonText !== '') {
  if (strlen($jsonText) > MAX_JSON_BYTES) {
    // nie wywalamy uploadu obrazu; zwracamy ostrzeżenie (MVP)
    // możesz zmienić na fail(413, ...) jeśli wolisz twardo blokować
  } else {
    @file_put_contents($jsonPath, $jsonText);
    $jsonSaved = true;
  }
} elseif (isset($_FILES['json_file']) && is_uploaded_file($_FILES['json_file']['tmp_name'])) {
  $js = (int)($_FILES['json_file']['size'] ?? 0);
  if ($js <= MAX_JSON_BYTES) {
    @move_uploaded_file($_FILES['json_file']['tmp_name'], $jsonPath);
    $jsonSaved = true;
  }
}

/* ==== OK RESPONSE ==== */
$baseUrl = 'https://puzzla.nazwa.pl/puzzla/projekt-podkladek/uploads/';

$ip = get_client_ip();
$tokenMasked = mask_token((string)($AUTH_CONTEXT['project_token'] ?? ''));
log_line(sprintf(
  '[%s] request_id=%s ip=%s status=200 ok=1 mode=%s order_id=%s token=%s file=%s bytes=%d mime=%s json=%s',
  now_iso(),
  $REQUEST_ID,
  $ip,
  (string)($AUTH_CONTEXT['mode'] ?? ''),
  (string)$ORDER_ID_CLEAN,
  $tokenMasked,
  $imageName,
  $size,
  $mime,
  $jsonSaved ? '1' : '0'
));

respond_json(200, [
  'ok' => true,
  'auth_mode' => $AUTH_CONTEXT['mode'],
  'id' => $id,
  'image_url' => $baseUrl . $imageName,
  'json_url' => $jsonSaved ? ($baseUrl . $jsonName) : null,
  'request_id' => $REQUEST_ID,
  'server_ts' => now_iso(),
]);

/* === KONIEC PLIKU — api/upload.php | FILE_VERSION: 2026-02-11-02 === */
