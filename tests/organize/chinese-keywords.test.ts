import { describe, it, expect } from 'vitest';
import { MaterialScanner } from '../../src/organize/scanner.js';

describe('Chinese keyword extraction', () => {
  const scanner = new MaterialScanner();

  it('extracts trigrams and bigrams from Chinese text', () => {
    const content = `# 系统架构设计

本文档描述了分布式系统的整体架构设计方案，包括微服务拆分策略和高可用部署方案。`;

    const keywords = scanner['extractKeywords'](content);

    // Should extract trigrams (3-char combos)
    expect(keywords).toContain('系统架');
    expect(keywords).toContain('架构设');
    // Should extract bigrams (2-char combos)
    expect(keywords).toContain('系统');
    expect(keywords).toContain('架构');
    expect(keywords).toContain('设计');
  });

  it('handles mixed Chinese and English text', () => {
    const content = `# Kubernetes 集群部署

使用 Helm 进行应用部署，配置 Ingress 和 Service。`;

    const keywords = scanner['extractKeywords'](content);

    // Should include English terms
    expect(keywords).toContain('Kubernetes');
    expect(keywords).toContain('Helm');
    expect(keywords).toContain('Ingress');
    expect(keywords).toContain('Service');
    // Should include Chinese trigrams
    expect(keywords).toContain('集群部');
    expect(keywords).toContain('应用部');
  });

  it('deduplicates keywords', () => {
    const content = `系统架构系统设计架构设计`;

    const keywords = scanner['extractKeywords'](content);

    // Should not have duplicates
    const unique = new Set(keywords);
    expect(keywords.length).toBe(unique.size);
  });

  it('filters common Chinese stop words', () => {
    const content = `这是一个关于系统设计的文档，描述了整体架构。`;

    const keywords = scanner['extractKeywords'](content);

    // Should extract keywords (non-empty)
    expect(keywords.length).toBeGreaterThan(0);
    // Should not include pure stop word combinations
    expect(keywords).not.toContain('这是');
    expect(keywords).not.toContain('一个');
    // Should include some Chinese terms
    expect(keywords.some(k => /[\u4e00-\u9fa5]/.test(k))).toBe(true);
  });

  it('limits keyword count to 20', () => {
    const content = `系统架构设计文档描述了分布式系统的微服务架构方案，包括容器部署、监控告警、日志收集等多个方面。`;

    const keywords = scanner['extractKeywords'](content);

    // Should not exceed 20 keywords
    expect(keywords.length).toBeLessThanOrEqual(20);
  });
});
