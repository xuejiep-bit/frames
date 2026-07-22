import { useEffect, useState } from 'react';
import { api } from '../api';

const RATINGS = [
  { quality: 0, label: '重来', hint: '完全忘了', cls: 'rate-again' },
  { quality: 3, label: '困难', hint: '很勉强', cls: 'rate-hard' },
  { quality: 4, label: '一般', hint: '想了一下', cls: 'rate-good' },
  { quality: 5, label: '简单', hint: '脱口而出', cls: 'rate-easy' },
];

export default function Review() {
  const [queue, setQueue] = useState(null);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    setQueue(null);
    setDone(0);
    setFlipped(false);
    try {
      const list = await api('cards?due=today');
      setQueue(list);
      setTotal(list.length);
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => { load(); }, []);

  const current = queue && queue.length > 0 ? queue[0] : null;

  async function rate(quality) {
    if (busy || !current) return;
    setBusy(true);
    setError('');
    try {
      await api('review', { method: 'POST', body: { id: current.id, quality } });
      setQueue((q) => {
        const rest = q.slice(1);
        // 「重来」的卡片排到本次队列末尾,直到答对为止(类似 Anki)
        return quality === 0 ? [...rest, q[0]] : rest;
      });
      if (quality !== 0) setDone((d) => d + 1);
      setFlipped(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page review-page">
      <header className="page-header">
        <h1>复习</h1>
        {total > 0 && queue && (
          <span className="review-progress">{done} / {total}</span>
        )}
      </header>

      {error && <p className="error-text">{error}</p>}
      {queue === null && !error && <p className="muted">加载中…</p>}

      {queue !== null && !current && (
        <div className="review-done">
          <div className="review-done-icon">🎉</div>
          {total === 0 ? (
            <>
              <h2>今天没有要复习的卡片</h2>
              <p className="muted">去「导入」或「卡片」页添加一些单词吧</p>
            </>
          ) : (
            <>
              <h2>今日复习完成!</h2>
              <p className="muted">共复习 {total} 张卡片,明天见 👋</p>
            </>
          )}
          <button className="btn btn-big" onClick={load}>刷新</button>
        </div>
      )}

      {current && (
        <>
          <div
            className={`review-card ${flipped ? 'review-card-flipped' : ''}`}
            onClick={() => !flipped && setFlipped(true)}
          >
            <div className="review-front">{current.front}</div>
            {flipped ? (
              <div className="review-back">
                <div className="review-back-text">{current.back}</div>
                {current.example && <div className="review-example">{current.example}</div>}
              </div>
            ) : (
              <div className="review-tap-hint">点击查看答案</div>
            )}
            <div className="review-deck-tag">{current.deck}</div>
          </div>

          {flipped ? (
            <div className="rate-row">
              {RATINGS.map((r) => (
                <button
                  key={r.quality}
                  className={`rate-btn ${r.cls}`}
                  disabled={busy}
                  onClick={() => rate(r.quality)}
                >
                  <span className="rate-label">{r.label}</span>
                  <span className="rate-hint">{r.hint}</span>
                </button>
              ))}
            </div>
          ) : (
            <button className="btn btn-primary btn-big show-answer-btn" onClick={() => setFlipped(true)}>
              显示答案
            </button>
          )}
        </>
      )}
    </div>
  );
}
