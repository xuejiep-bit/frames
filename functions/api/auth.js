import {
  json, badRequest, nowISO, randomHex, hashPassword,
  timingSafeEqual, sessionExpiry, getSessionUser,
} from './_utils.js';

// 此路由被 _middleware.js 豁免,内部自行校验

// GET /api/auth  用 X-Auth token 换取当前用户(前端启动时判断是否已登录)
export async function onRequestGet({ request, env }) {
  const user = await getSessionUser(env, request.headers.get('X-Auth'));
  if (!user) return json({ error: 'unauthorized' }, 401);
  return json({ user });
}

// POST /api/auth  {action: 'register' | 'login' | 'logout', username, password, code?}
export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest('invalid json');
  }
  const { action } = body || {};

  if (action === 'logout') {
    const token = request.headers.get('X-Auth');
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return json({ ok: true });
  }

  const username = String((body && body.username) || '').trim();
  const password = String((body && body.password) || '');

  if (action === 'register') {
    if (username.length < 2 || username.length > 24) {
      return badRequest('用户名需要 2-24 个字符');
    }
    if (/\s/.test(username)) return badRequest('用户名不能包含空格');
    if (password.length < 6) return badRequest('密码至少 6 位');

    // 设了 SIGNUP_CODE 环境变量则注册需要邀请码,不设则开放注册
    if (env.SIGNUP_CODE && String((body && body.code) || '') !== env.SIGNUP_CODE) {
      return json({ error: '邀请码不正确' }, 403);
    }

    const exists = await env.DB.prepare('SELECT id FROM users WHERE username = ?')
      .bind(username).first();
    if (exists) return json({ error: '用户名已被占用' }, 409);

    const salt = randomHex(16);
    const password_hash = await hashPassword(password, salt);
    const id = crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO users (id, username, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, username, password_hash, salt, nowISO()).run();

    return json({ token: await createSession(env, id), user: { id, username } }, 201);
  }

  if (action === 'login') {
    if (!username || !password) return badRequest('请输入用户名和密码');

    const row = await env.DB.prepare(
      'SELECT id, username, password_hash, salt FROM users WHERE username = ?'
    ).bind(username).first();
    if (!row) return json({ error: '用户名或密码不正确' }, 401);

    const hash = await hashPassword(password, row.salt);
    if (!timingSafeEqual(hash, row.password_hash)) {
      return json({ error: '用户名或密码不正确' }, 401);
    }

    return json({
      token: await createSession(env, row.id),
      user: { id: row.id, username: row.username },
    });
  }

  return badRequest('unknown action');
}

async function createSession(env, userId) {
  const token = randomHex(32);
  await env.DB.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(token, userId, nowISO(), sessionExpiry()).run();
  return token;
}
