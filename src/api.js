// 密码只存 sessionStorage(仅作登录凭证,业务数据一律走 D1)
const KEY = 'app_password';

export function getPassword() {
  return sessionStorage.getItem(KEY);
}
export function setPassword(pw) {
  sessionStorage.setItem(KEY, pw);
}
export function clearPassword() {
  sessionStorage.removeItem(KEY);
}

// 统一请求封装:自动带 X-Auth,401 时广播事件让 App 回到登录页
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      'X-Auth': getPassword() || '',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    clearPassword();
    window.dispatchEvent(new Event('auth-expired'));
    throw new Error('密码已失效,请重新登录');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || `请求失败 (${res.status})`);
  return data;
}
