# AgentifUI

从零开始搭建的 AgentifUI monorepo 基座。

这个仓库对齐 `/home/bistu/zyr/pros/agentifui-docs` 中已经冻结的技术方向：

- 前端：Next.js 16 + React 19 + TypeScript
- 后端：Fastify 5
- 数据：PostgreSQL 18 + Redis 7
- 工程结构：`apps/*` + `packages/*` 的 pnpm workspace monorepo

## 当前状态

当前仓库只包含最小骨架，目标是为 `S1-1 多租户身份认证基座` 提供一条干净的起跑线。

- `apps/web`：前端最小 App Router 入口
- `apps/gateway`：Fastify 健康检查入口
- `packages/shared`：共享类型占位
- `packages/ui`：共享 UI 包占位
- `packages/db`：数据库包占位
- `docs/guides/S1-1_KICKOFF.md`：S1-1 开发切入清单

## 快速开始

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

默认端口：

- Web: `http://localhost:3000`
- Gateway: `http://localhost:4000/health`

## 建议的下一步

1. 在 `packages/db` 建立 S1-1 所需的租户、群组、用户和邀请相关 schema。
2. 在 `apps/gateway` 接入 better-auth，并落第一批 `/auth/*` 接口。
3. 在 `apps/web` 先完成 `/login` 和 `/register` 的最小闭环。
4. 在此基础上继续补 `JIT`、`pending 状态`、`MFA`、`邀请激活` 和 `审计事件`。
