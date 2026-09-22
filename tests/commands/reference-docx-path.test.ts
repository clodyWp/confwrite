import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Reference DOCX Path Resolution', () => {
  it('should resolve correct path from dist/commands/export.js', () => {
    const compiledFilePath = 'file:///home/water/Projects/confidenceWriter/dist/commands/export.js';
    const referenceDocPath = new URL('../../templates/reference.docx', compiledFilePath).pathname;
    
    expect(referenceDocPath).toBe('/home/water/Projects/confidenceWriter/templates/reference.docx');
    expect(existsSync(referenceDocPath)).toBe(true);
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
