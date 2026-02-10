<?php
/**
 * PROJECT: Web Editor – Product Designer
 * FILE: api/project.php
 * ROLE: Product configuration endpoint
 * CONTRACT: editor → GET → config
 * SECURITY: token validation + read-only config
 * VERSION: 2026-02-10-01
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

function fail(int $code, string $msg): void {
  http_response_code($code);
  echo json_encode(['ok' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
  exit;
}

$config = require __DIR__ . '/project.config.php';

$token = trim($_GET['token'] ?? '');

if ($token === '' || !isset($config[$token])) {
  echo json_encode([
    'ok' => true,
    'mode' => 'fallback',
    'product' => null,
    'templates_endpoint' => '/api/templates.php',
    'upload_endpoint' => null,
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

$product = $config[$token]['product'];

echo json_encode([
  'ok' => true,
  'mode' => 'production',
  'product' => $product,
  'templates_endpoint' => '/api/templates.php',
  'upload_endpoint' => '/api/upload.php',
], JSON_UNESCAPED_UNICODE);
