/**
 * Drive dongd project from Phase 4a with real PiSubagentExecutor
 * Runs in background, logs progress, handles multiple phases.
 */
import { resolve } from 'node:path';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const projectDir = resolve(import.meta.dirname, '../t2/projects/dongd');
const logPath = resolve(import.meta.dirname, '../t2/drive-progress.log');

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  const prev = existsSync(logPath) ? readFileSync(logPath, 'utf-8') : '';
  writeFileSync(logPath, prev + line + '\n');
}

log(`Starting drive for project: ${projectDir}`);

const { runWriteLoop } = await import('./dist/index.js');
const { PiSubagentExecutor } = await import('./dist/scheduler/pi-executor.js');

const executor = new PiSubagentExecutor({ 
  projectDir,
  thinkingLevel: 'low',
});

// Run write loop - it will process as many phases as possible in one go
const result = await runWriteLoop(projectDir, (msg, level) => {
  log(`[${level}] ${msg}`);
}, {
  executorOverride: executor,
  configOverride: {
    maxConcurrency: 3,
    rateLimitWindowMs: 60000,
    rateLimitMaxTasks: 5,
  },
});

log(`\n========== Result ==========`);
log(`Ticks: ${result.ticks}`);
log(`Tasks executed: ${result.tasksExecuted}`);
log(`Tasks succeeded: ${result.tasksSucceeded}`);
log(`Tasks failed: ${result.tasksFailed}`);
log(`Completed: ${result.completed}`);
log(`Stopped reason: ${result.stoppedReason || '(none)'}`);

// Check final state
const state = JSON.parse(readFileSync(resolve(projectDir, 'project-state.json'), 'utf-8'));
const chapters = Object.values(state.chapters);
const completed = chapters.filter(ch => ch.status === 'completed').length;
const written = chapters.filter(ch => ch.status === 'written').length;
const pending = chapters.filter(ch => ch.status === 'pending').length;
const failed = chapters.filter(ch => ch.status === 'failed').length;

log(`\nFinal state: Phase ${state.currentPhase}, Status: ${state.status}`);
log(`Chapters: ${completed} completed, ${written} written, ${pending} pending, ${failed} failed`);
