import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { RequirementMarker } from './requirement-marker.js';
import type { Requirement } from './types.js';

/**
 * 需求追溯结果
 */
export interface TraceResult {
  /** 需求ID */
  reqId: string;
  /** 状态：unassigned/implemented/not_found */
  status: 'unassigned' | 'implemented' | 'not_found';
  /** 分配的章节ID */
  chapterId?: string;
  /** 实现位置列表 */
  locations: Array<{
    lineNumber: number;
    context: string;
  }>;
}

/**
 * 需求覆盖报告
 */
export interface CoverageReport {
  /** 总需求数 */
  totalRequirements: number;
  /** 已分配需求数 */
  assigned: number;
  /** 未分配需求数 */
  unassigned: number;
  /** 已实现需求数 */
  implemented: number;
  /** 未找到需求数 */
  notFound: number;
  /** 覆盖率 */
  coverageRate: number;
}

/**
 * 需求追溯工具
 * 用于查询需求的实现位置和覆盖情况
 */
export class RequirementTracer {
  private projectDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
  }

  /**
   * 追溯单个需求的实现位置
   */
  traceRequirement(reqId: string): TraceResult {
    // 1. 加载需求列表
    const requirementsPath = join(this.projectDir, 'assets', 'requirements.json');
    if (!existsSync(requirementsPath)) {
      throw new Error('需求文件不存在');
    }

    const requirementsContent = readFileSync(requirementsPath, 'utf-8');
    const requirements: Requirement[] = JSON.parse(requirementsContent);

    // 2. 查找目标需求
    const requirement = requirements.find(r => r.id === reqId);
    if (!requirement) {
      throw new Error(`需求不存在: ${reqId}`);
    }

    // 3. 检查是否已分配
    if (!requirement.assignedChapter) {
      return {
        reqId,
        status: 'unassigned',
        locations: [],
      };
    }

    // 4. 读取章节草稿
    const draftPath = join(
      this.projectDir,
      'drafts',
      'chapters',
      `${requirement.assignedChapter}-v1.md`
    );

    if (!existsSync(draftPath)) {
      return {
        reqId,
        status: 'not_found',
        chapterId: requirement.assignedChapter,
        locations: [],
      };
    }

    const draftContent = readFileSync(draftPath, 'utf-8');

    // 5. 解析标记
    const markers = RequirementMarker.parseMarkers(draftContent);
    const matchingMarkers = markers.filter(m => m.requirementId === reqId);

    if (matchingMarkers.length === 0) {
      return {
        reqId,
        status: 'not_found',
        chapterId: requirement.assignedChapter,
        locations: [],
      };
    }

    // 6. 返回实现位置
    return {
      reqId,
      status: 'implemented',
      chapterId: requirement.assignedChapter,
      locations: matchingMarkers.map(m => ({
        lineNumber: m.lineNumber,
        context: draftContent.split('\n')[m.lineNumber - 1] || '',
      })),
    };
  }

  /**
   * 生成需求覆盖报告
   */
  generateCoverageReport(): CoverageReport {
    // 1. 加载需求列表
    const requirementsPath = join(this.projectDir, 'assets', 'requirements.json');
    if (!existsSync(requirementsPath)) {
      throw new Error('需求文件不存在');
    }

    const requirementsContent = readFileSync(requirementsPath, 'utf-8');
    const requirements: Requirement[] = JSON.parse(requirementsContent);

    // 2. 统计覆盖情况
    let assigned = 0;
    let unassigned = 0;
    let implemented = 0;
    let notFound = 0;

    for (const req of requirements) {
      if (!req.assignedChapter) {
        unassigned++;
        continue;
      }

      assigned++;

      const trace = this.traceRequirement(req.id);
      if (trace.status === 'implemented') {
        implemented++;
      } else if (trace.status === 'not_found') {
        notFound++;
      }
    }

    // 3. 计算覆盖率
    const coverageRate = requirements.length > 0
      ? (implemented / requirements.length) * 100
      : 0;

    return {
      totalRequirements: requirements.length,
      assigned,
      unassigned,
      implemented,
      notFound,
      coverageRate,
    };
  }
}
