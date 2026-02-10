<?php
declare(strict_types=1);

/**
 * api/upload.php
 * FILE_VERSION: 2026-02-10-04
 *
 * Kanałowo-neutralna autoryzacja:
 *  - preferowane: X-Project-Token (token z URL edytora, weryfikowany po stronie serwera)
 *  - opcjonalnie legacy: X-Upload-Token (stały sekret) lub POST token=
 *
 * Wejście:
 *  - plik obrazu: pole "jpg" lub "png" (kompatybilność)
 *  - json: pole POST "json" lub plik "json_file"
 *  - order_id: POST "order_id" (opcjonalnie)
 *
 * Wyjście:
 *  { ok:true, id, image_url, json_url }
 */

// === USTAWIENIA ===
const LEGACY_UPLOAD_TOKEN = '4f9c7d2a8e1b5f63c0a9e72d41f8b6c39e5a0d7f1b2c8e4a6d9f3c1b7e0a2f5';

const MAX_IMAGE_BYTES = 25_000_000; // 25 MB
const MAX_JSON_BYTES  = 2_000_000;  // 2 MB

const SHORT_SUFFIX_LEN = 5;
const NAME_TRIES = 20;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

function json_fail(int $code, string $msg, array $extra = []): void {
  http_response_code($code);
  echo json_encode(array_merge(['ok' => false, 'error' => $msg], $extra), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

/**
 * Autoryzacja:
 * - X-Project-Token: token musi istnieć w api/project.config.php
 * - Legacy: X-Upload-Token lub POST token=
 */
function authorize(): array {
  $projectToken = (string)($_SERVER['HTTP_X_PROJECT_TOKEN'] ?? '');
  if ($projectToken === '') {
    // dopuszczamy też POST project_token (awaryjnie)
    $projectToken = (string)($_POST['project_token'] ?? '');
  }

  if ($projectToken !== '') {
    $cfgPath = __DIR__ . '/project.config.php';
    if (!is_file($cfgPath) || !is_readable($cfgPath)) {
      json_fail(500, 'Server misconfig: project.config.php missing');
    }

    $map = require $cfgPath;
    if (!is_array($map)) {
      json_fail(500, 'Server misconfig: project.config.php must return array');
    }

    if (!array_key_exists($projectToken, $map)) {
      json_fail(401, 'Unauthorized (unknown project token)');
    }

    // token OK
    return ['mode' => 'project', 'project_token' => $projectToken];
  }

  // legacy upload token (jeśli kiedyś potrzebne)
  $legacy = (string)($_SERVER['HTTP_X_UPLOAD_TOKEN'] ?? ($_POST['token'] ?? ''));
  if ($legacy !== '' && hash_equals(LEGACY_UPLOAD_TOKEN, $legacy)) {
    return ['mode' => 'legacy', 'project_token' => ''];
  }

  json_fail(401, 'Unauthorized');
}

/* ==== AUTH ==== */
$auth = authorize();

/* ==== ŚCIEŻKI ==== */
$baseDir = realpath(__DIR__ . '/..');
if ($baseDir === false) json_fail(500, 'Server misconfig');

$uploadDir = $baseDir . DIRECTORY_SEPARATOR . 'uploads';
if (!is_dir($uploadDir)) {
  if (!mkdir($uploadDir, 0755, true)) json_fail(500, 'Cannot create uploads dir');
}

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
$orderId = clean_id((string)($_POST['order_id'] ?? ''));
$id = pick_unique_id($orderId, $uploadDir);

/* ==== PLIK OBRAZU ==== */
/**
 * Kompatybilność:
 * - nowy frontend: field "jpg"
 * - stary frontend: field "png"
 */
$fileKey = null;
if (isset($_FILES['jpg']) && is_uploaded_file($_FILES['jpg']['tmp_name'])) $fileKey = 'jpg';
if ($fileKey === null && isset($_FILES['png']) && is_uploaded_file($_FILES['png']['tmp_name'])) $fileKey = 'png';

if ($fileKey === null) json_fail(400, 'Missing image file (expected field jpg or png)');

if ((int)$_FILES[$fileKey]['size'] > MAX_IMAGE_BYTES) json_fail(413, 'Image too large');

/* ==== MIME CHECK ==== */
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = $finfo->file($_FILES[$fileKey]['tmp_name']) ?: '';

$ext = null;
if ($mime === 'image/png') $ext = 'png';
elseif ($mime === 'image/jpeg' || $mime === 'image/jpg') $ext = 'jpg';
else json_fail(415, 'Only PNG or JPG allowed', ['mime' => $mime]);

$imageName = $id . '.' . $ext;
$imagePath = $uploadDir . DIRECTORY_SEPARATOR . $imageName;

if (!move_uploaded_file($_FILES[$fileKey]['tmp_name'], $imagePath)) json_fail(500, 'Cannot save image');

/* ==== JSON (opcjonalny) ==== */
$jsonSaved = false;
$jsonName = $id . '.json';
$jsonPath = $uploadDir . DIRECTORY_SEPARATOR . $jsonName;

$jsonText = $_POST['json'] ?? '';
if (is_string($jsonText) && $jsonText !== '') {
  if (strlen($jsonText) <= MAX_JSON_BYTES) {
    file_put_contents($jsonPath, $jsonText);
    $jsonSaved = true;
  }
} elseif (isset($_FILES['json_file']) && is_uploaded_file($_FILES['json_file']['tmp_name'])) {
  if ((int)$_FILES['json_file']['size'] <= MAX_JSON_BYTES) {
    move_uploaded_file($_FILES['json_file']['tmp_name'], $jsonPath);
    $jsonSaved = true;
  }
}

/* ==== ODPOWIEDŹ ==== */
$baseUrl = 'https://puzzla.nazwa.pl/puzzla/projekt-podkladek/uploads/';

echo json_encode([
  'ok' => true,
  'auth_mode' => $auth['mode'],
  'id' => $id,
  'image_url' => $baseUrl . $imageName,
  'json_url' => $jsonSaved ? ($baseUrl . $jsonName) : null,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

/* === KONIEC PLIKU — api/upload.php | FILE_VERSION: 2026-02-10-04 === */
