# Jenrimark · 吴汉东

个人作品集。首屏鼠标追视、滚动叙事视频、场景文案切换、作品夹与履历；手机与减少动态效果模式为静态降级。

技术形态：**前后端分离 monorepo**（Next.js 前台 + Go API）。

---

## 快速开始

环境：Node.js ≥ 22、pnpm、Go ≥ 1.24。

```sh
pnpm install

# 终端 1 · 后端（首次导入旧内容）
cd server
$env:ADMIN_PASSWORD = "admin123"    # bash: export ADMIN_PASSWORD=admin123
go run ./cmd/server -import ../docs/legacy/site/content.json

# 终端 2 · 前台（仓库根目录）
pnpm dev
```

| 页面 | 地址 |
|------|------|
| 作品集前台 | http://127.0.0.1:3000/ |
| 内容后台 | http://127.0.0.1:3000/admin/ |
| API 健康检查 | http://127.0.0.1:8080/healthz |

后台账号 `admin`，密码为 `ADMIN_PASSWORD`（未设置时看服务端日志）。

---

## 技术栈

- **前台** Next.js 15（App Router）· React · TypeScript
- **动效** GSAP · ScrollTrigger · Lenis（`packages/scene`）
- **后端** Go · Gin · SQLite · JWT
- **仓库** pnpm workspace monorepo

---

## 目录

```text
D:\DIY\
├─ package.json              monorepo 根脚本（dev / build / test）
├─ pnpm-workspace.yaml       工作区：apps/*、packages/*
├─ pnpm-lock.yaml            依赖锁定
├─ README.md                 项目说明
├─ .gitignore                忽略规则
│
├─ apps/
│  └─ web/                   Next.js 前台 + 后台
│     ├─ package.json
│     ├─ next.config.mjs     /api 代理到 Go
│     ├─ tsconfig.json
│     ├─ Dockerfile
│     ├─ public/
│     │  └─ media/
│     │     ├─ formal-v4.mp4      滚动叙事视频
│     │     └─ hero-poster.png    视频封面
│     └─ src/
│        ├─ app/
│        │  ├─ layout.tsx         根布局
│        │  ├─ page.tsx           首页 /
│        │  ├─ globals.css        全局样式入口
│        │  └─ admin/
│        │     └─ page.tsx        内容后台 /admin
│        ├─ components/
│        │  ├─ HomeExperience.tsx 场景页结构与切换
│        │  └─ ScenePlayer.tsx    追视 + 滚动视频
│        └─ styles/
│           ├─ page.css
│           ├─ styles.css
│           ├─ v3-scene.css
│           └─ portfolio.css
│
├─ packages/
│  ├─ scene/                 动效逻辑（TS）
│  │  ├─ package.json
│  │  └─ src/
│  │     ├─ gaze-math.ts         追视数学
│  │     ├─ scroll-video.ts      滚动时间轴
│  │     ├─ index.ts
│  │     └─ __tests__/
│  │        └─ scroll-video.test.ts
│  └─ content/               内容模型（TS）
│     ├─ package.json
│     └─ src/
│        ├─ index.ts             类型 + 校验
│        └─ content.sample.json  内容样例
│
├─ server/                   Go API
│  ├─ go.mod / go.sum
│  ├─ Dockerfile
│  ├─ cmd/
│  │  └─ server/
│  │     └─ main.go              启动入口（-import）
│  └─ internal/
│     ├─ auth/auth.go            JWT
│     ├─ config/config.go        环境变量
│     ├─ store/store.go          SQLite 存取
│     └─ httpapi/
│        ├─ routes.go            路由
│        └─ json.go              JSON 辅助
│
├─ deploy/
│  └─ docker-compose.yml     api + web 编排
│
└─ docs/                     文档
   ├─ 01-设计方案/            产品、视觉、滚动、架构迁移
   ├─ 02-过程资料/            过程记录
   ├─ 03-参考资料/            参考资料
   ├─ 04-原型实验/            原型
   ├─ 05-素材归档/            素材归档
   ├─ 06-个人资料/            简历等
   └─ legacy/                旧版整包
      ├─ site/               旧静态站源码
      ├─ scripts/            旧构建脚本
      ├─ dist/               旧构建产物
      └─ pages.yml           旧 Pages 工作流
```

> 运行时目录 `server/data/`（SQLite、上传）与依赖 `node_modules/`、构建产物 `.next/` 不入 Git。

---

## 内容维护

后台 `/admin`：

1. **保存草稿** — 只进草稿，对外不可见  
2. **发布** — 写入公开数据，`GET /api/public/content` 供前台使用  
3. 可选导出 `content.json`（`CONTENT_JSON` 指定路径），兼容旧托管  

作品 `status`：`draft` / `published`。封面上传后路径形如 `media/uploads/xxx.png`。

---

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/login` | 登录，签发 JWT |
| POST | `/api/logout` | 退出 |
| GET | `/api/content` | 读草稿（登录） |
| PUT | `/api/content` | 存草稿（登录） |
| POST | `/api/publish` | 发布（登录） |
| POST | `/api/upload` | 上传封面（登录） |
| POST | `/api/import` | 导入内容 JSON（登录） |
| GET | `/api/public/content` | 公开内容 |

开发时 Next 将 `/api/*` 代理到 `http://127.0.0.1:8080`。

---

## 构建与测试

```sh
pnpm --filter @jenrimark/web build

node --test --experimental-strip-types packages/scene/src/__tests__/*.test.ts

cd server && go test ./...
```

---

## 部署

- 单机：`deploy/docker-compose.yml`（api + web）
- 生产目标见 `docs/01-设计方案/07-架构迁移/`：反向代理 + ECS + OSS

---

## 旧版说明

原生 HTML 静态站、Node 构建脚本、Pages 工作流已归档在 `docs/legacy/`，仅作回退对照。新改动请落在 `apps/`、`packages/`、`server/`。
