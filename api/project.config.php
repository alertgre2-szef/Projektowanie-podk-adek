<?php
/**
 * PROJECT: Web Editor – Product Designer
 * FILE: api/project.config.php
 * ROLE: Static product configuration map
 * SECURITY: No external input execution
 * VERSION: 2026-02-10-01
 */

declare(strict_types=1);

/**
 * Token → konfiguracja produktu
 * W przyszłości panel admin będzie to generował.
 */

return [

  // demo token produkcyjny
  'demo-token-123' => [
    'product' => [
      'type' => 'coaster',
      'name' => 'Podkładka 10×10',
      'size_mm' => ['w' => 100, 'h' => 100],
      'shape' => 'square',
      'dpi' => 300,
    ]
  ],

];
