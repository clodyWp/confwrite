import { describe, it, expect } from 'vitest';
import { FormatConverter } from '../../src/organize/converter.js';

describe('HE-1: HTML 实体解码', () => {
  const converter = new FormatConverter();
  const htmlToMd = (html: string) => (converter as any).htmlToMarkdown(html);

  it('解码 &amp; &lt; &gt; &quot;', () => {
    const result = htmlToMd('A &amp; B &lt; C &gt; D &quot;E&quot;');
    expect(result).toContain('A & B');
    expect(result).toContain('< C');
    expect(result).toContain('> D');
    expect(result).toContain('"E"');
  });

  it('解码 &#039;', () => {
    const result = htmlToMd("it&#039;s");
    expect(result).toContain("it's");
  });

  it('解码 &nbsp;', () => {
    const result = htmlToMd('Hello&nbsp;World');
    expect(result).toContain('Hello World');
  });

  it('解码数字实体 &#NNN;', () => {
    const result = htmlToMd('&#20013;&#25991;');
    expect(result).toContain('中文');
  });

  it('解码十六进制实体 &#xHHH;', () => {
    const result = htmlToMd('&#x4E2D;&#x6587;');
    expect(result).toContain('中文');
  });

  it('混合实体和标签', () => {
    const result = htmlToMd('<p>A &amp; B <strong>&lt;C&gt;</strong></p>');
    expect(result).toContain('A & B');
    expect(result).toContain('<C>');
  });

  it('不破坏正常文本', () => {
    const result = htmlToMd('<p>Hello World</p>');
    expect(result).toContain('Hello World');
  });
});
