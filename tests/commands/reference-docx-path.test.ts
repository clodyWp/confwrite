import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve, normalize } from 'node:path';
import { platform } from 'node:os';
import { fileURLToPath } from 'node:url';

// fileURLToPath 在 Windows 上不接受 POSIX 风格的 file:// URL
const isWindows = platform() === 'win32';

describe('Reference DOCX Path Resolution', () => {
  (isWindows ? it.skip : it)('should resolve correct path from dist/commands/export.js', () => {
    const compiledFilePath = 'file:///home/water/Projects/confidenceWriter/dist/commands/export.js';
    const referenceDocPath = fileURLToPath(new URL('../../templates/reference.docx', compiledFilePath));
    
    // Use normalize for cross-platform comparison
    expect(normalize(referenceDocPath)).toBe(normalize('/home/water/Projects/confidenceWriter/templates/reference.docx'));
  });

  it('should have templates directory in package files', async () => {
    const packageJson = await import('../../package.json', { with: { type: 'json' } });
    expect(packageJson.default.files).toContain('templates/');
  });

  it('should have reference.docx in templates directory', () => {
    const templatesDir = resolve(process.cwd(), 'templates');
    const referenceDocPath = resolve(templatesDir, 'reference.docx');
    
    expect(existsSync(referenceDocPath)).toBe(true);
  });
});
