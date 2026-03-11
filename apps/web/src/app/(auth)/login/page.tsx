export default function LoginPage() {
  return (
    <section className="panel">
      <span className="eyebrow">S1-1</span>
      <h1>Login</h1>
      <p className="lead">
        从这里开始实现邮箱密码登录、SSO 域名识别、待审核状态和 MFA。
      </p>

      <div className="stack">
        <label className="field">
          <span>Email</span>
          <input type="email" placeholder="name@company.com" />
        </label>

        <label className="field">
          <span>Password</span>
          <input type="password" placeholder="••••••••" />
        </label>

        <button className="primary" type="button">
          Continue
        </button>
      </div>
    </section>
  );
}
