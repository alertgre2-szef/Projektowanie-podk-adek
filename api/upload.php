<?php
declare(strict_types=1);

/**
 * PROJECT: Web Editor – Product Designer
 * FILE: api/upload.php
 * ROLE: Production upload endpoint (image + json)
 * CONTRACT:
 *  - POST multipart:
 *     - image field: "png" or "jpg" (JPEG/PNG accepted)
 *     - json field: "json" (optional)
 *     - order_id: "order_id" (optional)
 *  - AUTH:
 *     - preferred: header X-Project-Token (validated against api/project.config.php keys)
 *     - legacy: header X-Upload-Token (optional)
 * SECURITY:
 *  - size limits
 *  - finfo MIME validation
 *  - safe filenames + random suffix
 * VERSION: 2026-02-10-02
 */

// === LEGACY OPTIONAL TOKEN (can be removed later) ===
const UPLOAD_TOKEN = '4f9c7d2a8e1b5f63c0a9e72d41f8b6c39e5a0d7f1b2c8e4a6d9f3c1b7e0a2f5';

const MAX_IMAGE_BYTES = 25_000_000; // 25 MB
const MAX_JSON_BYTES  = 2_000_000;  // 2 MB

const SHORT_SUFFIX_LEN = 5;
const NAME_TRIES = 20;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

function fail(int $code, string $msg, array $extra = []): void {
  http_response_code($code);
  echo json_encode(array_merge(['ok' => false, 'error' => $msg], $extra), JSON_UNESCAPED_UNICODE);
  exit;
}

// === AUTH (preferred: X-Project-Token) ===
$projectToken = trim((string)($_SERVER['HTTP_X_PROJECT_TOKEN'] ?? ''));

$authorized = false;

// 1) project-token against config keys
if ($projectToken !== '') {
  $map = require __DIR__ . '/project.config.php';
  if (is_array($map) && isset($map[$projectToken])) {
    $authorized = true;
  }
}

// 2) legacy upload token (optional compatibility)
if (!$authorized) {
  $legacy = (string)($_SERVER['HTTP_X_UPLOAD_TOKEN'] ?? ($_POST['token'] ?? ''));
  if ($legacy && hash_equals(UPLOAD_TOKEN, $legacy)) {
    $authorized = true;
  }
}

if (!$authorized) {
  fail(401, 'Unauthorized');
}

// === PATHS ===
$baseDir = realpath(__DIR__ . '/..');
if ($baseDir === false) fail(500, 'Server misconfig');

$uploadDir = $baseDir . DIRECTORY_SEPARATOR . 'uploads';
if (!is_dir($uploadDir)) {
  if (!mkdir($uploadDir, 0755, true)) fail(500, 'Cannot create uploads dir');
}

// === HELPERS ===
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
  for ($i = 0; $i < $len; $i++) {
    $out .= $alphabet[random_int(0, $max)];
  }
  return $out;
}

function pick_unique_id(string $prefix, string $uploadDir): string {
  for ($i = 0; $i < NAME_TRIES; $i++) {
    $suffix = random_suffix(SHORT_SUFFIX_LEN);
    $id = $prefix !== '' ? ($prefix . '_' . $suffix) : $suffix;

    $png = $uploadDir . DIRECTORY_SEPARATOR . $id . '.png';
    $jpg = $uploadDir . DIRECTORY_SEPARATOR . $id . '.jpg';
    $json = $uploadDir . DIRECTORY_SEPARATOR . $id . '.json';

    if (!file_exists($png) && !file_exists($jpg) && !file_exists($json)) {
      return $id;
    }
  }

  $suffix = random_suffix(SHORT_SUFFIX_LEN + 3);
  return $prefix !== '' ? ($prefix . '_' . $suffix) : $suffix;
}

// === IMAGE FILE KEY: accept "png" OR "jpg" ===
$fileKey = null;
if (isset($_FILES['png']) && is_uploaded_file($_FILES['png']['tmp_name'])) $fileKey = 'png';
if ($fileKey === null && isset($_FILES['jpg']) && is_uploaded_file($_FILES['jpg']['tmp_name'])) $fileKey = 'jpg';
if ($fileKey === null) fail(400, 'Missing image file');

if ($_FILES[$fileKey]['size'] > MAX_IMAGE_BYTES) fail(413, 'Image too large');

// === MIME CHECK ===
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = $finfo->file($_FILES[$fileKey]['tmp_name']) ?: '';

$ext = null;
if ($mime === 'image/png') $ext = 'png';
elseif ($mime === 'image/jpeg') $ext = 'jpg';
else fail(415, 'Only PNG or JPG allowed', ['mime' => $mime]);

// === ID ===
$orderId = clean_id((string)($_POST['order_id'] ?? ''));
$id = pick_unique_id($orderId, $uploadDir);

$imageName = $id . '.' . $ext;
$imagePath = $uploadDir . DIRECTORY_SEPARATOR . $imageName;

if (!move_uploaded_file($_FILES[$fileKey]['tmp_name'], $imagePath)) {
  fail(500, 'Cannot save image');
}

// === JSON (opcjonalny) ===
$jsonSaved = false;
$jsonName = $id . '.json';
$jsonPath = $uploadDir . DIRECTORY_SEPARATOR . $jsonName;

$jsonText = $_POST['json'] ?? '';
if (is_string($jsonText) && $jsonText !== '') {
  if (strlen($jsonText) <= MAX_JSON_BYTES) {
    file_put_contents($jsonPath, $jsonText);
    $jsonSaved = true;
  }
}

// === RESPONSE ===
$baseUrl = 'https://puzzla.nazwa.pl/puzzla/projekt-podkladek/uploads/';

echo json_encode([
  'ok' => true,
  'id' => $id,
  'image_url' => $baseUrl . $imageName,
  'json_url' => $jsonSaved ? ($baseUrl . $jsonName) : null,
], JSON_UNESCAPED_UNICODE);

/* === KONIEC PLIKU — api/upload.php | FILE_VERSION: 2026-02-10-02 === */
