<?php
declare(strict_types=1);

// === USTAWIENIA ===
const UPLOAD_TOKEN = '4f9c7d2a8e1b5f63c0a9e72d41f8b6c39e5a0d7f1b2c8e4a6d9f3c1b7e0a2f5';

const MAX_IMAGE_BYTES = 25_000_000; // 25 MB
const MAX_JSON_BYTES  = 2_000_000;  // 2 MB

// Długość krótkiego sufiksu (dla łatwej pracy w PS)
const SHORT_SUFFIX_LEN = 5;
// Ile prób na uniknięcie kolizji nazwy
const NAME_TRIES = 20;

header('Content-Type: application/json; charset=utf-8');

// === AUTH TOKEN ===
$token = $_SERVER['HTTP_X_UPLOAD_TOKEN'] ?? ($_POST['token'] ?? '');
if (!$token || !hash_equals(UPLOAD_TOKEN, $token)) {
  http_response_code(401);
  echo json_encode(['ok' => false, 'error' => 'Unauthorized']);
  exit;
}

// === ŚCIEŻKI ===
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

// === HELPERS ===
function clean_id(string $raw): string {
  $s = preg_replace('~[^a-zA-Z0-9_-]~', '', $raw) ?? '';
  // opcjonalnie: skróć też orderId, żeby nie robił kilometrowych nazw
  return substr($s, 0, 32);
}

function random_suffix(int $len): string {
  // Base32 bez mylących znaków: A-Z + 2-7 (łatwe do dyktowania i krótkie)
  $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ234567'; // bez I O 0 1
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

    // sprawdzamy kolizję dla png/jpg + json
    $png = $uploadDir . DIRECTORY_SEPARATOR . $id . '.png';
    $jpg = $uploadDir . DIRECTORY_SEPARATOR . $id . '.jpg';
    $json = $uploadDir . DIRECTORY_SEPARATOR . $id . '.json';

    if (!file_exists($png) && !file_exists($jpg) && !file_exists($json)) {
      return $id;
    }
  }

  // awaryjnie, jakby ktoś masowo spamował — dodajemy dłuższy suffix
  $suffix = random_suffix(SHORT_SUFFIX_LEN + 3);
  return $prefix !== '' ? ($prefix . '_' . $suffix) : $suffix;
}

// === ID PLIKU (krótko) ===
$orderId = clean_id((string)($_POST['order_id'] ?? ''));

// prefix = orderId jeśli jest, inaczej pusty
$id = pick_unique_id($orderId, $uploadDir);

// === PLIK OBRAZU (pole "png" zostawione dla kompatybilności) ===
if (!isset($_FILES['png']) || !is_uploaded_file($_FILES['png']['tmp_name'])) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'Missing image file']);
  exit;
}

if ($_FILES['png']['size'] > MAX_IMAGE_BYTES) {
  http_response_code(413);
  echo json_encode(['ok' => false, 'error' => 'Image too large']);
  exit;
}

// === MIME CHECK ===
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = $finfo->file($_FILES['png']['tmp_name']) ?: '';

$ext = null;
if ($mime === 'image/png') {
  $ext = 'png';
} elseif ($mime === 'image/jpeg') {
  $ext = 'jpg';
} else {
  http_response_code(415);
  echo json_encode([
    'ok' => false,
    'error' => 'Only PNG or JPG allowed',
    'mime' => $mime
  ]);
  exit;
}

$imageName = $id . '.' . $ext;
$imagePath = $uploadDir . DIRECTORY_SEPARATOR . $imageName;

if (!move_uploaded_file($_FILES['png']['tmp_name'], $imagePath)) {
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => 'Cannot save image']);
  exit;
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
} elseif (isset($_FILES['json_file']) && is_uploaded_file($_FILES['json_file']['tmp_name'])) {
  if ($_FILES['json_file']['size'] <= MAX_JSON_BYTES) {
    move_uploaded_file($_FILES['json_file']['tmp_name'], $jsonPath);
    $jsonSaved = true;
  }
}

// === ODPOWIEDŹ ===
$baseUrl = 'https://puzzla.nazwa.pl/puzzla/projekt-podkladek/uploads/';

echo json_encode([
  'ok' => true,
  'id' => $id,
  'image_url' => $baseUrl . $imageName,
  'json_url' => $jsonSaved ? ($baseUrl . $jsonName) : null,
]);

// === KONIEC KODU — upload.php ===
