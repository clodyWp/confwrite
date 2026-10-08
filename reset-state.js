const fs = require('fs');
const state = JSON.parse(fs.readFileSync('project-state.json', 'utf8'));
state.currentPhase = '0b';
state.status = 'organizing';
delete state.waitPoint;
fs.writeFileSync('project-state.json', JSON.stringify(state, null, 2));
console.log('Reset to Phase 0b');
