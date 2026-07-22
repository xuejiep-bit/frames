import { json, badRequest, today, nowISO } from './_utils.js';

// GET /api/cards           全部未删除卡片
// GET /api/cards?deck=xxx  按牌组筛选
// GET /api/cards?due=today 今日到期(due_date <= 今天)
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const deck = url.searchParams.get('deck');
  const due = url.searchParams.get('due');

  let sql = 'SELECT * FROM cards WHERE deleted = 0';
  const params = [];
  if (deck) {
    sql += ' AND deck = ?';
    params.push(deck);
  }
  if (due === 'today') {
    sql += ' AND due_date <= ?';
    params.push(today());
  }
  sql += ' ORDER BY due_date ASC, created_at ASC';

  const { results } = await env.DB.prepare(sql).bind(...params).all();
  return json(results);
}

// POST /api/cards  新建卡片 {front, back, example?, deck?}
export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest('invalid json');
  }
  const { front, back, example = null, deck = 'default' } = body || {};
  if (!front || !back) return badRequest('front and back are required');

  const now = nowISO();
  const card = {
    id: crypto.randomUUID(),
    front: String(front).trim(),
    back: String(back).trim(),
    example: example ? String(example).trim() : null,
    deck: String(deck).trim() || 'default',
    due_date: today(),
    interval: 0,
    ease_factor: 2.5,
    repetitions: 0,
    lapses: 0,
    created_at: now,
    updated_at: now,
    deleted: 0,
  };

  await env.DB.prepare(
    `INSERT INTO cards (id, front, back, example, deck, due_date, interval, ease_factor, repetitions, lapses, created_at, updated_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    card.id, card.front, card.back, card.example, card.deck, card.due_date,
    card.interval, card.ease_factor, card.repetitions, card.lapses,
    card.created_at, card.updated_at, card.deleted
  ).run();

  return json(card, 201);
}

// PUT /api/cards  更新卡片 {id, front?, back?, example?, deck?}
export async function onRequestPut({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest('invalid json');
  }
  const { id, front, back, example, deck } = body || {};
  if (!id) return badRequest('id is required');

  const existing = await env.DB.prepare(
    'SELECT * FROM cards WHERE id = ? AND deleted = 0'
  ).bind(id).first();
  if (!existing) return json({ error: 'not found' }, 404);

  const updated = {
    front: front !== undefined ? String(front).trim() : existing.front,
    back: back !== undefined ? String(back).trim() : existing.back,
    example: example !== undefined ? (example ? String(example).trim() : null) : existing.example,
    deck: deck !== undefined ? (String(deck).trim() || 'default') : existing.deck,
  };
  if (!updated.front || !updated.back) return badRequest('front and back cannot be empty');

  await env.DB.prepare(
    'UPDATE cards SET front = ?, back = ?, example = ?, deck = ?, updated_at = ? WHERE id = ?'
  ).bind(updated.front, updated.back, updated.example, updated.deck, nowISO(), id).run();

  return json({ ...existing, ...updated, updated_at: nowISO() });
}

// DELETE /api/cards?id=xxx  软删除
export async function onRequestDelete({ request, env }) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return badRequest('id is required');

  const { meta } = await env.DB.prepare(
    'UPDATE cards SET deleted = 1, updated_at = ? WHERE id = ? AND deleted = 0'
  ).bind(nowISO(), id).run();

  if (!meta.changes) return json({ error: 'not found' }, 404);
  return json({ ok: true });
}
