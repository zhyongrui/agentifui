# S1-1 Kickoff

`S1-1` 是当前文档定义里的第一个实施切片：`多租户身份认证基座`。

## 先做什么

先做骨架级必需项，不要一开始就碰聊天、网关聚合或管理后台复杂能力。

1. 冻结数据模型
2. 冻结 `/auth/*` 基础契约
3. 打通邮箱密码登录闭环
4. 增加 SSO 域名识别入口
5. 落用户状态机
6. 补邀请、MFA、审计

## 建议的开发顺序

### 1. 数据层

先建立这些核心实体：

- `tenants`
- `groups`
- `users`
- `group_members`
- `auth_identities`
- `invitations`
- `audit_events`
- `mfa_factors`

### 2. Gateway

优先实现这些最小接口：

- `POST /auth/login`
- `POST /auth/register`
- `POST /auth/sso/discovery`
- `POST /auth/invitations/accept`
- `POST /auth/mfa/verify`
- `POST /auth/logout`

### 3. Web

优先落这些页面和状态：

- `/login`
- `/register`
- `/pending-approval`
- `/invite/accept`
- `/settings/security`

### 4. 验收顺序

按文档里的 S1-1 验收项推进：

1. 邮箱密码登录
2. SSO 域名识别
3. JIT 用户创建 + 待审核
4. 待审核用户访问受限
5. 密码策略校验
6. MFA 配置与验证
7. 邀请链接有效期
8. 登录登出审计

## 当前仓库里建议你先开的三个任务

1. 在 `packages/db` 补第一版 schema 和迁移结构。
2. 在 `apps/gateway` 建 auth 模块与 `/health` 之外的首批路由。
3. 在 `apps/web` 建 `(auth)` 路由组和登录注册页面。
