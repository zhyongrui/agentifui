# AgentifUI

从零开始搭建的 AgentifUI monorepo 基座。

这个仓库对齐 `/home/bistu/zyr/pros/agentifui-docs` 中已经冻结的技术方向：

- 前端：Next.js 16 + React 19 + TypeScript
- 后端：Fastify 5
- 数据：PostgreSQL 18 + Redis 7
- 工程结构：`apps/*` + `packages/*` 的 monorepo（当前以 npm workspace 启动）

## 当前状态

当前仓库已经完成 `M0` 的第一轮收口，并开始进入 `S1-1` 的认证契约阶段。

- `apps/web`：已具备 `(auth)`、`(main)`、`(admin)` 路由骨架，以及 `pending`、`invite accept`、`security` 占位页
- `apps/gateway`：已具备插件化入口、环境配置、健康检查和 `/auth/*` 路由骨架
- `packages/shared`：已具备 auth DTO、错误码和密码策略校验
- `packages/ui`：共享 UI 包占位
- `packages/db`：已具备 Drizzle 配置和 `S1-1` 初始 schema
- `docs/plans/PHASE1_DEVELOPMENT_PLAN.md`：基于设计文档整理的实施计划
- `docs/guides/S1-1_KICKOFF.md`：S1-1 开发切入清单
- `docs/dev-log/`：按天记录的开发日志

## 快速开始

```bash
npm install
cp .env.example .env.local
npm run dev
```

默认端口：

- Web: `http://localhost:3000`
- Gateway: `http://localhost:4000/health`

测试：

```bash
npm test
```

## 建议的下一步

1. 在 `packages/db` 建立 S1-1 所需的租户、群组、用户和邀请相关 schema。
2. 在 `apps/gateway` 接入 better-auth，并把 `/auth/login`、`/auth/register` 从契约骨架推进到真实持久化逻辑。
3. 在 `apps/web` 把 `/login`、`/register`、`/auth/pending` 接到真实 auth 接口。
4. 在此基础上继续补 `JIT`、`MFA`、`邀请激活` 和 `审计事件`。
