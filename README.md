# AgentifUI

从零开始搭建的 AgentifUI monorepo 基座。

这个仓库对齐 `/home/bistu/zyr/pros/agentifui-docs` 中已经冻结的技术方向：

- 前端：Next.js 16 + React 19 + TypeScript
- 后端：Fastify 5
- 数据：PostgreSQL 18 + Redis 7
- 工程结构：`apps/*` + `packages/*` 的 monorepo（当前以 npm workspace 启动）

## 当前状态

当前仓库已经完成 `M0` 收口，并进入 `S1-1` 的真实认证实现阶段。

- `apps/web`：已具备 `(auth)`、`(main)`、`(admin)` 路由骨架，以及 `pending`、`invite accept`、`security` 占位页
- `apps/gateway`：已具备插件化入口、环境配置、健康检查，以及 DB-backed 的 `/auth/*` 认证、MFA、邀请和审计链路
- `packages/shared`：已具备 auth DTO、错误码和密码策略校验
- `packages/ui`：共享 UI 包占位
- `packages/db`：已具备 schema、迁移目录、运行时连接封装和 `db:reset` / `db:migrate` 脚本
- `docs/plans/PHASE1_DEVELOPMENT_PLAN.md`：基于设计文档整理的实施计划
- `docs/guides/S1-1_KICKOFF.md`：S1-1 开发切入清单
- `docs/dev-log/`：按天记录的开发日志

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

1. 在 `apps/gateway` 的持久化认证边界上接入 `better-auth`，收口 `R4-B`。
2. 在 `S1-2` 开始固化 RBAC 的持久化来源，替换工作台当前的内存授权映射。
3. 在 `S1-3` 继续推进真实应用启动链路和真实会话创建。
