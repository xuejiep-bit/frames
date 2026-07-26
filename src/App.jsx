import { useEffect, useState } from 'react';
import { fetchMe } from './api';
import Login from './pages/Login';
import Review from './pages/Review';
import Cards from './pages/Cards';
import Import from './pages/Import';
import Settings from './pages/Settings';

const TABS = [
  { key: 'review', label: '复习', icon: '📖' },
  { key: 'cards', label: '卡片', icon: '🗂' },
  { key: 'import', label: '导入', icon: '📥' },
  { key: 'settings', label: '设置', icon: '⚙️' },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState('review');

  // 启动时用本地 token 换用户,换到就直接进主页
  useEffect(() => {
    fetchMe().then((u) => {
      setUser(u);
      setChecking(false);
    });
  }, []);

  // api.js 在收到 401 时广播此事件,回到登录页
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener('auth-expired', onExpired);
    return () => window.removeEventListener('auth-expired', onExpired);
  }, []);

  if (checking) {
    return (
      <div className="login-page">
        <div className="login-logo">记</div>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={(u) => { setUser(u); setTab('review'); }} />;
  }

  return (
    <div className="app">
      <main className="app-main">
        {tab === 'review' && <Review key={tab} />}
        {tab === 'cards' && <Cards />}
        {tab === 'import' && <Import />}
        {tab === 'settings' && <Settings user={user} onLogout={() => setUser(null)} />}
      </main>
      <nav className="tab-bar">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab-btn ${tab === t.key ? 'tab-active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <span className="tab-icon">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
