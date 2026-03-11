export default function RegisterPage() {
  return (
    <section className="panel">
      <span className="eyebrow">S1-1</span>
      <h1>Register</h1>
      <p className="lead">这里作为租户内注册、邀请激活和密码策略校验的起点。</p>

      <div className="stack">
        <label className="field">
          <span>Email</span>
          <input type="email" placeholder="name@company.com" />
        </label>

        <label className="field">
          <span>Password</span>
          <input type="password" placeholder="Create a strong password" />
        </label>

        <button className="primary" type="button">
          Create account
        </button>
      </div>
    </section>
  );
}
