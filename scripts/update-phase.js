const fs = require('fs');
const statePath = '/home/water/proj/c4/projects/e2e-v25/projects/e2e-v25/project-state.json';
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
state.currentPhase = '0b';
state.status = 'organized';
state.lastUpdated = new Date().toISOString();
fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
console.log('Updated project state to Phase 0b');