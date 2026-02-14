<?php
/**
 * PROJECT: Web Editor – Product Designer
 * FILE: api/project.php
 * ROLE: Product configuration endpoint (token → productConfig)
 * CONTRACT:
 *  - GET /api/project.php?token=... → { ok:true, mode:"production"|"demo", productConfig }
 *  - GET /api/project.php?mode=demo → { ok:true, mode:"demo", productConfig } (wymuszenie demo, nawet jeśli ktoś dopnie token)
 * SECURITY:
 *  - no-store headers
 *  - token is treated as bearer; validated against server-side map
 * VERSION: 2026-02-14-02
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

function respond(array $payload, int $code = 200): void {
  http_response_code($code);
  echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  exit;
}

$token = trim((string)($_GET['token'] ?? ''));
$modeParam = strtolower(trim((string)($_GET['mode'] ?? '')));

/**
 * DEMO (wymuszone): upload OFF, bezpieczny podgląd.
 * Uwaga: to jest "bezpiecznik" — jeśli ktoś dopnie token do linku demo,
 * nadal zostaje demo.
 */
if ($modeParam === 'demo') {
  respond([
    'ok' => true,
    'mode' => 'demo',
    'productConfig' => [
      'schema_version' => 1,
      'ui' => [
        'title' => 'Edytor (tryb demo)',
        'subtitle' => 'Tryb demonstracyjny — zapis projektu wyłączony.',
      ],
      'product' => null,
      'render' => [
        'canvas_px' => 1181,
        'cut_ratio' => 0.90,
        'print_dpi' => 300,
      ],
      'assets' => [
        'masks' => [
          'square' => '',
          'circle' => '',
        ],
        'templates' => [
          'list_urls' => [
            '/api/templates.php',
            '/assets/templates/list.json',
            '/assets/templates/index.json',
          ],
          'folder_base' => '/assets/templates/coasters/',
        ],
      ],
      'api' => [
        'project_url' => '/api/project.php',
        'upload_url' => '', // brak w demo
      ],
    ],
  ]);
}

$map = require __DIR__ . '/project.config.php';

if ($token === '' || !isset($map[$token]) || !is_array($map[$token])) {
  // DEMO (fallback): bezpiecznie — brak/nieznany token => bez wysyłki
  respond([
    'ok' => true,
    'mode' => 'demo',
    'productConfig' => [
      'schema_version' => 1,
      'ui' => [
        'title' => 'Edytor (tryb demo)',
        'subtitle' => 'Brak/nieznany token — wybierz produkt w trybie demo.',
      ],
      'product' => null,
      'render' => [
        'canvas_px' => 1181,
        'cut_ratio' => 0.90,
        'print_dpi' => 300,
      ],
      'assets' => [
        'masks' => [
          'square' => '',
          'circle' => '',
        ],
        'templates' => [
          'list_urls' => [
            '/api/templates.php',
            '/assets/templates/list.json',
            '/assets/templates/index.json',
          ],
          'folder_base' => '/assets/templates/coasters/',
        ],
      ],
      'api' => [
        'project_url' => '/api/project.php',
        'upload_url' => '', // brak w demo/fallback
      ],
    ],
  ]);
}

$cfg = $map[$token];

// allow extensibility: product/ui/render/assets/api overrides
$product = $cfg['product'] ?? [];
$ui = $cfg['ui'] ?? [];
$render = $cfg['render'] ?? [];
$assets = $cfg['assets'] ?? [];
$api = $cfg['api'] ?? [];

$productConfig = [
  'schema_version' => 1,
  'ui' => [
    'title' => (string)($ui['title'] ?? ($product['name'] ?? 'Edytor produktu')),
    'subtitle' => (string)($ui['subtitle'] ?? ''),
  ],
  'product' => [
    'type' => (string)($product['type'] ?? 'coaster'),
    'name' => (string)($product['name'] ?? ''),
    'size_mm' => [
      'w' => (int)($product['size_mm']['w'] ?? 100),
      'h' => (int)($product['size_mm']['h'] ?? 100),
    ],
    'corner_radius_mm' => (int)($product['corner_radius_mm'] ?? 5),
    'shape_default' => (string)($product['shape_default'] ?? ($product['shape'] ?? 'square')),
    'shape_options' => $product['shape_options'] ?? ['square','circle'],
    'dpi' => (int)($product['dpi'] ?? 300),
  ],
  'render' => [
    'canvas_px' => (int)($render['canvas_px'] ?? 1181),
    'cut_ratio' => (float)($render['cut_ratio'] ?? 0.90),
    'print_dpi' => (int)($render['print_dpi'] ?? ($product['dpi'] ?? 300)),
  ],
  'assets' => [
    'masks' => [
      'square' => (string)($assets['masks']['square'] ?? '/editor/assets/masks/mask_square.png'),
      'circle' => (string)($assets['masks']['circle'] ?? '/editor/assets/masks/mask_circle.png'),
    ],
    'templates' => [
      'list_urls' => $assets['templates']['list_urls'] ?? [
        '/api/templates.php',
        '/assets/templates/list.json',
        '/assets/templates/index.json',
      ],
      'folder_base' => (string)($assets['templates']['folder_base'] ?? '/assets/templates/coasters/'),
    ],
  ],
  'api' => [
    'project_url' => (string)($api['project_url'] ?? '/api/project.php'),
    'upload_url' => (string)($api['upload_url'] ?? '/api/upload.php'),
  ],
];

respond([
  'ok' => true,
  'mode' => 'production',
  'productConfig' => $productConfig,
]);

/* === KONIEC PLIKU — api/project.php | FILE_VERSION: 2026-02-14-02 === */
