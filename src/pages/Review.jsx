import { useEffect, useState } from 'react';
import { api } from '../api';

// 占位:第 3 步实现完整复习流程(翻转 + 四档评分 + SM-2)
export default function Review() {
  const [due, setDue] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('cards?due=today')
      .then((list) => setDue(list.length))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="page">
      <header className="page-header">
        <h1>复习</h1>
      </header>
      {error && <p className="error-text">{error}</p>}
      {due !== null && <p className="muted">今日待复习:{due} 张(复习流程第 3 步上线)</p>}
    </div>
  );
}
