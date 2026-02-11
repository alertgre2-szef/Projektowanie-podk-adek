<?php
/**
 * PROJECT: Web Editor – Product Designer
 * FILE: api/project.config.php
 * ROLE: Static product configuration map
 * SECURITY: No external input execution
 * VERSION: 2026-02-11-01
 */

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Token → konfiguracja produktu
|--------------------------------------------------------------------------
| Każdy token reprezentuje osobny projekt / produkt.
| W przyszłości będzie generowane z panelu admin.
*/

return [

  /*
  |--------------------------------------------------------------------------
  | TEST TOKEN — używany przez edytor lokalny/dev
  |--------------------------------------------------------------------------
  */
  'TEST123' => [
    'ui' => [
      'title' => 'Edytor podkładek',
      'subtitle' => 'Tryb testowy — TEST123',
    ],

    'product' => [
      'type' => 'coaster',
      'name' => 'Podkładka 10×10',
      'size_mm' => [
        'w' => 100,
        'h' => 100,
      ],
      'corner_radius_mm' => 5,
      'shape_default' => 'square',
      'shape_options' => ['square', 'circle'],
      'dpi' => 300,
    ],

    'render' => [
      'canvas_px' => 1181,
      'cut_ratio' => 0.90,
      'print_dpi' => 300,
    ],

    'assets' => [
      'masks' => [
        'square' => '/editor/assets/masks/mask_square.png',
        'circle' => '/editor/assets/masks/mask_circle.png',
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
      'upload_url' => '/api/upload.php',
    ],
  ],

  /*
  |--------------------------------------------------------------------------
  | DEMO TOKEN — przykład produkcyjny
  |--------------------------------------------------------------------------
  */
  'demo-token-123' => [
    'product' => [
      'type' => 'coaster',
      'name' => 'Podkładka 10×10',
      'size_mm' => ['w' => 100, 'h' => 100],
      'shape' => 'square',
      'dpi' => 300,
    ],
  ],

];

/* === KONIEC PLIKU — api/project.config.php | FILE_VERSION: 2026-02-11-01 === */
