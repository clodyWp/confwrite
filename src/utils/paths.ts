/**
 * Path safety utilities
 * 
 * Prevents path traversal attacks and ensures paths stay within
 * expected boundaries.
 */
import { resolve, relative, isAbsolute, normalize } from 'node:path';

/**
 * Validate that a path does not escape a base directory.
 * Returns the resolved absolute path if valid, throws otherwise.
 */
export function safePath(basePath: string, userPath: string): string {
  const resolvedBase = resolve(basePath);
  const resolvedPath = isAbsolute(userPath)
    ? resolve(userPath)
    : resolve(resolvedBase, userPath);

  const rel = relative(resolvedBase, resolvedPath);

  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(
      `Path traversal detected: "${userPath}" escapes base "${basePath}"`
    );
  }

  return resolvedPath;
}

/**
 * Validate a project slug.
 * Must be alphanumeric with hyphens, no path separators.
 */
export function validateSlug(slug: string): void {
  if (!slug) {
    throw new Error('Slug cannot be empty');
  }

  if (slug.includes('..') || slug.includes('/') || slug.includes('\\')) {
    throw new Error(`Invalid slug "${slug}": must not contain path separators or ".."`);
  }

  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$/.test(slug) && slug.length > 1) {
    throw new Error(`Invalid slug "${slug}": must be alphanumeric with hyphens`);
  }

  if (slug.length === 1 && !/^[a-zA-Z0-9]$/.test(slug)) {
    throw new Error(`Invalid slug "${slug}": must be alphanumeric`);
  }

  if (slug.length > 100) {
    throw new Error(`Slug too long: ${slug.length} > 100`);
  }
}

/**
 * Validate a chapter ID.
 * Must match pattern: ch\d+ (e.g., ch001, ch42)
 */
export function validateChapterId(id: string): void {
  if (!/^ch\d+$/.test(id)) {
    throw new Error(`Invalid chapter ID "${id}": must match pattern ch\\d+ (e.g., ch001)`);
  }
}

/**
 * Normalize a path to use forward slashes (for cross-platform consistency).
 */
export function normalizePath(p: string): string {
  return normalize(p).replace(/\\/g, '/');
}

/**
 * Check if a path is within a directory tree.
 */
export function isWithinPath(child: string, parent: string): boolean {
  const resolvedChild = resolve(child);
  const resolvedParent = resolve(parent);
  const rel = relative(resolvedParent, resolvedChild);
  return !rel.startsWith('..') && !isAbsolute(rel);
}

/**
 * Validate that a path is safe for shell execution.
 * Rejects paths containing shell metacharacters that could enable command injection.
 */
export function validateShellSafe(path: string): void {
  // Reject shell metacharacters: ; | & $ ` ( ) { } < > \n \r
  const dangerous = /[;|&$`(){}\x00-\x1f]/;
  if (dangerous.test(path)) {
    throw new Error(
      `Path contains dangerous characters and cannot be used in shell commands: "${path}"`
    );
  }
}
