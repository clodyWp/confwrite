import { runWriteLoop } from './dist/index.js';
import { appendFileSync, writeFileSync } from 'node:fs';

const projectDir = 'C:/Users/wenhao01/pi_proj/t2/projects/dongd';
const logFile = `${projectDir}/.confwrite-tasks/write-loop.log`;

// Clear log
writeFileSync(logFile, '', 'utf-8');

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  const line = `[${ts}] ${msg}`;
  appendFileSync(logFile, line + '\n');
  console.log(line);
}

log('=== Write Loop Started ===');

try {
  const result = await runWriteLoop(projectDir, (msg, level) => {
    log(`[${level}] ${msg}`);
  });
  
  log('=== Write Loop Completed ===');
  log(`Ticks: ${result.ticks}`);
  log(`Tasks executed: ${result.tasksExecuted}`);
  log(`Tasks succeeded: ${result.tasksSucceeded}`);
  log(`Tasks failed: ${result.tasksFailed}`);
  log(`Completed: ${result.completed}`);
  log(`Stopped reason: ${result.stoppedReason}`);
} catch (e) {
  log(`ERROR: ${e.message}`);
  log(e.stack);
}
