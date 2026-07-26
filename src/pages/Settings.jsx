import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';

export default function Settings() {
  const [cards, setCards] = useState(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(null);

  async function load() {
    try {
      setCards(await api('cards'));
    } catch (err) {
      setMessage({ type: 'err', text: err.message });
    }
  }
  useEffect(() => { load(); }, []);

  const decks = useMemo(() => {
    const map = new Map();
    (cards || []).forEach((c) => map.set(c.deck, (map.get(c.deck) || 0) + 1));
    return [...map.entries()].sort();
  }, [cards]);

  async function exportJSON() {
    setBusy('export');
    setMessage(null);
    try {
      const res = await fetch('/api/export');
      if (!res.ok) throw new Error(`导出失败 (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cards-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setMessage({ type: 'err', text: err.message });
    } finally {
      setBusy('');
    }
  }

  // 重命名牌组 = 逐张 PUT 该牌组下的卡片(个人使用数据量小,足够了)
  async function renameDeck(oldName) {
    const newName = window.prompt(`把牌组「${oldName}」重命名为:`, oldName);
    if (!newName || newName.trim() === oldName) return;
    setBusy(oldName);
    setMessage(null);
    try {
      const targets = cards.filter((c) => c.deck === oldName);
      for (const c of targets) {
        await api('cards', { method: 'PUT', body: { id: c.id, deck: newName.trim() } });
      }
      setMessage({ type: 'ok', text: `已把 ${targets.length} 张卡片移到「${newName.trim()}」` });
      load();
    } catch (err) {
      setMessage({ type: 'err', text: err.message });
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>设置</h1>
      </header>

      <section className="settings-section">
        <h2>备份</h2>
        <button className="btn btn-primary btn-big" onClick={exportJSON} disabled={busy === 'export'}>
          {busy === 'export' ? '导出中…' : '导出全部卡片 (JSON)'}
        </button>
      </section>

      <section className="settings-section">
        <h2>牌组</h2>
        {cards === null && <p className="muted">加载中…</p>}
        {cards !== null && decks.length === 0 && <p className="muted">还没有卡片</p>}
        <ul className="deck-list">
          {decks.map(([name, count]) => (
            <li key={name} className="deck-item">
              <span className="deck-name">{name}</span>
              <span className="muted">{count} 张</span>
              <button className="btn btn-small" onClick={() => renameDeck(name)} disabled={!!busy}>
                {busy === name ? '处理中…' : '重命名'}
              </button>
            </li>
          ))}
        </ul>
        <p className="muted">牌组在新建/导入卡片时随写随建,不需要单独创建。</p>
      </section>

      {message && (
        <p className={message.type === 'ok' ? 'ok-text' : 'error-text'}>{message.text}</p>
      )}
    </div>
  );
}
