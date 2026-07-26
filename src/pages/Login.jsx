import { useState } from 'react';
import { authenticate } from '../api';

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isRegister = mode === 'register';

  async function submit(e) {
    e.preventDefault();
    if (busy || !username.trim() || !password) return;
    setBusy(true);
    setError('');
    try {
      const user = await authenticate(mode, {
        username: username.trim(),
        password,
        code: code.trim() || undefined,
      });
      onLogin(user);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  function switchMode() {
    setMode(isRegister ? 'login' : 'register');
    setError('');
  }

  return (
    <div className="login-page">
      <div className="login-logo">记</div>
      <h1>背单词</h1>
      <p className="muted">{isRegister ? '创建你自己的账户' : '登录你的账户'}</p>

      <form onSubmit={submit} className="login-form">
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="用户名"
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
          className="input"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={isRegister ? '设置密码(至少 6 位)' : '密码'}
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          className="input"
        />
        {isRegister && (
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="邀请码(没有就留空)"
            autoCapitalize="none"
            autoCorrect="off"
            className="input"
          />
        )}
        {error && <p className="error-text">{error}</p>}
        <button
          type="submit"
          className="btn btn-primary btn-big"
          disabled={busy || !username.trim() || !password}
        >
          {busy ? '请稍候…' : isRegister ? '注册并进入' : '登录'}
        </button>
      </form>

      <button type="button" className="link-btn" onClick={switchMode}>
        {isRegister ? '已有账户?去登录' : '还没有账户?去注册'}
      </button>
    </div>
  );
}
