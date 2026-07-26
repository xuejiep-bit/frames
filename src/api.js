// 会话 token 存 localStorage:一次登录长期有效(180 天),关浏览器/重启手机都不用重输。
// 业务数据一律走 D1,本地只放这个凭证。
const KEY = 'auth_token';

export function getToken() {
  return localStorage.getItem(KEY);
}
export function setToken(t) {
  localStorage.setItem(KEY, t);
}
export function clearToken() {
  localStorage.removeItem(KEY);
}

// 统一请求封装:自动带 X-Auth,401 时广播事件让 App 回到登录页
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      'X-Auth': getToken() || '',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new Event('auth-expired'));
    throw new Error('登录已过期,请重新登录');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || `请求失败 (${res.status})`);
  return data;
}

// 登录 / 注册,成功后保存 token
export async function authenticate(action, { username, password, code }) {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, username, password, code }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || `出错了 (${res.status})`);
  setToken(data.token);
  return data.user;
}

// 用已存的 token 换当前用户;无效则返回 null
export async function fetchMe() {
  if (!getToken()) return null;
  try {
    const res = await fetch('/api/auth', { headers: { 'X-Auth': getToken() } });
    if (!res.ok) {
      clearToken();
      return null;
    }
    const data = await res.json();
    return data.user;
  } catch {
    return null;
  }
}

export async function logout() {
  const token = getToken();
  if (token) {
    await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth': token },
      body: JSON.stringify({ action: 'logout' }),
    }).catch(() => {});
  }
  clearToken();
}
