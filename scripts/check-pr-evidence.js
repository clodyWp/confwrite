#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_FIELDS = [
  '症状与复现',
  '根因证据',
  '回归测试',
  '验证命令与结果',
];

export function validatePrBody(body) {
  const errors = [];
  const isBugFix = /^-\s*\[[xX]\]\s*Bug 修复\s*$/m.test(body);

  for (const field of REQUIRED_FIELDS) {
    const match = body.match(new RegExp(`^-\\s*${field}[：:][ \\t]*(.*)$`, 'm'));
    const value = match?.[1]?.trim();

    if (!value || /^(?:<!--.*-->|TODO|TBD|待填写)$/i.test(value)) {
      errors.push(`缺少有效内容：${field}`);
      continue;
    }

    const isNotApplicable = value === '不适用' || value.toLowerCase() === 'n/a';
    if (isBugFix && field !== '验证命令与结果' && isNotApplicable) {
      errors.push(`Bug 修复必须填写：${field}`);
    }
  }

  if (!body.includes('## 缺陷修复证据')) {
    errors.push('PR 描述缺少“缺陷修复证据”部分，请使用仓库 PR 模板。');
  }

  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    console.error('GITHUB_EVENT_PATH 未设置，无法读取 PR 描述。');
    process.exit(1);
  }

  const event = JSON.parse(readFileSync(eventPath, 'utf8'));
  const body = event.pull_request?.body ?? '';
  const errors = validatePrBody(body);

  if (errors.length > 0) {
    console.error('PR 证据检查失败：');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log('PR 证据字段检查通过。');
}
