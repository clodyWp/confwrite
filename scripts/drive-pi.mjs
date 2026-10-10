/**
 * Drive pi in ../t2 workspace to complete the dongd project.
 * Uses child_process to spawn pi.cmd in the correct working directory.
 */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';

const t2Dir = resolve(import.meta.dirname, '../t2');
const logFile = resolve(t2Dir, 'drive-output.log');

// Write initial log
writeFileSync(logFile, `Starting pi at: ${new Date().toISOString()}\nCWD: ${t2Dir}\nCommand: pi -p "/confwrite:write projects/dongd"\n\n`);

console.log(`CWD: ${t2Dir}`);
console.log('Spawning pi...');

const piCmd = 'C:\\Users\\wenhao01\\AppData\\Roaming\\npm\\pi.cmd';

const child = spawn(piCmd, ['-p', '/confwrite:write projects/dongd'], {
  cwd: t2Dir,
  env: { ...process.env },
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';

child.stdout.on('data', (data) => {
  const text = data.toString();
  output += text;
  process.stdout.write(text);
  // Append to log file periodically
  if (output.length % 500 < 100) {
    writeFileSync(logFile, output);
  }
});

child.stderr.on('data', (data) => {
  const text = data.toString();
  process.stderr.write(text);
});

child.on('close', (code) => {
  writeFileSync(logFile, output + `\n\n--- EXIT CODE: ${code} at ${new Date().toISOString()} ---\n`);
  console.log(`\n--- pi exited with code ${code} ---`);
  process.exit(code || 0);
});

child.on('error', (err) => {
  console.error('Failed to start pi:', err.message);
  writeFileSync(logFile, `ERROR: ${err.message}\n`);
  process.exit(1);
});

// Save log every 30 seconds
setInterval(() => {
  if (output.length > 0) {
    writeFileSync(logFile, output);
  }
}, 30000);
