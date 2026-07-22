// 以下划线开头的文件不会被 Pages 注册为路由,仅作共享工具

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function badRequest(message) {
  return json({ error: message }, 400);
}

// 返回 YYYY-MM-DD 格式的今天(UTC)
export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function nowISO() {
  return new Date().toISOString();
}

// 今天 + n 天,YYYY-MM-DD
export function addDays(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
