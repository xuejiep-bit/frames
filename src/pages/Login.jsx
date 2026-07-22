import { useState } from 'react';
import { setPassword } from '../api';

export default function Login({ onLogin }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!pw || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      if (!res.ok) {
        setError(res.status === 401 ? '密码不对' : `出错了 (${res.status})`);
        return;
      }
      setPassword(pw);
      onLogin();
    } catch {
      setError('网络错误,请重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-logo">记</div>
      <h1>背单词</h1>
      <form onSubmit={submit} className="login-form">
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="输入密码"
          autoFocus
          className="input"
        />
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="btn btn-primary btn-big" disabled={busy || !pw}>
          {busy ? '验证中…' : '进入'}
        </button>
      </form>
    </div>
  );
}
