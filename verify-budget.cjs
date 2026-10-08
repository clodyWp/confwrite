const { HeadingTreeBuilder } = require('./dist/outline/heading-tree.js');
const { AdaptiveOutlinePlanner } = require('./dist/outline/adaptive-planner.js');
const { readFileSync } = require('fs');

const doc = readFileSync('test-data-requirements.md', 'utf-8');
const builder = new HeadingTreeBuilder();
const root = builder.build(doc);

const planner = new AdaptiveOutlinePlanner();
const chapters = planner.plan(root, {
  targetWords: 1000000,
  wordBudget: { min: 5000, max: 8000 },
  tolerance: 0.2,
});

console.log('章节数:', chapters.length);
console.log('');
console.log('前 10 个章节的字数预算：');
chapters.slice(0, 10).forEach((ch, i) => {
  console.log(`  ${ch.id} ${ch.title}: ${ch.wordBudget.min} - ${ch.wordBudget.max} 字`);
});
console.log('');
const totalMin = chapters.reduce((sum, c) => sum + c.wordBudget.min, 0);
const totalMax = chapters.reduce((sum, c) => sum + c.wordBudget.max, 0);
console.log('总字数预算:', totalMin, '-', totalMax);
console.log('');
console.log('验证：');
console.log('  目标字数: 1000000');
console.log('  每章预算: 5000 - 8000');
console.log('  需要章节数: 1000000 / 8000 =', Math.ceil(1000000 / 8000));
console.log('  实际章节数:', chapters.length);
