import { useMemo, useState } from 'react';
import { api } from '../api';

// 解析 TSV:每行 front \t back \t example(example 可省略)
function parseTSV(text) {
  const rows = [];
  const bad = [];
  text.split('\n').forEach((line, i) => {
    const t = line.trim();
    if (!t) return;
    const parts = line.split('\t').map((s) => s.trim());
    if (parts.length >= 2 && parts[0] && parts[1]) {
      rows.push({ front: parts[0], back: parts[1], example: parts[2] || '' });
    } else {
      bad.push(i + 1);
    }
  });
  return { rows, bad };
}

export default function Import() {
  const [text, setText] = useState('');
  const [deck, setDeck] = useState('default');
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // {type: 'ok'|'err', text}

  const { rows, bad } = useMemo(() => parseTSV(text), [text]);

  async function submit() {
    if (busy || rows.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const body = rows.map((r) => ({ ...r, example: r.example || undefined, deck: deck.trim() || 'default' }));
      const res = await api('import', { method: 'POST', body });
      setMessage({ type: 'ok', text: `成功导入 ${res.imported} 张卡片 🎉` });
      setText('');
      setPreview(false);
    } catch (err) {
      setMessage({ type: 'err', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>导入</h1>
      </header>

      {!preview ? (
        <>
          <p className="muted">
            粘贴 TSV 文本,每行一张卡片,用 Tab 分隔:<br />
            <code>单词 ⇥ 释义 ⇥ 例句(可省略)</code>
          </p>
          <label className="import-deck-label">
            导入到牌组
            <input className="input" value={deck} onChange={(e) => setDeck(e.target.value)} />
          </label>
          <textarea
            className="input import-textarea"
            placeholder={'apple\t苹果\tAn apple a day keeps the doctor away.\nbanana\t香蕉'}
            value={text}
            onChange={(e) => { setText(e.target.value); setMessage(null); }}
          />
          {text.trim() && (
            <p className="muted">
              识别到 {rows.length} 行有效卡片
              {bad.length > 0 && <span className="error-text">;第 {bad.join(', ')} 行格式有误,将被跳过</span>}
            </p>
          )}
          {message && (
            <p className={message.type === 'ok' ? 'ok-text' : 'error-text'}>{message.text}</p>
          )}
          <button
            className="btn btn-primary btn-big"
            disabled={rows.length === 0}
            onClick={() => setPreview(true)}
          >
            预览 {rows.length > 0 ? `(${rows.length} 张)` : ''}
          </button>
        </>
      ) : (
        <>
          <p className="muted">确认以下 {rows.length} 张卡片将导入牌组「{deck.trim() || 'default'}」:</p>
          <div className="preview-table-wrap">
            <table className="preview-table">
              <thead>
                <tr><th>正面</th><th>背面</th><th>例句</th></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.front}</td>
                    <td>{r.back}</td>
                    <td className="muted">{r.example}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {message && (
            <p className={message.type === 'ok' ? 'ok-text' : 'error-text'}>{message.text}</p>
          )}
          <div className="form-actions">
            <button className="btn btn-big" onClick={() => setPreview(false)} disabled={busy}>返回修改</button>
            <button className="btn btn-primary btn-big" onClick={submit} disabled={busy}>
              {busy ? '导入中…' : '确认导入'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
