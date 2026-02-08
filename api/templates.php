<?php
declare(strict_types=1);

/**
 * api/templates.php
 * Auto-index katalogów:
 * assets/templates/coasters/<id>/thumb.webp, edit.png, print.png
 *
 * Zwraca format zgodny z editor.js:
 * { ok: true, coasters: [ { id, title? } ... ] }
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

function json_fail(int $code, string $msg): void {
  http_response_code($code);
  echo json_encode(['ok' => false, 'error' => $msg], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  exit;
}

$root = dirname(__DIR__); // .../editor
$base = $root . '/assets/templates/coasters';
$realBase = realpath($base);

if ($realBase === false) json_fail(500, 'Templates base directory not found');
if (!is_dir($realBase) || !is_readable($realBase)) json_fail(500, 'Templates base directory is not readable');

$coasters = [];

$dh = opendir($realBase);
if ($dh === false) json_fail(500, 'Failed to open templates directory');

while (($entry = readdir($dh)) !== false) {
  if ($entry === '.' || $entry === '..') continue;

  // Bezpieczne nazwy folderów
  if (!preg_match('/^[a-zA-Z0-9_-]+$/', $entry)) continue;

  $dir = $realBase . DIRECTORY_SEPARATOR . $entry;
  if (!is_dir($dir)) continue;

  $realDir = realpath($dir);
  if ($realDir === false) continue;
  if (strpos($realDir, $realBase) !== 0) continue;

  $thumb = $realDir . '/thumb.webp';
  $edit  = $realDir . '/edit.png';
  $print = $realDir . '/print.png';

  // wymagamy kompletnego zestawu plików
  if (!is_file($thumb) || !is_readable($thumb)) continue;
  if (!is_file($edit)  || !is_readable($edit))  continue;
  if (!is_file($print) || !is_readable($print)) continue;

  // Opcjonalnie: meta.json z tytułem (np. { "title": "..." } albo { "name": "..." })
  $title = null;
  $metaPath = $realDir . '/meta.json';
  if (is_file($metaPath) && is_readable($metaPath)) {
    $raw = file_get_contents($metaPath);
    if ($raw !== false) {
      $decoded = json_decode($raw, true);
      if (is_array($decoded)) {
        if (isset($decoded['title']) && is_string($decoded['title'])) $title = trim($decoded['title']);
        else if (isset($decoded['name']) && is_string($decoded['name'])) $title = trim($decoded['name']);
      }
    }
  }

  $row = ['id' => $entry];
  if ($title) $row['title'] = $title;

  $coasters[] = $row;
}
closedir($dh);

// Stabilne sortowanie po id
usort($coasters, fn($a, $b) => strcmp((string)$a['id'], (string)$b['id']));

echo json_encode([
  'ok' => true,
  'source' => 'api/templates.php',
  'count' => count($coasters),
  'coasters' => $coasters
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

// === KONIEC KODU — templates.php ===
