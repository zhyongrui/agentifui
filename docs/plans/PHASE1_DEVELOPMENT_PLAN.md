# AgentifUI Phase 1 开发计划

| 属性 | 值 |
|------|-----|
| 文档版本 | v0.8 |
| 状态 | active |
| 最后更新 | 2026-03-12 |
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
- `/auth/sso/callback` 最小 JIT 登录流
- 失败登录锁定、重复注册拦截、`pending` 账号拒绝
- `/auth/invitations/accept` 最小邀请激活流
- `/login`、`/register`、`/invite/accept` 已接真实网关调用
- Web 已具备基于会话的 `pending` 访问边界和 `/settings/profile`
- 认证相关测试已覆盖注册、登录、锁定、待审核、邀请过期、SSO JIT、访问边界规则
- `/apps` 已落第一版 `S1-3` 工作台切片
  - 授权应用目录
  - 最近使用 / 收藏 / 搜索
  - 当前工作群组切换
  - 三级配额预检与降级提示
- Gateway 已具备 `GET /workspace/apps` 最小工作台目录合同
  - 使用 `Authorization: Bearer <sessionToken>` 建立最小鉴权
  - 服务端返回群组、授权应用、默认群组和配额视图
  - 服务端拦截未登录或 `pending` 用户进入工作台
- Web `/apps` 已从本地 fixture 切换到真实 Gateway 目录接口
- 工作台相关测试已覆盖 gateway route、前端 client 和共享规则
- better-auth 已接入 Gateway 内部认证内核
  - 复用现有 `users` 表
  - 会话、凭据账户、verification 已落 PostgreSQL
  - 现有 `/auth/*` 路由合同未变化
- `S1-2 / S1-3` 的工作台授权目录已切换为数据库来源
  - `workspace_apps`
  - `workspace_app_access_grants`
  - `group_members` 默认归属会在首次进入工作台时持久化
  - 普通用户与安全用户已走真实 DB 授权分流
- `S1-2` 已具备第一版真实 RBAC 判定底座
  - `rbac_roles`
  - `rbac_user_roles`
  - role allow / user allow / explicit deny 优先级
  - 过期用户授权自动失效
- `S1-3` 已完成工作台状态持久化与首版 launch handoff
  - `workspace_user_preferences`
  - `workspace_app_launches`
  - 收藏 / 最近使用 / 默认工作群组已走 Gateway + PostgreSQL
  - `/workspace/apps/launch` 已返回第一版真实 launch contract
- `S1-3` 已完成最小真实 app surface 与 conversation/run 创建
  - `conversations`
  - `runs`
  - launch 成功会直接进入 `/chat/[conversationId]`
  - `workspace_app_launches` 已关联 `conversation_id` / `run_id` / `trace_id`
- `S2-1` 已完成第一版统一网关最小协议
  - `GET /v1/models`
  - `POST /v1/chat/completions`
  - `POST /v1/chat/completions/:taskId/stop`
  - 统一错误结构与 `X-Trace-ID` 已接入
  - Web `/chat/[conversationId]` 已可触发真实 completion
- `S2-2` 已完成首条真实流式对话链路
  - Web `/chat/[conversationId]` 已接入真实 SSE 渐进式渲染
  - active stream 已支持 hard-stop
  - transcript/message status 已持久化回 workspace conversation
- `S2-3` 已完成最小 run 查询与回放边界
  - 每次新的 completion 已生成独立 run
  - `/workspace/conversations/:conversationId/runs` 与 `/workspace/runs/:runId` 已可查询
  - Web `/chat/[conversationId]` 已显示 run history / replay 视图
- `S3-1 / S3-2` 已完成第一版真实后台只读读模型
  - Gateway 已新增 `/admin/users`、`/admin/groups`、`/admin/apps`、`/admin/audit`
  - `tenant_admin` 已成为后台读路径的真实鉴权边界
  - Web `/admin/*` 已从占位页切到真实只读数据页
  - 后台可读出用户状态 / MFA / 群组成员关系 / 应用授权 / 审计事件 / 启动活跃度
- `S3-2` 已完成 `R11-A` 的第一版 run-aware 审计查询
  - `/admin/audit` 已支持 action、level、actor、entity、traceId、runId、conversationId、时间范围和 limit 过滤
  - `workspace.app.launched` 已进入审计读面，并带 `traceId` / `runId` / `conversationId` / app / group 上下文
  - Web `/admin/audit` 已支持交互式过滤，浏览器回归已覆盖 action filter
- `S3-2` 已完成 `R11-B` 的第一版审计导出闭环
  - `/admin/audit/export` 已支持 `json` / `csv` 导出
  - 导出结果已复用当前 audit filter，并默认在未指定 limit 时使用 `1000`
  - Web `/admin/audit` 已支持一键触发导出
  - Next `/api/gateway/*` 代理已补 `content-disposition` 与 `x-agentifui-export-*` 透传，避免浏览器导出链路丢失元数据
- `S3-2` 已完成 `R11-C` 的第一版 PII 标记与敏感信息处理
  - 审计 payload 已支持 `masked` / `raw` 两种读模式，并在默认读面隐藏敏感字段
  - Gateway 审计 DTO 已返回 `payloadInspection`，可标记 email、phone、token、secret-like 字段
  - Web `/admin/audit` 已显示敏感 badge、字段级匹配摘要，并支持显式切换 raw payload
  - `/admin/audit/export` 已复用相同的 `payloadMode`，保证页面与导出脱敏口径一致
- 生产构建下的 Gateway 启动链路已修复 workspace package ESM 导出问题
- 已建立真实浏览器 E2E 回归基线
  - `npm run test:e2e` 会自动拉起隔离的 Web/Gateway 进程
  - 已覆盖注册、登录、SSO pending、邀请激活、MFA、RBAC 工作台差异、工作台 launch -> chat streaming/stop/run replay 和后台只读页
  - Linux 环境下会自动准备 Playwright 所需运行库并绕过本地代理干扰

当前未完成：

- `S1-2` Manager 授权边界、Break-glass、授权管理写接口和审计收口
- `S1-3` 的真实 quota service 与历史列表衔接
- `S2-2 / S2-3` 的文件上传、分享和更细粒度执行时间线
- `S3-1` 后台写接口、审批流和批量治理动作
- `S3-2` 剩余事件覆盖、后台访问最小审计和 action 命名收口
- 稳定公网接入（`80/443` 反向代理）仍未产品化，当前仅有临时 tunnel 手测方案
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
- SSO JIT 用户创建
- `pending` 状态与前端受限访问边界
- `pending` 账号拒绝密码登录
- 邀请激活最小闭环

剩余主要工作：

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

## 12. 长期滚动执行路线

这一节用于约束“做完一个任务后下一步做什么”，避免开发停在局部完成状态。

### 12.1 当前激活项与下一项

当前刚完成的迭代：

- `R4-B` `S1-1` better-auth 接入收口
  - better-auth 已作为内部认证 runtime 接管密码校验、会话创建、会话查询和会话撤销
  - 保留现有 `/auth/*`、MFA、邀请、SSO 和审计业务边界
  - better-auth 表结构、环境变量约束和持久化集成测试已补齐
- `R5-A` `S1-2 / S1-3` 工作台授权持久化来源
  - 新增 `workspace_apps` 与 `workspace_group_app_grants`
  - 启动时自动 seed 默认工作台目录与群组授权
  - 用户首次访问工作台时会持久化默认群组成员关系
  - `/workspace/apps` 已按数据库授权结果返回不同目录，并保持稳定顺序
- `R5-B` `S1-2` RBAC 规则收口第一阶段
  - 新增 `rbac_roles`、`rbac_user_roles` 和通用 `workspace_app_access_grants`
  - 工作台授权已按 `deny > user allow > group/role allow > default deny` 计算
  - `admin*` 邮箱用户已具备 `tenant_admin` 默认角色并获得 `Tenant Control` 入口
  - 过期用户授权会被自动忽略
  - 修复了 Gateway 在生产 `start` 场景下解析 workspace 包到 `src/*.ts` 的问题
- `R6-A` `S1-3` 工作台状态持久化与启动握手
  - 新增 `workspace_user_preferences` 与 `workspace_app_launches`
  - `/workspace/apps` 已返回持久化 favorites / recents / defaultActiveGroupId
  - `/workspace/preferences` 与 `/workspace/apps/launch` 已具备第一版真实合同
  - Web `/apps` 已切到真实 preferences / launch 接口，不再以 localStorage 作为状态源
  - launch 成功会写入持久化 recents 并生成 `handoff_ready` 记录
- `R6-B` `S1-3` 真实应用会话创建
  - 新增 `conversations` 与 `runs`
  - launch 时会创建真实 conversation / run / trace 主键
  - launchUrl 已改为真实 `/chat/[conversationId]` app surface
  - Gateway 已支持读取单个 workspace conversation
  - Web `/apps` 启动后会直接进入新的 chat shell 页面
- `R7` `S2-1` 网关协议
  - 新增 `/v1/models`
  - 新增 blocking / SSE 双模态 `/v1/chat/completions`
  - 新增 `/v1/chat/completions/:taskId/stop` soft-stop 协议
  - 统一错误结构、`X-Trace-ID` 和 workspace session 校验已接入
  - chat completion 已复用 launch 生成的 `conversation` / `run` / `trace`
  - Web `/chat/[conversationId]` 已从占位 shell 切到真实 completion 调用
- `R8` `S2-2` 对话主链路
  - Gateway SSE 已接到前端渐进式渲染
  - active stream stop 已从 soft-stop 进入真实 hard-stop
  - `conversation.inputs.messageHistory` 已持久化 transcript 与消息状态
  - Web `/chat/[conversationId]` 已支持 streaming / stop / restored transcript
  - 浏览器回归已覆盖“发送第二条消息并主动停止”
- `R9` `S2-3` Run 追踪
  - 每次新的 completion 已生成独立 run / trace，而不是复用同一个 run
  - Gateway 已支持读取 conversation 维度 run history 与单 run 详情
  - Web `/chat/[conversationId]` 已显示 run history、usage 和 replay snapshot
  - 浏览器与真实 HTTP 冒烟已验证“第二次 completion 新建 run 并可查询回放”
- `R10-A` `S3-1 / S3-2` 后台读模型
  - Gateway 已新增 `/admin/users`、`/admin/groups`、`/admin/apps`、`/admin/audit`
  - `tenant_admin` 或 `root_admin` 已可读后台真实数据，而非进入占位页
  - Web `/admin/*` 已能查看用户状态、群组聚合、应用授权概览和租户审计事件
  - E2E 已切到真实后台数据验证，不再只验证“页面可打开”
- `R10-B` `S3-1` 后台治理写路径
  - Gateway 已新增 `POST /admin/apps/:appId/grants` 与 `DELETE /admin/apps/:appId/grants/:grantId`
  - 后台已支持按邮箱创建 direct user allow/deny grant，并可从同一页面撤销
  - 写操作会即时影响 `/workspace/apps` 可见性，并写入后台审计事件
  - E2E 已覆盖“admin 授权后普通用户获得 Tenant Control 可见性”的完整浏览器链路

下一个激活项：

- `R11` `S3-2` 审计合规深化
  - 在已完成的 direct grant 写路径之上补审计筛选、导出、PII 标记和 run-aware 合规视图
  - 保留 Manager / Break-glass 和批量治理作为 `S3-1` 的后续细化子项
  - 继续以现有 conversation/run 持久化边界作为治理与观测基础

### 12.2 Rolling Plan

| 轮次 | 主题 | 目标 | 退出条件 |
|------|------|------|----------|
| R1 | `S1-3` Gateway 工作台目录 | 用后端合同替换前端 fixture，冻结工作台最小目录协议 | `/apps` 真实调用 gateway，工作台测试和冒烟通过 |
| R2 | `S1-1` 审计最小闭环 | 固化登录成功 / 失败 / 登出事件模型与写入点 | 审计事件有测试、有可验证输出 |
| R3 | `S1-1` MFA (TOTP) | 补 MFA 启用、校验和错误反馈 | `AC-S1-1-06` 进入可验证状态 |
| R4 | `S1-1` 持久化认证 | 分两步完成：`R4-A` 先替换为 `db` 持久化，`R4-B` 再接入 `better-auth` | 已完成 |
| R5 | `S1-2` RBAC 持久化 | 分两步完成：`R5-A` 先落工作台目录与群组授权来源，`R5-B` 再补角色/deny/user grant | 已完成第一版 RBAC 可见性判定 |
| R6 | `S1-3` 启动链路 | 分两步完成：`R6-A` 先持久化收藏/最近使用并定义 launch contract，`R6-B` 再创建真实会话 | 已完成 |
| R7 | `S2-1` 网关协议 | 定义统一模型调用协议、错误结构和 trace | 网关最小协议可被 web 调用 |
| R8 | `S2-2` 对话主链路 | 接入流式对话、停止生成和消息状态 | 首条真实对话链路完成 |
| R9 | `S2-3` Run 追踪 | 让会话、执行和状态追踪闭环 | 运行态可查询、可回放 |
| R10-A | `S3-1 / S3-2` 后台读模型 | 用真实数据替换 `/admin/*` 占位页，建立只读治理面 | 已完成 |
| R10-B | `S3-1` 后台写路径 | 补 direct grant 写接口、撤销路径和后台动作审计 | 已完成第一版 direct user grant 治理闭环 |
| R11 | `S3-2` 审计合规深化 | 补审计导出、PII 标记、剩余 run-aware 合规能力 | 已完成 `R11-A` 查询视图，继续收口导出 / PII / 覆盖 |
| R12 | `S2` 残余 backlog | 文件上传、分享、细粒度执行时间线与历史衔接 | 对话主链路的残余 AC 收口 |
| R13 | `S3-3` 平台管理与发布硬化 | 平台管理、稳定公网入口、CI/观测/发布验证 | 达到 Phase 1 发布门槛 |

### 12.3 每一轮固定质量门槛

每轮完成后必须同时满足：

- `npm test` 通过
- `npm run type-check` 通过
- 至少一条真实 HTTP 冒烟验证通过
- `docs/dev-log` 已记录本轮实现和验证结果
- 如执行顺序或边界变化，`docs/plans/PHASE1_DEVELOPMENT_PLAN.md` 已更新
- 已完成 Git 提交并推送到远端

### 12.4 明确的连续开发规则

从这一版计划开始，默认按下面的规则持续推进：

1. 当前轮次收口后，立即把下一轮写成“激活项”。
2. 不允许完成代码但不补测试、文档和提交。
3. 不允许为了赶进度跳过长期计划中前一轮的退出条件。
4. 若某一轮被环境阻塞，转入同阶段内的次优先项，但必须把阻塞写入 dev-log。

### 12.5 长期执行路线

在 `R10-B` 完成后，后续按下面顺序持续推进，不再回到“先搭占位页”的模式：

1. `R11`
   - 把当前 `auth` 审计事件和 `run`/`trace` 数据面汇总到统一审计检索与导出能力
   - 为后续 PII 标记和合规导出建立稳定合同
2. `R12`
   - 回补 `S2` 剩余 backlog：文件上传、分享、执行时间线、会话历史回源
3. `R13`
   - 平台管理与发布硬化
   - 包括稳定公网入口、CI 深化、运维可观测性和发布前容量验证

### 12.6 公网手测入口策略

当前仓库的浏览器/公网验证按两层策略执行：

1. 开发态直连
   - Web 直接监听 `3112`
   - Gateway 直接监听 `4214`
   - 适合服务器本机或 SSH 隧道访问
2. 临时公网验证
   - 当服务器已有 `80/443` 反向代理、且当前用户没有 root 权限时，使用 `cloudflared tunnel --url http://127.0.0.1:3112 --no-autoupdate`
   - 该入口用于手工浏览器验证，不作为稳定发布入口

稳定公网方案仍要求后续 `R13` 收口：

- 在现有 `nginx` / `80/443` 下挂正式域名或路径前缀
- Web 反代到本地 Next 进程
- `/api/gateway/*` 反代到本地 Gateway 进程
- 将临时 tunnel 从“测试 workaround”升级为“正式入口配置文档”

### 12.7 详细任务板

从这一节开始，把剩余 Phase 1 工作拆成“可以直接逐轮执行”的任务板。后续每一轮开发默认从当前激活队列中顺序取任务，而不是重新临时规划。

#### R11-A `S3-2` 审计查询与 run-aware 视图

| 编号 | 任务 | 目标 | 完成定义 |
|------|------|------|----------|
| R11-A1 | 扩展共享审计合同 | 支持 action、level、actor、entity、时间范围、traceId、runId 查询参数 | shared 合同与前后端类型统一 |
| R11-A2 | 扩展 `/admin/audit` 查询参数 | 让后台审计页不再只有固定列表 | gateway route 支持 query 校验 |
| R11-A3 | 持久化审计过滤读模型 | 在 PostgreSQL 中按租户、动作、时间、trace、run 查询 | persistent admin service 返回过滤结果 |
| R11-A4 | countsByAction 与过滤结果联动 | 让 action 汇总和列表使用同一过滤条件 | 统计与列表口径一致 |
| R11-A5 | 将 run/trace 维度映射进审计读面 | 让管理员从 audit 直接看到 run 关联 | 审计 DTO 含 `traceId` / `runId` / `conversationId` |
| R11-A6 | 后台审计页增加过滤表单 | 支持 action、level、actor、traceId 过滤 | Web `/admin/audit` 可交互过滤 |
| R11-A7 | 后台审计页增加 run 链接 | 从 audit 直接跳或定位到 run 详情 | 浏览器中可见 run-aware 入口 |
| R11-A8 | 审计页增加结果为空和错误状态 | 让过滤后的 UX 完整 | 空状态和错误状态可验证 |
| R11-A9 | 增加 route 测试 | 保证 query 校验、鉴权、过滤结果正确 | admin route tests 覆盖新增参数 |
| R11-A10 | 增加持久化测试 | 用真实 DB 验证 trace/run 过滤 | auth-persistence 或新测试通过 |
| R11-A11 | 增加前端 client/page 测试 | 保证过滤请求和回显稳定 | Web 测试通过 |
| R11-A12 | 增加浏览器回归 | 管理员能在浏览器里筛出指定审计事件 | Playwright 覆盖通过 |

#### R11-B `S3-2` 审计导出与合规交付

| 编号 | 任务 | 目标 | 完成定义 |
|------|------|------|----------|
| R11-B1 | 设计审计导出合同 | 支持 JSON/CSV 导出元数据 | shared 合同冻结 |
| R11-B2 | 增加导出接口 | 后台可请求导出租户审计数据 | gateway route 可返回导出文件或 signed metadata |
| R11-B3 | 实现 CSV 序列化 | 满足人工审查与归档需求 | CSV 字段顺序和 escaping 通过测试 |
| R11-B4 | 实现 JSON 导出 | 满足系统对接与二次分析 | JSON 导出结构稳定 |
| R11-B5 | 限制导出范围 | 只允许 tenant_admin / root_admin 导出当前租户数据 | 鉴权与越权测试通过 |
| R11-B6 | 支持过滤后导出 | 导出结果复用当前 audit filter | 页面过滤和导出参数一致 |
| R11-B7 | 后台审计页增加导出按钮 | 从 UI 触发导出 | 浏览器可下载导出结果 |
| R11-B8 | 补导出集成测试 | 验证 JSON/CSV 结果内容 | route / persistence tests 通过 |

#### R11-C `S3-2` PII 标记与敏感信息处理

| 编号 | 任务 | 目标 | 完成定义 |
|------|------|------|----------|
| R11-C1 | 定义 PII 标记合同 | 对 payload 字段进行风险标记 | shared 合同新增 PII 元数据 |
| R11-C2 | 实现基础 PII 检测器 | 检测 email、phone、token、secret-like 文本 | 单测覆盖规则 |
| R11-C3 | 在审计 payload 上应用检测 | 标注 payload 中的敏感字段 | audit DTO 返回字段级标记 |
| R11-C4 | 后台审计页显示敏感标记 | 管理员能快速识别风险数据 | UI 显示 PII badge / block |
| R11-C5 | 可选的 payload mask 视图 | 默认隐藏高风险字段，支持显式展开 | 页面交互稳定 |
| R11-C6 | 导出链路遵守 mask 规则 | 导出时可选择 masked/raw 模式 | 导出测试通过 |
| R11-C7 | 补端到端测试 | 浏览器里能看到 PII 标记与展开行为 | Playwright 通过 |

#### R11-D `S3-2` 审计覆盖补全

| 编号 | 任务 | 目标 | 完成定义 |
|------|------|------|----------|
| R11-D1 | 补 workspace preferences 审计 | 收藏、默认群组变更可审计 | 事件写入且可查询 |
| R11-D2 | 补 app launch 审计 | app 启动进入 audit 视图 | launch 事件带 app/group/trace |
| R11-D3 | 补 run stop 审计 | 主动停止生成进入 audit | stop 事件可按 run 查询 |
| R11-D4 | 补 admin read access 审计 | 后台敏感页面访问有最小审计 | `/admin/*` 访问记录可见 |
| R11-D5 | 补 direct grant 失败审计 | 冲突、无权限、未找到等有 warning 级审计 | 错误链路有测试 |
| R11-D6 | 统一 action 命名表 | 限制 action 字符串继续发散 | 文档与合同统一 |

#### R12-A `S2` 文件上传主链路

| 编号 | 任务 | 目标 | 完成定义 |
|------|------|------|----------|
| R12-A1 | 设计上传合同 | chat/workspace 可接文件元数据 | shared 合同冻结 |
| R12-A2 | 建立上传存储抽象 | 支持本地文件系统或对象存储适配 | gateway service 抽象完成 |
| R12-A3 | 增加上传接口 | 支持单文件上传和元数据返回 | route + 持久化测试通过 |
| R12-A4 | 会话中挂接附件 | transcript / conversation 可引用上传文件 | conversation DTO 含附件 |
| R12-A5 | 前端 composer 支持附件 | Web 聊天框可选择并发送附件 | 浏览器可上传 |
| R12-A6 | run / audit 挂接附件引用 | 后续回放和审计可追踪附件 | run snapshot 可见附件 |
| R12-A7 | 上传大小与类型限制 | 避免任意文件写入 | 校验测试通过 |
| R12-A8 | 上传失败恢复 UX | 网络失败与校验失败有明确提示 | 前端交互稳定 |

#### R12-B `S2` 分享与协作

| 编号 | 任务 | 目标 | 完成定义 |
|------|------|------|----------|
| R12-B1 | 设计 conversation share 合同 | 支持只读分享或组内分享 | shared 合同冻结 |
| R12-B2 | 增加分享记录持久化 | conversation share 进入 DB | schema + migration 完成 |
| R12-B3 | 增加创建/撤销分享接口 | 后台或聊天页可控制分享 | route 测试通过 |
| R12-B4 | Web 聊天页增加分享面板 | 用户可以创建分享链接 | 页面交互可用 |
| R12-B5 | 受分享访问边界 | 被分享用户只能读授权内容 | 鉴权测试通过 |
| R12-B6 | 审计分享事件 | 创建、访问、撤销都写审计 | audit 中可查 |

#### R12-C `S2` 执行时间线与历史回源

| 编号 | 任务 | 目标 | 完成定义 |
|------|------|------|----------|
| R12-C1 | 设计 timeline DTO | 把 run 分解成阶段性事件 | shared 合同冻结 |
| R12-C2 | 持久化 run timeline | completion、stop、error、rehydrate 写时间线 | DB / service 完成 |
| R12-C3 | 增加 conversation history 列表 | `/chat` 不只靠单 conversation 深链 | Web 有历史列表 |
| R12-C4 | 增加最近会话查询接口 | 按用户读取最近 conversation | workspace route 支持 |
| R12-C5 | 聊天页显示 timeline | run 内部阶段可视化 | UI 可查看时间线 |
| R12-C6 | 时间线与 replay 联动 | 选中 run 时 timeline 刷新 | 浏览器通过 |
| R12-C7 | 历史搜索/筛选 | 按 app、group、时间查找 conversation | 页面过滤可用 |

#### R12-D `S1-3` quota 与历史状态收口

| 编号 | 任务 | 目标 | 完成定义 |
|------|------|------|----------|
| R12-D1 | 设计真实 quota 读模型 | 不再依赖 fixture-like quota | quota DTO 来源真实化 |
| R12-D2 | quota 持久化表或聚合视图 | 用户、群组、租户三层额度统一 | DB 方案确定并落地 |
| R12-D3 | app launch 扣减与拒绝 | 启动链路接入真实 quota 判断 | launch 行为与 quota 联动 |
| R12-D4 | chat completion 扣减 | run 结束后更新 quota 使用量 | completion 测试通过 |
| R12-D5 | quota 告警展示 | `/apps` 与 `/chat` 显示真实 quota 提示 | 浏览器验证通过 |
| R12-D6 | quota 审计 | 超额、拒绝、重置进入 audit | 审计链路可查 |

#### R13-A `S3-3` 平台管理与租户生命周期

| 编号 | 任务 | 目标 | 完成定义 |
|------|------|------|----------|
| R13-A1 | 设计平台管理合同 | 平台级 admin 与 tenant admin 分层 | shared 合同冻结 |
| R13-A2 | 平台租户列表接口 | 读取租户、状态、创建时间、负责人 | route + tests 完成 |
| R13-A3 | 新租户创建流程 | 后台可创建 tenant 与默认资源 | 持久化创建通过 |
| R13-A4 | tenant suspend / reactivate | 平台可控制租户可用性 | 鉴权和行为测试通过 |
| R13-A5 | 平台审计页 | 平台级别查看多租户高风险事件 | UI 可用 |
| R13-A6 | root_admin 边界强化 | root_admin 与 tenant_admin 差异固化 | 权限测试通过 |

#### R13-B `S3-3` 稳定公网入口与部署硬化

| 编号 | 任务 | 目标 | 完成定义 |
|------|------|------|----------|
| R13-B1 | 正式反向代理配置文档 | 不再依赖临时 tunnel | nginx 配置落文档 |
| R13-B2 | `/api/gateway` 正式反代 | Web 与 Gateway 公网同域工作 | 部署验证通过 |
| R13-B3 | HTTPS / 证书续期说明 | 公网入口满足基本安全要求 | 文档与验证完成 |
| R13-B4 | 进程管理方案 | systemd / pm2 / container 之一固定 | 可重复启动 |
| R13-B5 | 环境变量模板收口 | 开发、测试、生产环境模板完整 | `.env` 文档完备 |
| R13-B6 | 公网浏览器回归脚本 | 稳定发布前可重复手测 | 手测脚本落地 |

#### R13-C `S3-3` CI、观测与发布质量门槛

| 编号 | 任务 | 目标 | 完成定义 |
|------|------|------|----------|
| R13-C1 | CI 拆分 type/unit/e2e | 降低回归风险 | CI pipeline 可运行 |
| R13-C2 | 数据库迁移校验 | 每次 PR 自动验证迁移可执行 | CI 覆盖 DB migrate/reset |
| R13-C3 | 构建产物检查 | Web/Gateway 生产构建进入 CI | build job 稳定 |
| R13-C4 | 基础 metrics/log 方案 | gateway 关键路径有可观察性 | 日志字段和指标约定固定 |
| R13-C5 | 失败告警与 smoke 脚本 | 发布后能快速确认系统可用 | smoke 脚本可重复执行 |
| R13-C6 | 发布 checklist | 发布前后步骤固定 | 文档可直接执行 |

### 12.8 当前激活队列

当前默认按下面顺序执行，不再每轮重新定义优先级：

1. `R11-D1` / `R11-D3` workspace preferences 与 run stop 审计补齐
2. `R11-D4` / `R11-D5` 后台访问和 direct grant 失败审计
3. `R11-D2` / `R11-D6` app launch 命名表和剩余 action 收口
4. `R12-A1` / `R12-A4` 文件上传合同、存储抽象与会话附件挂接
5. `R12-A5` / `R12-A8` Web composer 附件 UX、限制与失败恢复
6. `R12-B1` / `R12-B4` 分享、协作与会话访问控制

如果 `R11-D` 被环境阻塞，则按下面的降级顺序切换：

1. `R12-A` 文件上传主链路
2. `R12-C` 执行时间线与历史回源
3. `R13-B` 稳定公网入口与部署硬化

## 13. 2026-03-12 进度快照

当前 `S1-1` / `S1-3` 的推进结论：

- `AC-S1-1-01` 已具备真实持久化认证主链路：
  - 注册、登录、退出已落 PostgreSQL 持久化
  - 会话可跨服务重启复用
  - 登出会真正撤销会话
- `AC-S1-1-03` 已有最小 JIT 创建基础。
- `AC-S1-1-04` 已有最小前端访问边界基础。
- `AC-S1-1-05` 已通过密码策略和测试覆盖。
- `AC-S1-1-B02` 已通过失败锁定和测试覆盖，且锁定状态已持久化。
- `AC-S1-1-07` 已具备邀请激活与过期拒绝能力，且邀请消费状态已持久化。
- `AC-S1-1-06` 已具备最小 TOTP MFA 闭环：
  - 安全页可启用 / 禁用
  - 登录时可返回 `AUTH_MFA_REQUIRED`
  - `/auth/mfa` 可完成二次验证并建立会话
  - MFA factor、setup token 和 login ticket 已持久化
- `AC-S1-1-08` 已具备最小审计事件闭环：
  - 登录成功
  - 登录失败
  - 登出
  - 审计事件查询验证
  - 审计事件已落 PostgreSQL 持久化
- `S1-1` 认证内核已切到 better-auth：
  - 持久化密码账户已写入 `better_auth_accounts`
  - 会话已写入 `better_auth_sessions`
  - 旧 `/auth/*` 合同与前端交互保持稳定
- `S1-3` 已完成第一版 gateway-backed workspace catalog：
  - 目录数据由 gateway 返回
  - 授权应用已由数据库群组授权结果过滤
  - Web 已切到持久化 favorites / recents / default group / launch handoff
- `S1-3` 已完成 `R6-A`：
  - 收藏、最近使用和默认工作群组已落 PostgreSQL
  - `/workspace/apps/launch` 已生成 `handoff_ready` 记录
  - `/apps` 已通过真实 launch contract 进入启动准备态
- `S1-3` 已完成 `R6-B`：
  - launch 会创建真实 `conversation` / `run`
  - 用户会直接进入 `/chat/[conversationId]`
  - 会话页已能读取 app、group、run、trace 基础上下文
- `S2-1` 已完成 `R7`：
  - Gateway 已暴露 `/v1/models`
  - `/v1/chat/completions` 已支持 blocking 与 SSE 响应格式
  - `X-Trace-ID` 已和 launch 创建的 run trace 保持一致
  - chat page 已能发起真实 completion 并回写 run status
- `S1-3` / `S2-*` 仍未完成真实 quota service、消息持久化、渐进式流式渲染与历史列表衔接。
- `S1-2` 已具备第一版角色体系、显式 deny 优先级和用户直授例外授权。
- `S1-2` 已具备 direct user grant 的后台写接口，但仍未完成 Manager 授权路径与 Break-glass。
- `S3-1 / S3-2` 已完成后台第一版治理闭环：
  - `/admin/users`、`/admin/groups`、`/admin/apps`、`/admin/audit` 已接真实数据
  - `/admin/apps` 已支持 direct user allow/deny grant 的创建与撤销
  - 浏览器回归已覆盖后台授权写入后 workspace 可见性变化
- `S3-2` 已完成第一版 run-aware 审计筛选闭环：
  - `/admin/audit` 已支持 query 校验与过滤
  - launch 审计已带 `traceId` / `runId` / `conversationId`
  - `/admin/audit?action=...` 已在浏览器回归中验证
- 后续治理主线已切到 `R11`：
  - 审计导出
  - PII 标记
  - 剩余事件覆盖与更细的合规视图

## 14. 关联文档

- [S1-1 Kickoff](../guides/S1-1_KICKOFF.md)
- `/home/bistu/zyr/pros/agentifui-docs/roadmap/ROADMAP_V1_0.md`
- `/home/bistu/zyr/pros/agentifui-docs/roadmap/PHASE1_BACKLOG.md`
- `/home/bistu/zyr/pros/agentifui-docs/roadmap/PHASE1_ACCEPTANCE.md`
- `/home/bistu/zyr/pros/agentifui-docs/frd/AFUI-FRD-S1-1.md`
