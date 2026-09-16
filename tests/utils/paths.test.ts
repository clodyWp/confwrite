import { describe, it, expect } from 'vitest';
import { safePath, validateSlug, validateChapterId, normalizePath, isWithinPath } from '../../src/utils/paths.js';

describe('validateSlug', () => {
  it('accepts valid slugs', () => {
    expect(() => validateSlug('my-project')).not.toThrow();
    expect(() => validateSlug('project123')).not.toThrow();
    expect(() => validateSlug('a')).not.toThrow();
    expect(() => validateSlug('abc-def-ghi')).not.toThrow();
  });

  it('rejects empty slug', () => {
    expect(() => validateSlug('')).toThrow('cannot be empty');
  });

  it('rejects path traversal', () => {
    expect(() => validateSlug('../etc')).toThrow('path separators');
    expect(() => validateSlug('foo/bar')).toThrow('path separators');
    expect(() => validateSlug('foo\\bar')).toThrow('path separators');
  });

  it('rejects invalid characters', () => {
    expect(() => validateSlug('my_project')).toThrow('alphanumeric');
    expect(() => validateSlug('my project')).toThrow('alphanumeric');
    expect(() => validateSlug('-leading')).toThrow('alphanumeric');
    expect(() => validateSlug('trailing-')).toThrow('alphanumeric');
  });

  it('rejects too long slug', () => {
    const longSlug = 'a'.repeat(101);
    expect(() => validateSlug(longSlug)).toThrow('too long');
  });
});

describe('validateChapterId', () => {
  it('accepts valid chapter IDs', () => {
    expect(() => validateChapterId('ch001')).not.toThrow();
    expect(() => validateChapterId('ch42')).not.toThrow();
    expect(() => validateChapterId('ch100')).not.toThrow();
  });

  it('rejects invalid chapter IDs', () => {
    expect(() => validateChapterId('chapter1')).toThrow('must match pattern');
    expect(() => validateChapterId('001')).toThrow('must match pattern');
    expect(() => validateChapterId('ch')).toThrow('must match pattern');
    expect(() => validateChapterId('')).toThrow('must match pattern');
  });
});

describe('safePath', () => {
  it('allows paths within base', () => {
    const result = safePath('/project', 'inputs/file.md');
    expect(result).toMatch(/inputs[/\\]file\.md$/);
  });

  it('rejects path traversal', () => {
    expect(() => safePath('/project', '../etc/passwd')).toThrow('traversal');
    expect(() => safePath('/project', 'foo/../../etc')).toThrow('traversal');
  });

  it('handles absolute paths within base', () => {
    const result = safePath('/project', '/project/inputs/file.md');
    expect(result).toMatch(/inputs[/\\]file\.md$/);
  });

  it('rejects absolute paths outside base', () => {
    expect(() => safePath('/project', '/etc/passwd')).toThrow('traversal');
  });
});

describe('normalizePath', () => {
  it('converts backslashes to forward slashes', () => {
    expect(normalizePath('foo\\bar\\baz')).toBe('foo/bar/baz');
  });

  it('preserves forward slashes', () => {
    expect(normalizePath('foo/bar/baz')).toBe('foo/bar/baz');
  });
});

describe('isWithinPath', () => {
  it('returns true for child paths', () => {
    expect(isWithinPath('/project/inputs/file.md', '/project')).toBe(true);
  });

  it('returns false for paths outside', () => {
    expect(isWithinPath('/etc/passwd', '/project')).toBe(false);
  });

  it('returns true for same path', () => {
    expect(isWithinPath('/project', '/project')).toBe(true);
  });
});
