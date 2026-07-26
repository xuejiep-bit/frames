import { json } from './_utils.js';

// GET /api/export  返回全部未删除卡片的 JSON(用作备份)
export async function onRequestGet({ env, data }) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM cards WHERE user_id = ? AND deleted = 0 ORDER BY created_at ASC'
  ).bind(data.user.id).all();

  return new Response(JSON.stringify(results, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="cards-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
