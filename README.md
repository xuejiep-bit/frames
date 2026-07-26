# 背单词 — 间隔重复记忆 Web App

类似 Anki 的个人背单词应用:随时随地登录,上传单词/词组,按 SM-2 间隔重复算法复习。

- **前端**:Vite + React,移动端优先,可"添加到主屏幕"作为 PWA 全屏运行
- **后端**:Cloudflare Pages Functions(仓库根目录 `functions/`)
- **存储**:Cloudflare D1(唯一数据源,不用 IndexedDB / localStorage 存业务数据)
- **鉴权**:多用户账户。注册用户名 + 密码(PBKDF2-SHA256 加盐哈希),登录后拿到会话 token 存 localStorage,**一次登录 180 天有效**,关浏览器、重启手机都不用重输。每个 API 请求带 `X-Auth: <token>`,由 `functions/_middleware.js` 统一校验并解析出当前用户,所有卡片按 `user_id` 严格隔离

## 功能

| 页面 | 说明 |
|---|---|
| 复习(首页) | 今日到期队列 → 点卡片翻面看释义/例句 → 四档评分(重来/困难/一般/简单 = quality 0/3/4/5),服务端跑 SM-2。「重来」的卡片会排到队尾直到答对 |
| 卡片 | 列表、搜索、牌组筛选、新建、编辑、软删除 |
| 导入 | 粘贴 TSV(每行 `单词 ⇥ 释义 ⇥ 例句`,例句可省略),预览确认后一次事务批量入库 |
| 设置 | 查看当前账户、导出全部卡片 JSON 备份、牌组重命名、退出登录 |

每个账户的卡片彼此完全隔离,互相看不到、也改不了。

## Cloudflare Pages 部署设置

### 1. 构建配置(Pages 项目 → Settings → Builds & deployments)

| 配置项 | 值 |
|---|---|
| Build command | `npm run build` |
| Build output directory | `dist` |
| Functions | 自动识别仓库根目录的 `functions/`,无需配置 |

### 2. 创建并初始化 D1 数据库

1. Cloudflare 控制台 → **Storage & Databases → D1** → Create database
2. 打开数据库的 **Console** 标签,执行建表 SQL:
   - **全新的库** → 粘贴 [`schema.sql`](./schema.sql)(建 `users` / `sessions` / `cards` 三张表)
   - **之前已经执行过旧版 schema.sql** → 改用 [`migrate-v2.sql`](./migrate-v2.sql) 升级到多用户结构。如果升级前已经有卡片,先在网站上注册账号,再回来执行该文件末尾注释里的那条 `UPDATE`,把旧卡片划归你的账号

### 3. 绑定 D1(关键)

Pages 项目 → **Settings → Bindings**(旧版在 Functions 设置里)→ Add → D1 database:

| 配置项 | 值 |
|---|---|
| Variable name | `DB`(必须完全一致,代码里用 `env.DB`) |
| D1 database | 选上一步创建的数据库 |

### 4. 环境变量(可选)

账户体系不需要任何环境变量,密码存在 D1 里。只有一个可选项:

| 配置项 | 值 |
|---|---|
| `SIGNUP_CODE` | **不设** = 任何人都能注册;**设了** = 注册时必须填对这个邀请码 |

站点域名是公开的,如果不希望陌生人注册账号占用你的 D1 额度,建议设一个 `SIGNUP_CODE`。
(旧版的 `APP_PASSWORD` 已不再使用,可以删掉。)

> ⚠️ 绑定和环境变量改动后需要 **重新部署**(Deployments → Retry deployment)才生效。

### 5. 手机安装(PWA)

用手机浏览器打开站点 → 分享/菜单 → **添加到主屏幕**,即可全屏运行。

## 本地开发

```bash
npm install
npm run build
# 起本地 Pages + Functions + 模拟 D1:
npx wrangler pages dev dist --d1 DB=local-db
```

首次需要给本地模拟 D1 建表:接口报 `no such table` 时,把 `schema.sql` 在本地库执行一次(wrangler 的本地 sqlite 文件在 `.wrangler/state/v3/d1/` 下)。

前端热更新开发:另开一个终端 `npm run dev`(Vite 已配置把 `/api` 代理到 `localhost:8788`)。

## API 一览

所有接口(除 `/api/auth`)必须带请求头 `X-Auth: <会话 token>`,否则 401。返回的卡片始终只属于 token 对应的用户。

| 接口 | 方法 | 说明 |
|---|---|---|
| `/api/auth` | GET | 用 token 换当前用户,前端启动时判断是否已登录 |
| `/api/auth` | POST | `{action: 'register' \| 'login' \| 'logout', username, password, code?}` |
| `/api/cards` | GET | 列出卡片,支持 `?deck=xxx`、`?due=today`(含逾期) |
| `/api/cards` | POST | 新建 `{front, back, example?, deck?}`,当天到期 |
| `/api/cards` | PUT | 更新 `{id, front?, back?, example?, deck?}` |
| `/api/cards?id=` | DELETE | 软删除(`deleted=1`) |
| `/api/review` | POST | `{id, quality}`,quality ∈ {0,3,4,5},服务端 SM-2 更新 |
| `/api/import` | POST | 卡片数组,单事务批量写入(≤1000 条/次) |
| `/api/export` | GET | 全部未删除卡片 JSON(备份下载) |

## SM-2 算法(服务端 `functions/api/review.js`)

- quality < 3:`repetitions = 0`,`interval = 1`,`lapses += 1`,EF 不变
- quality ≥ 3:repetitions 为 0 → interval 1;为 1 → interval 6;否则 `round(interval × EF)`;然后 `repetitions += 1`,并更新 `EF += 0.1 - (5-q) × (0.08 + (5-q) × 0.02)`,下限 1.3
- `due_date = 今天(UTC) + interval 天`,格式 `YYYY-MM-DD`
