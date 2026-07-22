import { json, badRequest, today, nowISO } from './_utils.js';

// POST /api/import  批量导入
// 请求体:[{front, back, example?, deck?}, ...]
// D1 的 batch() 在单个隐式事务中执行,要么全部成功要么全部回滚
export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest('invalid json');
  }
  if (!Array.isArray(body) || body.length === 0) {
    return badRequest('expected a non-empty array');
  }
  if (body.length > 1000) {
    return badRequest('too many cards in one import (max 1000)');
  }

  const now = nowISO();
  const due = today();
  const stmt = env.DB.prepare(
    `INSERT INTO cards (id, front, back, example, deck, due_date, interval, ease_factor, repetitions, lapses, created_at, updated_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, 0, 2.5, 0, 0, ?, ?, 0)`
  );

  const statements = [];
  for (const item of body) {
    const front = item && item.front ? String(item.front).trim() : '';
    const back = item && item.back ? String(item.back).trim() : '';
    if (!front || !back) {
      return badRequest('every card needs front and back');
    }
    const example = item.example ? String(item.example).trim() : null;
    const deck = item.deck ? String(item.deck).trim() : 'default';
    statements.push(
      stmt.bind(crypto.randomUUID(), front, back, example, deck, due, now, now)
    );
  }

  await env.DB.batch(statements);
  return json({ ok: true, imported: statements.length }, 201);
}
