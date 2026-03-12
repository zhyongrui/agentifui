# AgentifUI

从零开始搭建的 AgentifUI monorepo 基座。

这个仓库对齐 `/home/bistu/zyr/pros/agentifui-docs` 中已经冻结的技术方向：

- 前端：Next.js 16 + React 19 + TypeScript
- 后端：Fastify 5
- 数据：PostgreSQL 18 + Redis 7
- 工程结构：`apps/*` + `packages/*` 的 monorepo（当前以 npm workspace 启动）

## 当前状态

当前仓库已经完成 `M0` 收口，并进入 `S1-2 / S1-3` 的真实授权与工作台落地阶段。

- `apps/web`：已具备 `(auth)`、`(main)`、`(admin)` 路由骨架，以及 `pending`、`invite accept`、`security` 占位页
- `apps/gateway`：已具备插件化入口、环境配置、健康检查，以及 DB-backed 的 `/auth/*` 认证、MFA、邀请、审计和工作台授权链路
- `packages/shared`：已具备 auth DTO、错误码和密码策略校验
- `packages/ui`：共享 UI 包占位
- `packages/db`：已具备 schema、迁移目录、运行时连接封装和 `db:reset` / `db:migrate` 脚本，包含 better-auth 与工作台授权表
- `docs/plans/PHASE1_DEVELOPMENT_PLAN.md`：基于设计文档整理的实施计划
- `docs/guides/S1-1_KICKOFF.md`：S1-1 开发切入清单
- `docs/dev-log/`：按天记录的开发日志

当前已落地的关键能力：

- better-auth 已作为网关内部认证内核接管密码校验、会话创建、会话查找和登出撤销，现有 `/auth/*` 合同保持不变
- `/workspace/apps` 已改为 PostgreSQL-backed 授权目录，不再依赖纯内存授权映射
- `/workspace/apps` 已支持基于数据库的角色授权、用户直授和显式 `deny` 优先级
- 默认 `admin*` 邮箱用户会获得 `tenant_admin` 角色，并看到 `Tenant Control` 管理入口
- 默认工作群组成员关系会在用户首次进入工作台时落库，普通用户与安全用户会看到不同的应用集合
- Web 端继续通过同源 `/api/gateway/*` 代理访问网关，适配本机和公网预览
- `@agentifui/db` 与 `@agentifui/shared` 已导出可直接被 Node 运行时消费的 `dist` 入口，`npm run start --workspace @agentifui/gateway` 可用

## 快速开始

```bash
npm install
cp .env.example .env
npm run db:reset
npm run dev
```

默认端口：

- Web: `http://localhost:3000`
- Gateway: `http://localhost:4000/health`

本地数据库默认使用：

```bash
DATABASE_URL=postgresql://agentifui:agentifui@localhost:5432/agentifui
```

测试：

```bash
npm test
```

数据库脚本：

```bash
npm run db:migrate
npm run db:reset
```

公网或远程浏览器访问时，Web 会通过同源 `/api/gateway/*` 代理转发到 `GATEWAY_INTERNAL_URL`，默认是 `http://127.0.0.1:4000`。

## 建议的下一步

1. 在 `S1-3` 推进真实应用启动链路、最近使用/收藏持久化和真实会话创建。
2. 在 `S1-2` 补 Manager 授权边界、Break-glass 和授权管理写接口。
3. 在 `S2-1` 启动统一网关协议、Trace ID 和错误结构收口。
