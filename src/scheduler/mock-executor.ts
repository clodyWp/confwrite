/**
 * MockSubagentExecutor — 测试用模拟执行器
 * 
 * 根据 task.type 生成合理的模拟输出：
 * - writer: 写版本化草稿文件到 drafts/chapters/${chapterId}-v${round}.md
 * - reviewer: 写审阅报告到 review/${chapterId}-r${round}.json
 * - fixer: 写新版本草稿文件到 drafts/chapters/${chapterId}-v${round+1}.md
 * 
 * 不需要真实 LLM 调用，用于端到端流程验证。
 */
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { SubagentExecutor, ExecutorResult } from './executor.js';
import type { Task } from './types.js';

/**
 * Word count mode for MockSubagentExecutor writer output.
 * - 'under': default ~4000 Chinese chars (within typical budget)
 * - 'mild': ~6000 Chinese chars (slightly over budget)
 * - 'severe': ~12000 Chinese chars (50% over budget)
 */
export type WordCountMode = 'under' | 'mild' | 'severe';

export interface MockExecutorOptions {
  wordCountMode?: WordCountMode;
}

export class MockSubagentExecutor implements SubagentExecutor {
  private projectDir: string;
  private wordCountMode: WordCountMode;

  constructor(projectDir: string, options?: MockExecutorOptions) {
    this.projectDir = projectDir;
    this.wordCountMode = options?.wordCountMode ?? 'under';
  }

  async execute(task: Task): Promise<ExecutorResult> {
    const start = Date.now();

    // 从 task.id 提取 round，如 "write-ch001-r1" → round=1
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
      default:
        return {
          success: true,
          output: `mock: ${task.type} task ${task.id} completed (no-op)`,
          durationMs: Date.now() - start,
        };
    }

    return {
      success: true,
      output: task.result || `mock: ${task.type} completed`,
      durationMs: Date.now() - start,
    };
  }

  /**
   * 从 task.id 提取 round
   * 格式: "write-ch001-r1" → 1, "review-ch001-r2" → 2
   */
  private extractRound(taskId: string): number {
    const match = taskId.match(/-r(\d+)$/);
    return match ? parseInt(match[1]) : 1;
  }

  /**
   * Writer: 写版本化草稿文件
   * 生成符合字数要求的内容：
   * - 总字数在 5200-7800 字范围内（默认 wordBudget）
   * - 图表前后有描述/总结段落
   */
  private writeDraft(task: Task, round: number): void {
    const chapterId = task.chapterId || 'unknown';
    const draftPath = join(this.projectDir, 'drafts', 'chapters', `${chapterId}-v${round}.md`);
    mkdirSync(dirname(draftPath), { recursive: true });

    // 生成较长的段落（每个段落约 300 字）
    const longPara = (text: string) => text.repeat(2);

    const content = `# ${chapterId} 系统架构设计

## 概述

${longPara('本章节详细描述了系统的整体架构设计，包括核心组件、交互模式和数据流向。系统采用现代化的微服务架构，支持高并发、高可用的业务需求。架构设计遵循松耦合、高内聚的原则，确保各个服务可以独立部署和扩展。')}

${longPara('在技术选型方面，系统采用了业界成熟的技术栈，包括容器化部署、服务网格、分布式数据库等。这些技术的选择基于对性能、可维护性和成本的综合考量，确保系统能够满足未来3-5年的业务发展需求。')}

${longPara('架构设计还充分考虑了非功能性需求，包括性能、安全性、可观测性等。通过合理的架构设计，系统能够在保证功能完整性的同时，提供优秀的用户体验和运维便利性。')}

## 架构总览

${longPara('系统采用分层架构设计，分为表示层、业务逻辑层和数据访问层。这种分层设计使得各层职责明确，便于维护和扩展。表示层负责与用户交互，业务逻辑层处理核心业务规则，数据访问层管理数据持久化。')}

${longPara('在微服务架构的基础上，系统还引入了事件驱动的设计理念，通过消息队列实现服务间的异步通信。这种方式不仅提高了系统的吞吐量，还增强了服务的容错能力，即使某个服务暂时不可用，也不会影响整体业务流程。')}

${longPara('架构设计还考虑了多租户隔离、数据分片、缓存策略等因素。通过合理的架构设计，系统能够支撑百万级用户的并发访问，同时保证数据的一致性和完整性。')}

${longPara('系统架构图如下所示，展示了各层之间的交互关系和数据流向。这个架构图清晰地呈现了系统的核心组件和它们之间的通信方式，帮助读者理解系统的整体结构。')}

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
    high_weight: true
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

${longPara('从架构图可以看出，API 网关作为统一入口，负责请求路由、认证鉴权和限流控制。业务服务处理核心逻辑，通过数据库进行数据持久化，同时通过消息队列与异步处理器通信，实现耗时任务的异步处理。')}

${longPara('架构设计还考虑了容灾和故障恢复机制。通过多活部署、自动故障转移、数据备份等策略，系统能够在发生故障时快速恢复，保证业务的连续性。')}

## 核心组件

${longPara('系统的核心组件包括认证模块和数据处理模块。这些组件采用模块化设计，每个组件都有明确的职责和接口。组件之间的依赖关系通过依赖注入管理，确保组件可以独立测试和替换。')}

${longPara('核心组件之间通过清晰的接口进行通信，避免了紧耦合。这种设计使得组件可以独立演进，不会影响其他组件的正常运行。同时，组件的接口设计也考虑了向后兼容性，确保系统的稳定性。')}

${longPara('核心组件的选型基于多个因素，包括性能、可维护性、社区支持等。每个组件都经过了严格的评估和测试，确保能够满足系统的长期发展需求。')}

### 认证模块

${longPara('认证模块负责用户身份验证和权限管理。采用 JWT 令牌机制，支持单点登录和多因素认证。模块设计遵循安全最佳实践，包括密码加密存储、令牌过期机制、刷新令牌等。')}

${longPara('认证模块还与第三方身份提供商集成，支持 OAuth2.0 和 OpenID Connect 协议。这使得系统可以方便地接入企业级身份管理系统，满足企业客户的安全合规要求。')}

${longPara('在权限管理方面，系统采用基于角色的访问控制（RBAC）模型，支持细粒度的权限配置。管理员可以灵活地定义角色和权限，确保用户只能访问其授权的资源。')}

### 数据处理模块

${longPara('数据处理模块负责接收、转换和存储数据。模块采用流式处理架构，能够高效地处理大规模数据。支持多种数据格式的输入，包括 JSON、XML、CSV 等，并可以自动进行格式转换和验证。')}

${longPara('数据处理模块的核心组件及其职责如下表所示。这些组件协同工作，构成了完整的数据处理流水线。每个组件都有明确的输入输出接口，可以独立部署和扩展。')}

| 组件 | 职责 | 技术栈 |
|------|------|--------|
| 数据接收器 | 接收原始数据 | Node.js |
| 转换器 | 数据格式转换 | TypeScript |
| 存储器 | 持久化存储 | PostgreSQL |
| 缓存层 | 加速数据访问 | Redis |
| 搜索引擎 | 全文检索 | Elasticsearch |

${longPara('数据处理模块还实现了数据质量检查机制，在数据入库前进行完整性、一致性和有效性验证。对于不符合要求的数据，系统会自动记录错误日志，并支持人工审核和修复。')}

${longPara('为了提高数据处理效率，模块采用了批量处理和并行计算的策略。通过合理的数据分片和负载均衡，系统能够充分利用集群资源，实现线性扩展。')}

${longPara('数据处理模块还支持插件式扩展，用户可以根据业务需求自定义数据处理逻辑。插件系统提供了丰富的扩展点，包括数据源接入、格式转换、质量检查等。')}

## 数据流

${longPara('系统的数据流设计遵循清晰、高效的原则。从客户端请求到数据持久化，每个环节都有明确的处理逻辑和错误处理机制。数据在流转过程中会经过多次验证和转换，确保最终存储的数据质量。')}

${longPara('在数据读取方面，系统采用了读写分离的架构，主库负责写操作，从库负责读操作。通过数据同步机制，确保从库的数据与主库保持一致。这种方式不仅提高了系统的读性能，还增强了系统的可用性。')}

${longPara('数据流设计还考虑了数据备份和恢复策略。系统支持全量备份和增量备份，可以在数据丢失时快速恢复。同时，通过数据版本控制，可以追溯数据的历史变更，满足审计和合规要求。')}

## 小结

${longPara('本章节详细描述了系统的整体架构设计，为后续详细设计提供了基础框架。架构设计充分考虑了性能、可用性、安全性和可扩展性，能够满足当前和未来的业务需求。通过采用先进的设计理念和技术栈，系统具备良好的竞争力和发展潜力。')}

${longPara('通过采用微服务架构、事件驱动设计和分层架构，系统具有良好的灵活性和可维护性。各个组件职责明确，接口清晰，便于团队协作和独立开发。这种设计方式使得系统能够快速迭代，持续交付高质量的软件产品。')}

${longPara('后续章节将深入讨论各个组件的详细设计，包括数据库设计、API 设计、安全策略等。这些设计将基于本章节的架构框架，进一步细化和完善系统的实现方案。通过系统化的设计方法，确保系统的每个方面都得到充分考虑和优化。')}

${longPara('总的来说，本章节为整个系统设计奠定了坚实的基础。通过清晰的架构设计和合理的技术选型，系统具备了应对复杂业务场景的能力。后续的开发工作将基于这个架构框架，逐步实现各个功能模块。架构设计还为未来的扩展和演进预留了空间，确保系统能够持续满足业务需求。')}
`;

    // Extend content based on wordCountMode
    const finalContent = this.extendContentForMode(content, longPara);

    writeFileSync(draftPath, finalContent, 'utf-8');
    task.result = finalContent;
  }

  /**
   * Extend base content based on wordCountMode.
   * - 'under': return base content as-is (~4000 Chinese chars)
   * - 'mild': append ~2000 additional chars (~6000 total)
   * - 'severe': append ~8000 additional chars (~12000 total)
   */
  private extendContentForMode(baseContent: string, longPara: (t: string) => string): string {
    if (this.wordCountMode === 'under') {
      return baseContent;
    }

    const mildExtension = `

## 部署架构

${longPara('系统的部署架构采用容器化方案，基于 Kubernetes 进行编排和管理。每个微服务都打包为独立的 Docker 镜像，通过 Helm Chart 进行统一部署。容器化部署确保了环境一致性，消除了开发、测试和生产环境之间的差异问题。')}

${longPara('在持续集成和持续部署方面，系统使用 GitLab CI/CD 流水线自动化构建、测试和部署流程。每次代码提交都会触发自动化测试套件，包括单元测试、集成测试和端到端测试。通过严格的测试门禁，确保只有质量达标的代码才能进入生产环境。')}

${longPara('部署架构还支持蓝绿部署和金丝雀发布策略。蓝绿部署通过维护两套完整的生产环境，实现零停机时间的版本切换。金丝雀发布则先将新版本推送给少量用户，通过监控指标确认无异常后逐步扩大流量比例，降低发布风险。')}

${longPara('基础设施即代码（IaC）是部署架构的核心原则。所有基础设施配置都通过 Terraform 或 Pulumi 进行声明式管理，确保环境可复现、可审计。配置变更通过 Git 版本控制，每次修改都有完整的审计跟踪。')}

${longPara('监控和告警体系覆盖基础设施层、应用层和业务层。Prometheus 负责指标采集，Grafana 提供可视化面板，Alertmanager 处理告警路由和升级。日志系统采用 ELK 栈（Elasticsearch、Logstash、Kibana），支持全文检索和结构化分析。')}

${longPara('容灾方面，系统支持跨区域部署和多活架构。关键数据实时同步到灾备中心，RPO（恢复点目标）控制在秒级。通过定期容灾演练，验证故障切换流程的有效性，确保在真实故障发生时能够快速恢复业务。')}
`;

    if (this.wordCountMode === 'mild') {
      return baseContent + mildExtension;
    }

    // severe: base + mild + additional heavy extension
    const severeExtension = `

## 安全架构

${longPara('系统的安全架构遵循纵深防御原则，从网络层、应用层到数据层实施多层安全防护。网络层通过防火墙、入侵检测系统和 Web 应用防火墙（WAF）抵御外部攻击。应用层实施严格的输入验证、输出编码和会话管理，防止常见 Web 安全漏洞。')}

${longPara('身份认证和授权系统采用零信任架构，不依赖网络位置作为信任依据。每次访问请求都需要经过身份验证和权限检查，无论请求来自内部网络还是外部网络。微服务间的通信通过 mTLS（双向 TLS）加密，确保服务间通信的机密性和完整性。')}

${longPara('数据安全方面，系统对敏感数据实施分类分级管理。个人身份信息（PII）在存储和传输过程中都进行加密处理。数据库采用透明数据加密（TDE）技术，防止物理介质泄露导致的数据泄露。密钥管理使用专用的密钥管理服务（KMS），支持密钥轮换和审计。')}

${longPara('安全审计系统记录所有关键操作的完整日志，包括用户登录、权限变更、数据访问和配置修改。审计日志不可篡改，存储在独立的日志系统中，满足合规审计要求。定期的安全扫描和渗透测试确保系统持续符合安全标准。')}

${longPara('安全事件响应流程定义了从检测到响应的完整链路。安全信息和事件管理（SIEM）系统实时分析安全事件，自动触发响应动作。严重安全事件会立即通知安全团队，并启动应急响应预案，确保在最短时间内控制安全事件的影响范围。')}

## 性能优化策略

${longPara('系统性能优化从多个维度展开，包括前端性能、网络传输、应用处理和数据库访问。前端采用代码分割、懒加载和缓存策略，减少首屏加载时间。CDN 加速静态资源分发，降低用户访问延迟。')}

${longPara('网络层面，系统使用 HTTP/2 多路复用减少连接开销，通过 gzip 和 brotli 压缩减少传输数据量。对于实时性要求高的场景，采用 WebSocket 长连接替代短轮询，减少握手开销和服务器负载。')}

${longPara('应用层面的性能优化包括热点代码路径优化、异步处理和非阻塞 I/O。计算密集型任务通过 Worker Thread 并行处理，避免阻塞主事件循环。内存使用通过对象池和流式处理优化，减少垃圾回收压力。')}

${longPara('数据库性能优化采用多级缓存策略。本地缓存（如 LRU Cache）处理热点数据访问，分布式缓存（Redis）处理跨实例共享数据。数据库查询通过索引优化、查询计划分析和慢查询监控持续改进。读写分离和分库分表策略支撑大规模数据访问需求。')}

${longPara('性能测试覆盖负载测试、压力测试和稳定性测试。通过模拟真实用户行为模式，验证系统在高并发场景下的表现。性能基准测试结果作为发布门禁，确保每次发布不会引入性能退化。性能监控看板实时展示关键性能指标，帮助快速定位性能瓶颈。')}

${longPara('容量规划基于业务增长预测和历史数据分析。通过趋势分析和容量模型，提前规划基础设施扩容时间点。自动伸缩策略根据实时负载动态调整计算资源，在保证性能的同时优化资源成本。定期的容量评审确保基础设施规划与业务发展保持同步。')}

## 可观测性体系

${longPara('可观测性体系由日志、指标和链路追踪三大支柱构成。结构化日志统一了日志格式和字段规范，支持快速检索和关联分析。分布式追踪通过 OpenTelemetry 标准实现，完整记录请求在各服务间的调用链路和耗时分布。')}

${longPara('指标体系分为基础设施指标、应用指标和业务指标三个层次。基础设施指标包括 CPU、内存、磁盘和网络使用率。应用指标包括请求延迟、错误率和吞吐量。业务指标包括订单量、转化率和用户活跃度。各层次指标通过 Grafana 看板统一展示。')}

${longPara('告警策略基于症状而非原因，关注用户可感知的影响而非内部组件状态。告警分级处理：紧急告警立即通知值班人员，警告告警在工作时间内处理，信息告警仅记录不通知。告警疲劳通过合理的阈值调整和告警聚合来避免。')}

${longPara('故障复盘（Postmortem）流程确保每次故障都能产生改进措施。无责复盘文化鼓励团队坦诚分析故障原因，关注系统性改进而非个人责任。复盘报告包含时间线、影响范围、根因分析和行动项，所有行动项都有明确的负责人和截止日期。')}

## 灾备与业务连续性

${longPara('灾备架构设计遵循分级保护原则，根据业务系统的重要程度制定不同的灾备策略。核心交易系统采用双活架构，RPO 接近零，RTO 控制在分钟级别。辅助系统采用温备模式，RPO 控制在小时级别，RTO 控制在小时级别。')}

${longPara('数据备份策略采用全量备份与增量备份相结合的方式。每日执行全量备份，每小时执行增量备份。备份数据加密存储异地数据中心，防止单点故障导致的数据丢失。定期的备份恢复演练验证备份数据的完整性和可恢复性。')}

${longPara('业务连续性计划（BCP）定义了各类故障场景下的应急响应流程。包括自然灾害、网络攻击、硬件故障、软件缺陷等多种场景。每个场景都有明确的应急响应团队、通讯联络方式和恢复步骤。')}

${longPara('混沌工程实践通过主动注入故障来验证系统的容错能力。常见的故障注入场景包括服务宕机、网络延迟、数据库连接池耗尽等。通过在生产环境中进行小规模的混沌实验，持续验证系统的自愈能力和监控告警的有效性。')}

${longPara('灾备切换流程经过定期演练和验证，确保在真实灾难发生时能够快速、可靠地完成切换。切换流程包括故障检测、决策确认、流量切换、数据验证和业务恢复等步骤。每个步骤都有自动化工具支持，减少人工操作带来的风险。')}

## API 设计原则

${longPara('系统的 API 设计遵循 RESTful 架构风格，采用统一的资源命名规范和 HTTP 方法语义。所有 API 端点都使用名词复数形式表示资源集合，通过 HTTP 方法表达操作语义。GET 用于查询、POST 用于创建、PUT 用于全量更新、PATCH 用于部分更新、DELETE 用于删除。')}

${longPara('API 版本管理通过 URL 路径前缀实现，如 /api/v1/resources。向后兼容的变更（如新增可选字段）不触发版本升级，破坏性变更（如删除字段、修改字段类型）必须通过新版本发布。旧版本 API 至少维护两个大版本的兼容期。')}

${longPara('API 响应格式统一采用 JSON 结构，包含数据体、分页信息和错误详情。成功响应使用标准 HTTP 状态码 200/201/204，错误响应包含错误码、错误消息和请求 ID。分页接口支持基于偏移量和基于游标两种模式，大数据集推荐使用游标分页。')}

${longPara('API 安全通过 OAuth 2.0 和 API Key 双重机制保障。外部 API 使用 OAuth 2.0 授权码流程，支持令牌刷新和撤销。内部服务间 API 使用 API Key 认证，Key 通过安全通道分发并定期轮换。所有 API 通信强制使用 TLS 1.3 加密。')}

${longPara('API 网关统一管理流量控制、认证鉴权和请求路由。限流策略采用滑动窗口算法，支持按用户、按 IP 和按 API 端点的多维度限流。熔断机制在下游服务异常时快速失败，避免级联故障。请求日志和审计跟踪覆盖所有 API 调用。')}

${longPara('API 文档通过 OpenAPI 3.0 规范自动生成，包含端点描述、请求参数、响应格式和示例代码。文档与代码同步更新，通过 CI 流水线验证文档的准确性。开发者门户提供交互式 API 调试环境，支持在线测试和代码生成。')}

## 数据治理框架

${longPara('数据治理框架覆盖数据全生命周期，从数据采集、存储、处理到归档和销毁。每个阶段都有明确的质量标准、安全要求和合规规范。数据所有者、数据管理者和数据使用者角色分离，确保数据使用的合规性和透明性。')}

${longPara('数据质量管理通过自动化规则和人工审核相结合的方式实现。自动化规则检查数据的完整性、一致性、准确性和时效性。异常数据自动标记并进入人工审核队列。数据质量指标定期报告，作为系统改进和数据治理优化的依据。')}

${longPara('元数据管理系统维护数据的血缘关系、变更记录和使用情况。数据血缘追踪从数据源到最终消费的全链路，帮助理解数据的来源和转换过程。变更管理记录数据结构和内容的每次修改，支持回溯和影响分析。')}

${longPara('数据归档策略根据数据的访问频率和合规要求制定分级存储方案。热数据存储在高性能 SSD 上，温数据迁移到普通磁盘，冷数据归档到对象存储。归档数据仍可通过标准接口访问，但响应时间较长。超过保留期限的数据自动销毁，销毁过程记录审计日志。')}
`;

    return baseContent + mildExtension + severeExtension;
  }

  /**
   * Reviewer: 写版本化审阅报告
   */
  private writeReview(task: Task, round: number): void {
    const chapterId = task.chapterId || 'unknown';
    const reviewDir = join(this.projectDir, 'review');
    mkdirSync(reviewDir, { recursive: true });

    const review = {
      chapterId,
      round,
      verdict: 'accept',
      scores: {
        accuracy: 8,
        consistency: 9,
        clarity: 8,
        depth: 7,
        quality: 8,
      },
      issues: [],
      summary: '内容质量达标，数据一致，结构清晰。',
    };

    const reviewPath = join(reviewDir, `${chapterId}-r${round}.json`);
    writeFileSync(reviewPath, JSON.stringify(review, null, 2), 'utf-8');

    const result = JSON.stringify({
      decision: 'accept',
      confidence: 0.85,
      reasons: ['内容质量达标'],
    });

    task.result = result;
  }

  /**
   * Fixer: 写新版本草稿文件
   */
  private writeFix(task: Task, currentRound: number): void {
    const chapterId = task.chapterId || 'unknown';
    const nextRound = currentRound + 1;
    const draftPath = join(this.projectDir, 'drafts', 'chapters', `${chapterId}-v${nextRound}.md`);
    mkdirSync(dirname(draftPath), { recursive: true });

    // 读取当前版本
    const currentPath = join(this.projectDir, 'drafts', 'chapters', `${chapterId}-v${currentRound}.md`);
    let existing = '';
    if (existsSync(currentPath)) {
      existing = readFileSync(currentPath, 'utf-8');
    }

    // 追加修复说明
    const fixed = existing + `\n\n## 修复说明 (v${nextRound})\n\n已根据审阅反馈完成修复。\n`;
    writeFileSync(draftPath, fixed, 'utf-8');
    task.result = fixed;
  }
}
