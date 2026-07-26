import { json, badRequest, addDays, nowISO } from './_utils.js';

// 标准 SM-2:
// - quality < 3:repetitions 归 0,interval = 1,lapses + 1,ease_factor 不变
// - quality >= 3:repetitions 0 → interval 1;1 → 6;否则 round(interval × EF);repetitions + 1
//   EF = EF + (0.1 - (5-q) × (0.08 + (5-q) × 0.02)),下限 1.3
export function sm2(card, quality) {
  let { interval, ease_factor, repetitions, lapses } = card;

  if (quality < 3) {
    repetitions = 0;
    interval = 1;
    lapses += 1;
  } else {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * ease_factor);
    repetitions += 1;

    ease_factor = ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (ease_factor < 1.3) ease_factor = 1.3;
  }

  return { interval, ease_factor, repetitions, lapses, due_date: addDays(interval) };
}

// POST /api/review  {id, quality}  quality ∈ {0, 3, 4, 5}
export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest('invalid json');
  }
  const { id, quality } = body || {};
  if (!id) return badRequest('id is required');
  if (![0, 3, 4, 5].includes(quality)) return badRequest('quality must be 0, 3, 4 or 5');

  const card = await env.DB.prepare(
    'SELECT * FROM cards WHERE id = ? AND deleted = 0'
  ).bind(id).first();
  if (!card) return json({ error: 'not found' }, 404);

  const next = sm2(card, quality);
  const updated_at = nowISO();

  await env.DB.prepare(
    `UPDATE cards SET interval = ?, ease_factor = ?, repetitions = ?, lapses = ?, due_date = ?, updated_at = ?
     WHERE id = ?`
  ).bind(
    next.interval, next.ease_factor, next.repetitions, next.lapses,
    next.due_date, updated_at, id
  ).run();

  return json({ ...card, ...next, updated_at });
}
