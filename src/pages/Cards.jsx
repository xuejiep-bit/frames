import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';

function CardForm({ card, decks, onSave, onCancel, onDelete }) {
  const [front, setFront] = useState(card ? card.front : '');
  const [back, setBack] = useState(card ? card.back : '');
  const [example, setExample] = useState(card && card.example ? card.example : '');
  const [deck, setDeck] = useState(card ? card.deck : decks[0] || 'default');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await onSave({ front, back, example, deck });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-mask" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{card ? '编辑卡片' : '新建卡片'}</h2>
        <form onSubmit={save} className="card-form">
          <label>
            正面(单词/词组)
            <input className="input" value={front} onChange={(e) => setFront(e.target.value)} autoFocus required />
          </label>
          <label>
            背面(释义)
            <textarea className="input" rows={2} value={back} onChange={(e) => setBack(e.target.value)} required />
          </label>
          <label>
            例句(可选)
            <textarea className="input" rows={2} value={example} onChange={(e) => setExample(e.target.value)} />
          </label>
          <label>
            牌组
            <input className="input" value={deck} onChange={(e) => setDeck(e.target.value)} list="deck-options" />
            <datalist id="deck-options">
              {decks.map((d) => <option key={d} value={d} />)}
            </datalist>
          </label>
          {error && <p className="error-text">{error}</p>}
          <div className="form-actions">
            <button type="button" className="btn" onClick={onCancel}>取消</button>
            {card && (
              <button type="button" className="btn btn-danger" onClick={onDelete}>删除</button>
            )}
            <button type="submit" className="btn btn-primary" disabled={busy || !front.trim() || !back.trim()}>
              {busy ? '保存中…' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Cards() {
  const [cards, setCards] = useState(null);
  const [search, setSearch] = useState('');
  const [deckFilter, setDeckFilter] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | card 对象
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      setCards(await api('cards'));
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => { load(); }, []);

  const decks = useMemo(
    () => [...new Set((cards || []).map((c) => c.deck))].sort(),
    [cards]
  );

  const shown = useMemo(() => {
    let list = cards || [];
    if (deckFilter) list = list.filter((c) => c.deck === deckFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.front.toLowerCase().includes(q) ||
          c.back.toLowerCase().includes(q) ||
          (c.example || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [cards, search, deckFilter]);

  async function handleSave(fields) {
    if (editing === 'new') {
      await api('cards', { method: 'POST', body: fields });
    } else {
      await api('cards', { method: 'PUT', body: { id: editing.id, ...fields } });
    }
    setEditing(null);
    load();
  }

  async function handleDelete() {
    if (!window.confirm(`删除「${editing.front}」?`)) return;
    await api(`cards?id=${encodeURIComponent(editing.id)}`, { method: 'DELETE' });
    setEditing(null);
    load();
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>卡片</h1>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>＋ 新建</button>
      </header>

      <input
        className="input search-input"
        placeholder="搜索单词、释义、例句…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {decks.length > 1 && (
        <div className="chip-row">
          <button className={`chip ${deckFilter === '' ? 'chip-active' : ''}`} onClick={() => setDeckFilter('')}>
            全部
          </button>
          {decks.map((d) => (
            <button key={d} className={`chip ${deckFilter === d ? 'chip-active' : ''}`} onClick={() => setDeckFilter(d)}>
              {d}
            </button>
          ))}
        </div>
      )}

      {error && <p className="error-text">{error}</p>}
      {cards === null && !error && <p className="muted">加载中…</p>}
      {cards !== null && shown.length === 0 && <p className="muted">没有卡片</p>}

      <ul className="card-list">
        {shown.map((c) => (
          <li key={c.id} className="card-item" onClick={() => setEditing(c)}>
            <div className="card-item-main">
              <span className="card-item-front">{c.front}</span>
              <span className="card-item-back">{c.back}</span>
            </div>
            <div className="card-item-meta">
              <span>{c.deck}</span>
              <span>到期 {c.due_date}</span>
            </div>
          </li>
        ))}
      </ul>
      {cards !== null && <p className="muted count-text">共 {shown.length} 张</p>}

      {editing && (
        <CardForm
          card={editing === 'new' ? null : editing}
          decks={decks}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
