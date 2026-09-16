/**
 * ProjectStore — type-safe, atomic state persistence
 * 
 * Write strategy: write to .tmp → rename (atomic on most filesystems)
 * Windows fallback: copy + delete if rename fails
 */
import { readFileSync, writeFileSync, existsSync, renameSync, copyFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ProjectState } from './schema.js';

export class ProjectStore {
  private statePath: string;
  private state: ProjectState | null = null;

  constructor(projectDir: string) {
    this.statePath = `${projectDir}/project-state.json`;
  }

  /**
   * Load state from disk. Returns null if not found.
   */
  load(): ProjectState | null {
    if (!existsSync(this.statePath)) {
      return null;
    }

    try {
      const raw = readFileSync(this.statePath, 'utf-8');
      this.state = JSON.parse(raw) as ProjectState;
      return this.state;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to load state from ${this.statePath}: ${msg}`);
    }
  }

  /**
   * Save state to disk atomically.
   */
  save(state: ProjectState): void {
    state.lastUpdated = new Date().toISOString();

    const tmpPath = this.statePath + '.tmp';
    const dir = dirname(this.statePath);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    try {
      writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
      try {
        renameSync(tmpPath, this.statePath);
      } catch {
        // Windows fallback: rename may fail if file is locked
        copyFileSync(tmpPath, this.statePath);
        unlinkSync(tmpPath);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to save state to ${this.statePath}: ${msg}`);
    }

    this.state = state;
  }

  /**
   * Get current in-memory state (must call load() first).
   */
  get(): ProjectState {
    if (!this.state) {
      throw new Error('State not loaded. Call load() first.');
    }
    return this.state;
  }

  /**
   * Update state with a mutator function.
   * Loads → mutates → saves in one operation.
   */
  update(mutator: (state: ProjectState) => void): ProjectState {
    const state = this.load();
    if (!state) {
      throw new Error('State file not found');
    }
    mutator(state);
    this.save(state);
    return state;
  }

  /**
   * Check if state file exists.
   */
  exists(): boolean {
    return existsSync(this.statePath);
  }

  /**
   * Get the state file path.
   */
  getPath(): string {
    return this.statePath;
  }
}
