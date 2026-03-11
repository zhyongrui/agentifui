# AgentifUI Phase 1 开发计划

| 属性 | 值 |
|------|-----|
| 文档版本 | v0.4 |
| 状态 | active |
| 最后更新 | 2026-03-11 |
| 文档定位 | 代码仓库执行计划 |

## 1. 文档放置建议

本文档放在 `docs/plans/PHASE1_DEVELOPMENT_PLAN.md`。

这样放有两个原因：

1. `agentifui-docs` 继续作为设计规范和验收标准的权威来源。
2. 开发计划属于实施资产，会随着仓库结构、任务拆分、里程碑和实际进度一起变化，应该跟代码放在同一个仓库里。

维护原则：

- 规范变更时，先更新 `agentifui-docs`，再同步本计划。
- 切片启动、冻结、完成时，更新本计划中的状态和风险。
- 任务拆分以本计划为准，验收判定以设计文档中的 Acceptance 为准。

## 2. 规划输入

本计划基于以下文档整理：

- `agentifui-docs/roadmap/ROADMAP_V1_0.md`
- `agentifui-docs/roadmap/PHASE1_BACKLOG.md`
- `agentifui-docs/roadmap/PHASE1_ACCEPTANCE.md`
- `agentifui-docs/tech/TECHNOLOGY_STACK.md`
- `agentifui-docs/tech/practices/REPO_STRUCTURE.md`
- `agentifui-docs/frd/AFUI-FRD-S1-1.md`

## 3. 目标与范围

本计划覆盖设计文档中的 `Phase 1 (v1.0)`，对应 3 个阶段、9 个切片：

- Stage 1：身份与组织上下文
- Stage 2：网关与对话核心链路
- Stage 3：治理闭环与可运营

当前仓库是 greenfield 起步，因此在 Stage 1 之前增加一个 `M0 工程跑道` 里程碑。

## 4. 当前状态

当前已完成：

- Monorepo 基础骨架
- `apps/web` 路由骨架（`(auth)` / `(main)` / `(admin)`）
- `apps/gateway` 插件化入口、环境配置、健康检查
- `packages/shared` auth DTO、错误码、密码策略、邀请激活契约
- `packages/db` Drizzle 配置与 `S1-1` 初始 schema
- `docs/guides/S1-1_KICKOFF.md` 初始切入清单
- `docs/dev-log/` 开发日志结构
- `/auth/register`、`/auth/login`、`/auth/logout`、`/auth/sso/discovery` 最小工作流
- 失败登录锁定、重复注册拦截、`pending` 账号拒绝
- `/auth/invitations/accept` 最小邀请激活流
- `/login`、`/register`、`/invite/accept` 已接真实网关调用
- 认证相关测试已覆盖注册、登录、锁定、待审核、邀请过期

当前未完成：

- better-auth 接入
- 数据持久化和真实认证逻辑
- JIT 创建后的受限访问边界
- MFA（TOTP）
- 登录/登出审计
- CI 细化

## 5. 里程碑计划

| 里程碑 | 目标 | 主要产出 | 退出条件 |
|--------|------|----------|----------|
| M0 工程跑道 | 让仓库进入可持续开发状态 | workspace、基础脚手架、环境模板、CI 初版、数据库/认证框架接入 | 本地可启动 Web/Gateway，类型检查通过 |
| M1 S1-1 认证基座 | 打通身份认证最小闭环 | 租户/群组/用户模型、邮箱密码登录、SSO 域名识别、JIT、pending、邀请、MFA、审计 | `AC-S1-1-*` 全通过 |
| M2 S1-2 RBAC | 完成角色与授权判定 | 角色体系、授权规则、群组上下文、应用可见性判定 | `AC-S1-2-*` 全通过 |
| M3 S1-3 应用入口 | 打通应用工作台和配额基础 | 应用目录、收藏/最近使用、三级配额检查和告警 | `AC-S1-3-*` 全通过 |
| M4 S2-1 网关协议 | 落统一调用入口 | OpenAI 兼容最小接口、统一错误结构、Trace ID、降级策略 | `AC-S2-1-*` 全通过 |
| M5 S2-2 流式对话 | 完成对话核心体验 | 流式响应、停止生成、文件上传、分享、消息交互 | `AC-S2-2-*` 全通过 |
| M6 S2-3 执行追踪 | 完成运行态与持久化 | Run 模型、状态追踪、数据回源、会话隔离 | `AC-S2-3-*` 全通过 |
| M7 S3-1 管理后台 | 完成后台主闭环 | 用户/群组/应用/授权/配额管理 | `AC-S3-1-*` 全通过 |
| M8 S3-2 审计合规 | 完成安全与合规闭环 | 审计查询导出、PII 检测、事件覆盖 | `AC-S3-2-*` 全通过 |
| M9 S3-3 平台管理 | 达到 v1.0 发布门槛 | 多语言、租户创建、Webhook、容量和可用性验证 | `AC-S3-3-*` 全通过 |

## 6. 分阶段实施策略

### 6.1 M0 工程跑道

先补齐开发必需的基线能力：

- `packages/db` 接入 Drizzle 和迁移目录
- `apps/gateway` 接入 Fastify 插件注册、环境管理、日志
- `apps/web` 建立 `(auth)`、`(main)`、`(admin)` 路由组骨架
- 建立统一错误码、共享类型和 API DTO
- 补基础测试工具：单元、集成、E2E 目录
- 补 CI：`lint`、`type-check`、`test`

### 6.2 Stage 1 身份与组织上下文

开发顺序严格按依赖推进：

1. `S1-1` 多租户身份认证基座
2. `S1-2` RBAC 与授权模型
3. `S1-3` 应用入口与工作台

Stage 1 重点不是功能多，而是把系统地基做稳：

- 租户隔离
- 用户状态机
- 授权判定
- 群组上下文
- 应用可见性
- 配额边界

### 6.3 Stage 2 网关与对话核心链路

在 Stage 1 稳定后，再接对话主链路：

1. `S2-1` 统一网关最小协议
2. `S2-2` 流式对话与执行追踪
3. `S2-3` 执行状态与数据持久化

这一阶段的关键不是 UI，而是协议统一、追踪一致性和降级能力。

### 6.4 Stage 3 治理闭环与可运营

最后补全可运营和可发布能力：

1. `S3-1` 管理后台核心闭环
2. `S3-2` 审计与安全合规闭环
3. `S3-3` 平台管理与用户体验完善

## 7. 仓库分工

| 仓库区域 | 责任 | 当前优先级 |
|----------|------|------------|
| `apps/web` | 前端页面、BFF、交互状态 | P0 |
| `apps/gateway` | 认证、授权、网关协议、后台 API | P0 |
| `packages/db` | Schema、迁移、查询封装 | P0 |
| `packages/shared` | DTO、错误码、领域类型 | P0 |
| `packages/ui` | 共享组件和设计系统落地 | P1 |
| `docs/plans` | 实施计划和进度同步 | P0 |
| `docs/guides` | 切片级实施说明 | P1 |

## 8. M0-M1 任务拆分建议

### 8.1 先完成的任务

1. 建立 `packages/db` 的 Drizzle schema、迁移和 seed 结构。
2. 在 `packages/shared` 固化 `Tenant`、`Group`、`User`、`Invitation`、`AuditEvent` 的基础类型。
3. 在 `apps/gateway` 建立 `auth` 模块、错误码和 `/auth/*` 路由骨架。
4. 在 `apps/web` 落 `/login`、`/register`、`/auth/pending`、`/settings/profile` 页面。
5. 建立登录、注册、邀请激活、MFA 的表单 DTO 与校验规则。
6. 建立审计事件写入管道，先覆盖登录/登出/失败登录。

### 8.2 S1-1 内部推荐顺序

1. 冻结数据模型：`Tenant`、`Group`、`User`、`GroupMember`
2. 冻结接口：`/auth/login`、`/auth/logout`、`/auth/sso/discovery`
3. 邮箱密码登录
4. 密码策略和失败锁定
5. SSO 域名识别
6. JIT 创建和 `pending` 状态
7. 邀请激活
8. MFA（TOTP）
9. 审计补齐和 S1-1 回归

## 9. 切片完成定义

每个切片进入开发前必须满足：

- 对应领域模型字段冻结
- 对应接口契约冻结
- 验收项已经映射到测试计划

每个切片完成时必须满足：

- 所属 AC 全部通过
- 上一阶段能力无退化
- 审计与观测要求已接入
- 文档同步更新

## 10. 风险与前置决策

当前最需要提前锁定的决策：

1. `better-auth` 的接入边界：只做认证，授权继续自建。
2. `Drizzle` 的目录和迁移规范：避免后续重构。
3. `Next.js 16 + React 19 + Tailwind v4` 的实际兼容性。
4. `SSO` 在 `S1-1` 只做到域名识别与入口推荐，不做完整企业协议对接。
5. 审计事件和错误码命名从 `S1-1` 就统一，否则后期返工成本很高。
6. 当前仓库启动方式已采用 npm workspace，与原设计中的 pnpm 口径不完全一致；后续需决定是否保留 npm，或在稳定后切回 pnpm。

## 11. 开发方式（执行方法）

这一部分定义“接下来具体怎么开发”，用于指导后续每一轮实际实施。

### 11.1 总体方法

开发方式采用 `spec-first + slice-driven + incremental delivery`：

1. 先读设计文档和当前切片 FRD，再动代码。
2. 先冻结数据模型和接口契约，再写业务实现。
3. 先打通后端主链路，再补前端状态和交互。
4. 每次只推进一个主切片，不并行开启多个核心切片。
5. 每轮改动都必须附带验证结果和文档同步。

### 11.2 仓库内落地顺序

每个核心切片在代码仓库中的默认实施顺序：

1. `packages/shared`
   - 先定义共享类型、DTO、错误码、枚举
2. `packages/db`
   - 再定义 schema、迁移、seed、查询边界
3. `apps/gateway`
   - 实现路由、服务、鉴权、审计、业务规则
4. `apps/web`
   - 接入页面、表单、状态、BFF 和错误反馈
5. `packages/ui`
   - 将稳定交互抽成共享组件

原因很直接：

- 共享类型不先定，前后端接口会反复改
- 数据层不先定，认证和授权状态机会不稳定
- 后端链路不先通，前端只能写死页面

### 11.3 单轮开发循环

每一轮开发都按下面的固定顺序执行：

1. 读取相关规范
   - Roadmap
   - Backlog
   - Acceptance
   - 当前切片 FRD
2. 明确本轮边界
   - 本轮只做哪些 AC
   - 明确哪些能力暂不做
3. 先补契约
   - 领域模型
   - DTO
   - 错误码
   - 路由接口
4. 再做实现
   - `db`
   - `gateway`
   - `web`
5. 补验证
   - 单元测试
   - 集成测试
   - E2E 或手工冒烟
6. 回写文档
   - `docs/dev-log`
   - 必要时更新 `docs/plans`

### 11.4 近期具体开发顺序

我接下来会按下面顺序推进，而不是同时散开做：

#### 第 1 轮：M0 工程跑道收口（已完成）

目标：

- 让仓库从“只有骨架”变成“可以持续开发”

主要工作：

- 接入 Drizzle
- 接入环境变量加载
- 建立基础测试目录和脚本
- 完善 Gateway 插件注册结构
- 补 `(admin)` 路由组和必要占位页

交付结果：

- 本地能稳定启动 Web 和 Gateway
- 仓库存在统一的 schema、测试和环境管理入口

#### 第 2 轮：S1-1 数据模型和认证契约（已完成）

目标：

- 锁定 `S1-1` 的核心数据和接口，不再让认证主链路漂移

主要工作：

- `Tenant` / `Group` / `User` / `GroupMember` schema
- `Invitation` / `MfaFactor` / `AuditEvent` schema
- `/auth/login`
- `/auth/logout`
- `/auth/register`
- `/auth/sso/discovery`

交付结果：

- 数据模型和基础接口达到可实现状态

#### 第 3 轮：邮箱密码登录闭环（已完成）

目标：

- 先完成 `AC-S1-1-01` 和 `AC-S1-1-05` 的最小闭环

主要工作：

- 注册与登录表单
- 密码强度校验
- 失败登录计数和锁定
- 登录态建立与退出
- 认证错误码和前端错误反馈

交付结果：

- 用户可完成邮箱密码登录
- 弱密码和失败锁定行为正确

#### 第 4 轮：补齐 S1-1 余下能力（进行中）

目标：

- 向 `S1-1` 完整验收靠拢

已完成：

- SSO 域名识别
- `pending` 账号拒绝登录
- 邀请激活最小闭环

剩余主要工作：

- JIT 用户创建
- `pending` 状态与受限访问
- MFA（TOTP）
- 登录/登出审计
- 将当前内存认证能力替换为持久化实现

交付结果：

- `AC-S1-1-*` 逐项进入可验证状态

### 11.5 每轮交付要求

每轮开发结束时，至少要留下这些产物：

- 可运行代码
- 对应测试或明确的手工验证记录
- 一篇当天的 `dev-log`
- 如边界变化，更新开发计划

### 11.6 明确不这样开发

为了控制返工，下面这些做法默认禁止：

- 在 `S1-1` 未稳定前提前开发聊天主链路
- 一边写页面一边临时改接口，不先锁 DTO
- 未记录验证结果就宣称完成
- 同时推进两个核心切片

## 12. 近期执行建议

如果现在继续正式开发，建议按下面顺序推进：

1. 先补 `JIT + pending` 访问边界，让 `AC-S1-1-03`、`AC-S1-1-04` 有可验证实现。
2. 再补登录/登出审计，把当前认证链路的关键事件固定下来。
3. 然后补邀请创建端和 MFA（TOTP）。
4. 最后把当前内存认证服务替换为 `better-auth + db` 持久化实现。

## 13. 2026-03-11 进度快照

当前 `S1-1` 的推进结论：

- `AC-S1-1-01` 已有最小工作流基础，但仍是内存态实现。
- `AC-S1-1-05` 已通过密码策略和测试覆盖。
- `AC-S1-1-B02` 已通过失败锁定和测试覆盖。
- `AC-S1-1-07` 已具备邀请激活与过期拒绝的最小契约能力。
- `AC-S1-1-03`、`AC-S1-1-04`、`AC-S1-1-06`、`AC-S1-1-08` 仍需继续实现。

## 14. 关联文档

- [S1-1 Kickoff](../guides/S1-1_KICKOFF.md)
- `/home/bistu/zyr/pros/agentifui-docs/roadmap/ROADMAP_V1_0.md`
- `/home/bistu/zyr/pros/agentifui-docs/roadmap/PHASE1_BACKLOG.md`
- `/home/bistu/zyr/pros/agentifui-docs/roadmap/PHASE1_ACCEPTANCE.md`
- `/home/bistu/zyr/pros/agentifui-docs/frd/AFUI-FRD-S1-1.md`
