/**
 * ConfigurableMockExecutor — 可配置的模拟执行器
 * 
 * 用于测试 Phase 4 收敛性、429 限流等场景。
 * 可以控制：
 * - reviewer 在第 N 轮返回 accept/revise/reject
 * - reviewer 返回的 issues 严重度
 * - 模拟 429 限流
 * - 模拟 turn 预算耗尽
 */
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { SubagentExecutor, ExecutorResult } from '../../src/scheduler/executor.js';
import type { Task } from '../../src/scheduler/types.js';

export interface ReviewConfig {
  /** 第 N 轮返回 accept（之前返回 revise） */
  acceptAtRound?: number;
  /** 返回的 issues 严重度配置 */
  issues?: {
    high?: number;
    medium?: number;
    low?: number;
  };
}

export interface ExecutorConfig {
  /** 每章的审阅配置 */
  review?: Record<string, ReviewConfig>;
  /** 默认审阅配置（未单独配置的章节使用） */
  defaultReview?: ReviewConfig;
  /** 模拟 429 限流（前 N 次调用返回 429） */
  rateLimitCount?: number;
  /** 模拟 turn 预算耗尽（第 N 次调用时触发） */
  turnBudgetExhaustAt?: number;
}

export class ConfigurableMockExecutor implements SubagentExecutor {
  private projectDir: string;
  private config: ExecutorConfig;
  private callCount = 0;
  private rateLimitRemaining: number;

  constructor(projectDir: string, config: ExecutorConfig = {}) {
    this.projectDir = projectDir;
    this.config = config;
    this.rateLimitRemaining = config.rateLimitCount ?? 0;
  }

  async execute(task: Task): Promise<ExecutorResult> {
    const start = Date.now();
    this.callCount++;

    // 模拟 429 限流
    if (this.rateLimitRemaining > 0) {
      this.rateLimitRemaining--;
      return {
        success: false,
        output: 'LLM error: 429 Too Many Requests',
        durationMs: Date.now() - start,
      };
    }

    // 模拟 turn 预算耗尽
    if (this.config.turnBudgetExhaustAt && this.callCount === this.config.turnBudgetExhaustAt) {
      return {
        success: false,
        output: 'Turn budget exhausted (41 > 40)',
        durationMs: Date.now() - start,
      };
    }

    const round = this.extractRound(task.id);

    switch (task.type) {
      case 'writer':
        this.writeDraft(task, round);
        break;
      case 'reviewer':
        this.writeReview(task, round);
        break;
      case 'fixer':
        this.writeFix(task, round);
        break;
    }

    return {
      success: true,
      output: task.result || `mock: ${task.type} completed`,
      durationMs: Date.now() - start,
    };
  }

  private extractRound(taskId: string): number {
    const match = taskId.match(/-r(\d+)$/);
    return match ? parseInt(match[1]) : 1;
  }

  private writeDraft(task: Task, round: number): void {
    const chapterId = task.chapterId || 'unknown';
    const draftPath = join(this.projectDir, 'drafts', 'chapters', `${chapterId}-v${round}.md`);
    mkdirSync(dirname(draftPath), { recursive: true });

    // 生成符合要求的草稿（≥8000 字）
    const content = this.generateDraftContent(chapterId);
    writeFileSync(draftPath, content, 'utf-8');
    task.result = content;
  }

  private writeReview(task: Task, round: number): void {
    const chapterId = task.chapterId || 'unknown';
    const reviewDir = join(this.projectDir, 'review');
    mkdirSync(reviewDir, { recursive: true });

    // 获取该章节的审阅配置
    const reviewConfig = this.config.review?.[chapterId] ?? this.config.defaultReview ?? {};
    const acceptAtRound = reviewConfig.acceptAtRound ?? 1;
    const issues = reviewConfig.issues ?? {};

    // 决定是否 accept
    const shouldAccept = round >= acceptAtRound;

    const review = {
      chapterId,
      round,
      verdict: shouldAccept ? 'accept' : 'revise',
      scores: {
        accuracy: 8,
        consistency: 9,
        clarity: 8,
        depth: 7,
        quality: 8,
      },
      issues: this.generateIssues(issues),
      summary: shouldAccept ? '内容质量达标' : '需要修改',
    };

    const reviewPath = join(reviewDir, `${chapterId}-r${round}.json`);
    writeFileSync(reviewPath, JSON.stringify(review, null, 2), 'utf-8');

    task.result = JSON.stringify({
      decision: review.verdict,
      confidence: 0.85,
      reasons: [review.summary],
    });
  }

  private writeFix(task: Task, currentRound: number): void {
    const chapterId = task.chapterId || 'unknown';
    const nextRound = currentRound + 1;
    const draftPath = join(this.projectDir, 'drafts', 'chapters', `${chapterId}-v${nextRound}.md`);
    mkdirSync(dirname(draftPath), { recursive: true });

    const currentPath = join(this.projectDir, 'drafts', 'chapters', `${chapterId}-v${currentRound}.md`);
    let existing = '';
    if (existsSync(currentPath)) {
      existing = readFileSync(currentPath, 'utf-8');
    }

    const fixed = existing + `\n\n## 修复说明 (v${nextRound})\n\n已根据审阅反馈完成修复。\n`;
    writeFileSync(draftPath, fixed, 'utf-8');
    task.result = fixed;
  }

  private generateDraftContent(chapterId: string): string {
    // 生成 ≥8000 字的内容
    const longPara = (text: string, repeat: number = 20) => text.repeat(repeat);

    return `# ${chapterId} 系统架构设计

## 概述

${longPara('本章节详细描述了系统的整体架构设计，包括核心组件、交互模式和数据流向。系统采用现代化的微服务架构，支持高并发、高可用的业务需求。架构设计遵循松耦合、高内聚的原则，确保各个服务可以独立部署和扩展。')}

${longPara('在技术选型方面，系统采用了业界成熟的技术栈，包括容器化部署、服务网格、分布式数据库等。这些技术的选择基于对性能、可维护性和成本的综合考量。')}

## 架构总览

${longPara('系统采用分层架构设计，分为表示层、业务逻辑层和数据访问层。这种分层设计使得各层职责明确，便于维护和扩展。')}

${longPara('在微服务架构的基础上，系统还引入了事件驱动的设计理念，通过消息队列实现服务间的异步通信。')}

<!-- diagram-start
type: architecture
title: 系统架构
description: |
  展示客户端、网关、服务与数据层之间的调用关系。
containers:
  - id: client
    label: 客户端
    nodes: [web]
  - id: backend
    label: 服务端
    nodes: [gw, svc, db]
nodes:
  - id: web
    label: 客户端
    container: client
  - id: gw
    label: API 网关
    container: backend
  - id: svc
    label: 业务服务
    container: backend
  - id: db
    label: 数据库
    container: backend
edges:
  - from: web
    to: gw
    label: HTTPS
  - from: gw
    to: svc
  - from: svc
    to: db
diagram-end -->

${longPara('从架构图可以看出，API 网关作为统一入口，负责请求路由、认证鉴权和限流控制。业务服务处理核心逻辑，通过数据库进行数据持久化。')}

## 核心组件

${longPara('系统的核心组件包括认证模块和数据处理模块。这些组件采用模块化设计，每个组件都有明确的职责和接口。')}

${longPara('认证模块负责用户身份验证和权限管理。采用 JWT 令牌机制，支持单点登录和多因素认证。')}

${longPara('数据处理模块负责接收、转换和存储数据。模块采用流式处理架构，能够高效地处理大规模数据。')}

## 小结

${longPara('本章节详细描述了系统的整体架构设计，为后续详细设计提供了基础框架。')}

${longPara('通过采用微服务架构、事件驱动设计和分层架构，系统具有良好的灵活性和可维护性。')}
`;
  }

  private generateIssues(config: { high?: number; medium?: number; low?: number }): any[] {
    const issues: any[] = [];
    
    for (let i = 0; i < (config.high ?? 0); i++) {
      issues.push({
        severity: 'high',
        description: `高严重度问题 ${i + 1}`,
        location: `section-${i + 1}`,
        suggestion: '需要修复',
      });
    }
    
    for (let i = 0; i < (config.medium ?? 0); i++) {
      issues.push({
        severity: 'medium',
        description: `中严重度问题 ${i + 1}`,
        location: `section-${i + 1}`,
        suggestion: '建议改进',
      });
    }
    
    for (let i = 0; i < (config.low ?? 0); i++) {
      issues.push({
        severity: 'low',
        description: `低严重度问题 ${i + 1}`,
        location: `section-${i + 1}`,
        suggestion: '可选优化',
      });
    }
    
    return issues;
  }
}
