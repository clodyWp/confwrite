/**
 * 生成烟雾测试数据集的 Word 需求文档
 * 
 * 用途：创建 inputs/requirements.docx
 * 内容：一个简化的智能仓储管理系统需求
 */

import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } from 'docx';
import { writeFileSync } from 'node:fs';

async function generateRequirementsDoc() {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        // 标题
        new Paragraph({
          text: '智能仓储管理系统需求说明书',
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 400 }
        }),

        // 1. 项目概述
        new Paragraph({
          text: '1. 项目概述',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 200 }
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: '本项目旨在为某制造企业开发一套智能仓储管理系统，实现从原材料入库到成品出库的全流程数字化管理。系统需要支持多仓库协同、实时库存监控、自动化盘点、智能补货建议等核心功能。',
              size: 24
            })
          ],
          spacing: { after: 200 }
        }),

        // 2. 功能需求
        new Paragraph({
          text: '2. 功能需求',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 200 }
        }),

        // 2.1 入库管理
        new Paragraph({
          text: '2.1 入库管理',
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 100, after: 100 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'FR-001：系统应支持扫码入库，支持一维码和二维码识别', size: 24 })
          ],
          spacing: { after: 100 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'FR-002：入库单自动生成，包含物料编码、数量、批次、供应商信息', size: 24 })
          ],
          spacing: { after: 100 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'FR-003：支持质检流程，不合格品自动隔离并生成退货单', size: 24 })
          ],
          spacing: { after: 200 }
        }),

        // 2.2 库存管理
        new Paragraph({
          text: '2.2 库存管理',
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 100, after: 100 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'FR-004：实时库存查询，支持按物料、仓库、批次多维度查询', size: 24 })
          ],
          spacing: { after: 100 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'FR-005：库存预警，当库存低于安全库存时自动发送补货提醒', size: 24 })
          ],
          spacing: { after: 100 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'FR-006：支持ABC分类管理，A类物料每日盘点，B类每周，C类每月', size: 24 })
          ],
          spacing: { after: 200 }
        }),

        // 2.3 出库管理
        new Paragraph({
          text: '2.3 出库管理',
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 100, after: 100 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'FR-007：支持按单出库、紧急出库、样品出库等多种出库类型', size: 24 })
          ],
          spacing: { after: 100 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'FR-008：出库单自动关联生产工单或销售订单', size: 24 })
          ],
          spacing: { after: 100 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'FR-009：支持先进先出（FIFO）和指定批次出库策略', size: 24 })
          ],
          spacing: { after: 200 }
        }),

        // 3. 非功能需求
        new Paragraph({
          text: '3. 非功能需求',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 200 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'NFR-001：系统响应时间 < 2秒（95%请求）', size: 24 })
          ],
          spacing: { after: 100 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'NFR-002：支持并发用户数 ≥ 100', size: 24 })
          ],
          spacing: { after: 100 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'NFR-003：数据备份频率：每日全量 + 每小时增量', size: 24 })
          ],
          spacing: { after: 100 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'NFR-004：系统可用性 ≥ 99.5%', size: 24 })
          ],
          spacing: { after: 200 }
        }),

        // 4. 技术约束
        new Paragraph({
          text: '4. 技术约束',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 200 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'TC-001：数据库采用 PostgreSQL 14+', size: 24 })
          ],
          spacing: { after: 100 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'TC-002：后端框架：Spring Boot 3.x', size: 24 })
          ],
          spacing: { after: 100 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'TC-003：前端框架：Vue 3 + TypeScript', size: 24 })
          ],
          spacing: { after: 100 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'TC-004：部署环境：Kubernetes + Docker', size: 24 })
          ],
          spacing: { after: 200 }
        }),

        // 5. 验收标准
        new Paragraph({
          text: '5. 验收标准',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 200 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'AC-001：所有功能需求 100% 实现并通过测试', size: 24 })
          ],
          spacing: { after: 100 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'AC-002：性能测试达标（响应时间、并发数）', size: 24 })
          ],
          spacing: { after: 100 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'AC-003：用户验收测试通过率 ≥ 95%', size: 24 })
          ],
          spacing: { after: 100 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'AC-004：完成用户培训文档和操作手册', size: 24 })
          ],
          spacing: { after: 200 }
        }),
      ]
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  writeFileSync('inputs/requirements.docx', buffer);
  console.log('✅ 已生成 inputs/requirements.docx');
}

generateRequirementsDoc().catch(console.error);
