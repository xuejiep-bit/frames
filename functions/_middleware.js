// 统一鉴权中间件:除 /api/auth 外,所有 API 请求必须带 X-Auth 头且等于 APP_PASSWORD
export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  if (!url.pathname.startsWith('/api/') || url.pathname === '/api/auth') {
    return next();
  }

  const auth = request.headers.get('X-Auth');
  if (!env.APP_PASSWORD || auth !== env.APP_PASSWORD) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return next();
}
