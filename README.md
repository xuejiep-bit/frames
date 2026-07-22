# Frames 帧记 — 部署指南

## 成本概览（自用，约 ¥10/月 封顶）

| 项目 | 费用 |
|------|------|
| Cloudflare Pages 托管 | **免费** |
| Cloudflare Functions (API 代理) | **免费** (每天 10 万次) |
| 域名 (.com) | **~¥55/年** (~$8) |
| DeepSeek API | **几乎免费** (~¥0.002/次, 每天 50 次约 ¥0.1) |

> DeepSeek V3 价格：输入 $0.28/百万 token，输出 $0.42/百万 token。
> 每次分析约 2000 tokens = ¥0.002，一个月日常使用不到 ¥3

## 一、买域名

### 推荐域名
- `framesnote.com` — 品牌感强
- `framesji.com` — 帧记拼音
- `myframes.app` — .app 自带 HTTPS
- `frames.ink` — 简短，书写寓意

**在 Cloudflare 买最省事**（免费 WHOIS 隐私）：
1. 登录 Cloudflare → Domain Registration → Register Domains
2. 搜索 → 购买

**暂时不买也行**：部署后 Cloudflare 会给你 `xxx.pages.dev` 免费子域名。

## 二、获取 DeepSeek API Key

1. 访问 https://platform.deepseek.com/
2. 登录（你已有账号）
3. API Keys → Create → 复制（`sk-` 开头）

## 三、本地测试

```bash
npm install
npm run build
npx wrangler pages dev dist --binding DEEPSEEK_API_KEY=sk-xxx你的key
```

浏览器打开 http://localhost:8788

## 四、部署

### 1. 推到 GitHub
```bash
git init && git add . && git commit -m "Frames v1.0"
git remote add origin https://github.com/你的用户名/frames.git
git branch -M main && git push -u origin main
```

### 2. Cloudflare Pages 连接
- Workers & Pages → Create → Connect to Git
- Build command: `npm run build`
- Output directory: `dist`

### 3. 环境变量（关键！）
- Settings → Environment variables
- Name: `DEEPSEEK_API_KEY` / Value: 你的 Key / 勾选 Encrypt
- **重新部署**让变量生效

### 4. 绑域名
- Settings → Custom domains → 输入域名

## 五、省钱技巧

1. DeepSeek 自动缓存相同前缀请求，命中只要 1/10 价格
2. Prompt 已精简到 ~1500 tokens/次
3. 自用不开放注册 = 零滥用风险
