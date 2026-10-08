const { outlineCommand } = require('./node_modules/confwrite/dist/commands/outline.js');

outlineCommand({
  projectDir: '/home/water/proj/c4/projects/LMERP2V2-new',
  template: 'technical-proposal',
  targetWords: 1000000
}).then(r => {
  console.log('Success:', r.success);
  console.log('Message:', r.message);
  if (r.chapterCount) console.log('Chapters:', r.chapterCount);
}).catch(e => {
  console.error('Error:', e.message);
});
