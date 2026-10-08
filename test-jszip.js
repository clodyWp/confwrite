try {
  const jszip = require('jszip');
  console.log('✓ jszip loaded OK');
  console.log('  version:', jszip.version || 'unknown');
} catch (err) {
  console.error('✗ jszip load failed:', err.message);
  process.exit(1);
}
