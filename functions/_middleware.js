import { getSessionUser } from './api/_utils.js';

// 统一鉴权:除 /api/auth 外,所有 API 请求必须带有效的 X-Auth 会话 token。
// 校验通过后把当前用户放进 data.user,供各接口按 user_id 隔离数据。
export async function onRequest(context) {
  const { request, env, next, data } = context;
  const url = new URL(request.url);

  if (!url.pathname.startsWith('/api/') || url.pathname === '/api/auth') {
    return next();
  }

  const user = await getSessionUser(env, request.headers.get('X-Auth'));
  if (!user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  data.user = user;
  return next();
}
