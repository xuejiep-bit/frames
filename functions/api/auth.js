import { json, badRequest } from './_utils.js';

// POST /api/auth  {password}  校验密码(此路由被 _middleware.js 豁免)
export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest('invalid json');
  }
  const { password } = body || {};
  if (!env.APP_PASSWORD || password !== env.APP_PASSWORD) {
    return json({ error: 'wrong password' }, 401);
  }
  return json({ ok: true });
}
