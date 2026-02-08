<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

$base = realpath(__DIR__ . '/../assets/templates/coasters');
if ($base === false || !is_dir($base)) {
  echo json_encode(['coasters' => []]);
  exit;
}

$out = [];

$dirs = scandir($base);
foreach ($dirs as $d) {
  if ($d === '.' || $d === '..') continue;

  $path = $base . DIRECTORY_SEPARATOR . $d;
  if (!is_dir($path)) continue;

  $thumb = $path . '/thumb.webp';
  $edit  = $path . '/edit.png';
  $print = $path . '/print.png';

  if (file_exists($thumb) && file_exists($edit) && file_exists($print)) {
    $out[] = [
      'id' => $d,
      'title' => $d
    ];
  }
}

echo json_encode(['coasters' => $out]);

// === KONIEC KODU — templates.php ===
