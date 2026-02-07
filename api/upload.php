<?php
declare(strict_types=1);

// === USTAWIENIA ===
const UPLOAD_TOKEN = '4f9c7d2a8e1b5f63c0a9e72d41f8b6c39e5a0d7f1b2c8e4a6d9f3c1b7e0a2f5';
const MAX_PNG_BYTES  = 25_000_000; // 25 MB
const MAX_JSON_BYTES = 2_000_000;  // 2 MB

header('Content-Type: application/json; charset=utf-8');

// Prosty auth token (żeby każdy z internetu nie spamował uploadem)
$token = $_SERVER['HTTP_X_UPLOAD_TOKEN'] ?? ($_POST['token'] ?? '');
if (!$token || !hash_equals(UPLOAD_TOKEN, $token)) {
  http_response_code(401);
  echo json_encode(['ok' => false, 'error' => 'Unauthorized']);
  exit;
}

// Docelowy katalog
$baseDir = realpath(__DIR__ . '/..');
if ($baseDir === false) {
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => 'Server misconfig']);
  exit;
}

$uploadDir = $baseDir . DIRECTORY_SEPARATOR . 'uploads';
if (!is_dir($uploadDir)) {
  if (!mkdir($uploadDir, 0755, true)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Cannot create uploads dir']);
    exit;
  }
}

// Id pliku (czas + losowo)
$ts = (new DateTime('now', new DateTimeZone('Europe/Warsaw')))->format('Ymd_His');
$rand = bin2hex(random_bytes(6));
$id = $ts . '_' . $rand;

$orderId = preg_replace('~[^a-zA-Z0-9_-]~', '', (string)($_POST['order_id'] ?? ''));
if ($orderId !== '') $id = $orderId . '__' . $id;

// Oczekujemy pliku png w polu "png"
if (!isset($_FILES['png']) || !is_uploaded_file($_FILES['png']['tmp_name'])) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'Missing png file']);
  exit;
}

if ($_FILES['png']['size'] > MAX_PNG_BYTES) {
  http_response_code(413);
  echo json_encode(['ok' => false, 'error' => 'PNG too large']);
  exit;
}

// Sprawdzenie MIME (podstawowe)
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = $finfo->file($_FILES['png']['tmp_name']) ?: '';
if ($mime !== 'image/png') {
  http_response_code(415);
  echo json_encode(['ok' => false, 'error' => 'Only PNG allowed']);
  exit;
}

$pngName = $id . '.png';
$pngPath = $uploadDir . DIRECTORY_SEPARATOR . $pngName;

if (!move_uploaded_file($_FILES['png']['tmp_name'], $pngPath)) {
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => 'Cannot save PNG']);
  exit;
}

// Opcjonalny JSON (pole "json" jako tekst albo plik "json_file")
$jsonSaved = false;
$jsonName = $id . '.json';
$jsonPath = $uploadDir . DIRECTORY_SEPARATOR . $jsonName;

$jsonText = $_POST['json'] ?? '';
if (is_string($jsonText) && $jsonText !== '') {
  if (strlen($jsonText) > MAX_JSON_BYTES) {
    // nie przerywamy - PNG już jest, tylko info
  } else {
    file_put_contents($jsonPath, $jsonText);
    $jsonSaved = true;
  }
} elseif (isset($_FILES['json_file']) && is_uploaded_file($_FILES['json_file']['tmp_name'])) {
  if ($_FILES['json_file']['size'] <= MAX_JSON_BYTES) {
    move_uploaded_file($_FILES['json_file']['tmp_name'], $jsonPath);
    $jsonSaved = true;
  }
}

$baseUrl = 'https://puzzla.nazwa.pl/puzzla/projekt-podkladek/uploads/';

echo json_encode([
  'ok' => true,
  'id' => $id,
  'png_url' => $baseUrl . $pngName,
  'json_url' => $jsonSaved ? ($baseUrl . $jsonName) : null,
]);
