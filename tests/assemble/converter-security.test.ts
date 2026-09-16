import { describe, it, expect } from 'vitest';
import { FormatConverter } from '../../src/assemble/converter.js';
import { validateShellSafe } from '../../src/utils/paths.js';

describe('FormatConverter — shell safety', () => {
  const converter = new FormatConverter();

  describe('generateConversionCommand', () => {
    it('returns args array with input and output paths', () => {
      const args = converter.generateConversionCommand(
        '/tmp/input.md',
        '/tmp/output.docx',
        'docx',
      );

      expect(Array.isArray(args)).toBe(true);
      expect(args).toContain('/tmp/input.md');
      expect(args).toContain('/tmp/output.docx');
      expect(args).toContain('-t');
      expect(args).toContain('docx');
    });

    it('includes --toc when toc option is true', () => {
      const args = converter.generateConversionCommand(
        '/tmp/input.md',
        '/tmp/output.docx',
        'docx',
        { toc: true },
      );

      expect(args).toContain('--toc');
    });

    it('includes --reference-doc when specified', () => {
      const args = converter.generateConversionCommand(
        '/tmp/input.md',
        '/tmp/output.docx',
        'docx',
        { referenceDoc: '/tmp/template.docx' },
      );

      const refArg = args.find(a => a.startsWith('--reference-doc'));
      expect(refArg).toBeDefined();
      expect(refArg).toContain('/tmp/template.docx');
    });
  });

  describe('validateShellSafe', () => {
    it('accepts normal paths', () => {
      expect(() => validateShellSafe('/tmp/input.md')).not.toThrow();
      expect(() => validateShellSafe('C:\\Users\\test\\doc.md')).not.toThrow();
      expect(() => validateShellSafe('./relative/path.md')).not.toThrow();
    });

    it('rejects paths with shell metacharacters', () => {
      expect(() => validateShellSafe('/tmp/file;rm -rf /')).toThrow();
      expect(() => validateShellSafe('/tmp/file|cat /etc/passwd')).toThrow();
      expect(() => validateShellSafe('/tmp/file$(whoami)')).toThrow();
      expect(() => validateShellSafe('/tmp/file`id`')).toThrow();
      expect(() => validateShellSafe('/tmp/file&background')).toThrow();
    });

    it('rejects paths with newlines', () => {
      expect(() => validateShellSafe('/tmp/file\ninjected')).toThrow();
    });

    it('accepts paths with spaces (common in Windows)', () => {
      expect(() => validateShellSafe('C:\\Program Files\\doc.md')).not.toThrow();
    });

    it('accepts paths with Chinese characters', () => {
      expect(() => validateShellSafe('/tmp/文档/测试.md')).not.toThrow();
    });
  });
});
