/**
 * ChapterSyncer — 大纲→状态自动同步
 * 
 * Parses outline.md, syncs chapter definitions to project-state.json.
 * - New chapters → added as pending
 * - Removed chapters → removed (only if still pending)
 * - Title changes → updated
 * - In-progress chapters (writing/written/reviewing/etc.) → preserved
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { OutlineParser } from './outline-parser.js';
import { ProjectStore } from '../state/store.js';
import type { ProjectState, ChapterState } from '../state/schema.js';

/** Statuses that indicate a chapter is in-progress (won't be auto-removed) */
const PROTECTED_STATUSES = new Set([
  'writing', 'written', 'reviewing', 'reviewed', 'fixing', 'fixed',
]);

export interface SyncResult {
  added: string[];
  removed: string[];
  updated: string[];
  skipped: string[];  // chapters in outline that are protected from removal
  error?: 'outline_not_found';
}

/**
 * Sync chapters from outline.md into project state.
 */
export function syncChaptersFromOutline(
  projectDir: string,
  store: ProjectStore,
): SyncResult {
  const outlinePath = join(projectDir, 'outline.md');

  if (!existsSync(outlinePath)) {
    return { added: [], removed: [], updated: [], skipped: [], error: 'outline_not_found' };
  }

  const outlineContent = readFileSync(outlinePath, 'utf-8');
  const parser = new OutlineParser();
  const outline = parser.parse(outlineContent);

  // Extract all ch-markers from outline
  const outlineChapters = outline.getAllChapters();
  const outlineMap = new Map<string, { id: string; title: string }>();
  for (const ch of outlineChapters) {
    if (ch.id) {
      outlineMap.set(ch.id, { id: ch.id, title: ch.title });
    }
  }

  const state = store.load();
  if (!state) {
    return { added: [], removed: [], updated: [], skipped: [], error: 'outline_not_found' };
  }

  const result: SyncResult = { added: [], removed: [], updated: [], skipped: [] };

  // 1. Add new chapters
  for (const [id, info] of outlineMap) {
    if (!state.chapters[id]) {
      const newChapter: ChapterState = {
        id: info.id,
        title: info.title,
        status: 'pending',
        version: 0,
        round: 1,
        attempt: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      state.chapters[id] = newChapter;
      result.added.push(id);
    }
  }

  // 2. Update titles for existing chapters
  for (const [id, info] of outlineMap) {
    const existing = state.chapters[id];
    if (existing && existing.title !== info.title) {
      existing.title = info.title;
      existing.updatedAt = new Date().toISOString();
      result.updated.push(id);
    }
  }

  // 3. Remove chapters not in outline (only if pending)
  for (const id of Object.keys(state.chapters)) {
    if (!outlineMap.has(id)) {
      const chapter = state.chapters[id];
      if (chapter.status === 'pending') {
        delete state.chapters[id];
        result.removed.push(id);
      } else if (PROTECTED_STATUSES.has(chapter.status)) {
        result.skipped.push(id);
      } else {
        // completed/failed/skipped — also remove from state since they're gone from outline
        delete state.chapters[id];
        result.removed.push(id);
      }
    }
  }

  // 4. Update totalChapters
  state.totalChapters = Object.keys(state.chapters).length;

  store.save(state);
  return result;
}
