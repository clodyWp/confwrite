// 测试 JSON 修复
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const testDir = './test-debug';
mkdirSync(testDir, { recursive: true });

// 真实的错误 JSON
const badJson = `{
  "chapterId": "ch003",
  "round": 1,
  "verdict": "revise",
  "scores": {
    "accuracy": 8,
    "consistency": 9,
    "clarity": 8,
    "depth": 7,
    "quality": 8
  },
  "issues": [
    {
      "severity": "medium",
      "description": "内容不足，需要扩充"示例"",
      "location": "section-2.1",
      "suggestion": "补充案例"
    }
  ],
  "summary": "总体评价"
}`;

writeFileSync(join(testDir, 'test.json'), badJson);

console.log('原始 JSON:');
console.log(badJson);
console.log('\n---\n');

// 尝试修复
function tryFixJSON(content: string): any {
  // 1. 直接解析
  try {
    return JSON.parse(content);
  } catch (e) {
    console.log('直接解析失败:', (e as Error).message);
  }

  let fixed = content;

  // 2. 移除注释
  fixed = fixed
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  try {
    return JSON.parse(fixed);
  } catch (e) {
    console.log('移除注释后解析失败:', (e as Error).message);
  }

  // 3. 修复未转义的引号
  fixed = fixed.replace(/("(?:description|suggestion|summary|location)")\s*:\s*"([^"]*(?:"[^"]*)*)"/g, (match, key, value) => {
    console.log('匹配到:', { key, value });
    if (value.includes('"')) {
      const cleanValue = value.replace(/"/g, '');
      console.log('修复后:', cleanValue);
      return `${key}: "${cleanValue}"`;
    }
    return match;
  });

  console.log('\n修复后的 JSON:');
  console.log(fixed);

  try {
    return JSON.parse(fixed);
  } catch (e) {
    console.log('修复后解析失败:', (e as Error).message);
  }

  // 4. 修复中文引号
  fixed = fixed.replace(/\u201c|\u201d/g, '');

  console.log('\n移除中文引号后的 JSON:');
  console.log(fixed);

  try {
    return JSON.parse(fixed);
  } catch (e) {
    console.log('移除中文引号后解析失败:', (e as Error).message);
  }

  throw new Error('无法修复');
}

try {
  const result = tryFixJSON(badJson);
  console.log('\n✅ 修复成功:', result);
} catch (e) {
  console.log('\n❌ 修复失败:', (e as Error).message);
}
