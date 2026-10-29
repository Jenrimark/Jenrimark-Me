# Jenrimark · 吴汉东

个人作品集首页使用连续场景帧完成滚动叙事：首屏眼神跟随、五个固定页面、四段动作转场、项目与履历内容展示。

项目采用前后端分离的 pnpm monorepo：

- `apps/web`：Next.js 前台与内容后台
- `packages/scene`：滚动、视线、帧映射与阻尼逻辑
- `packages/content`：内容模型与样例数据
- `server`：Go API、SQLite 与 JWT 后台

---

## 快速开始

环境要求：

- Node.js ≥ 22
- pnpm ≥ 12
- Go ≥ 1.24

安装依赖：

```sh
pnpm install
```

启动前台：

```sh
pnpm dev
```

默认地址：[http://localhost:3000](http://localhost:3000)

启动后端：

```sh
export ADMIN_PASSWORD=admin123
cd server
go run ./cmd/server
```

后端默认监听 `8080`，健康检查地址为 [http://localhost:8080/healthz](http://localhost:8080/healthz)。

内容后台位于 [http://localhost:3000/admin](http://localhost:3000/admin)。

---

## 首页时间线

场景使用 24fps 连续帧，用户只需按视频秒数定位，运行时自动换算为帧。

| 页面 | 源视频稳定点 | 转场到下一页 |
|------|-------------|-------------|
| 01 初次见面 | `0–10s` 眼神跟随 | `10–12s`，播放 `3s` |
| 02 学履 | `13s` | `15–18s`，播放 `3s` |
| 03 工作 | `18s` | `21.07–26s`，播放 `4s` |
| 04 作品集 | `26s` | `26–29s`，播放 `3s` |
| 05 认识一下 | `29s` | 无 |

### 眼神路径

- 面部中心：直视
- `2.50s`：向右
- `5.00s`：向上
- `7.25s`：向左
- `9.00s`：回到直视
- 右下区域：从直视过渡到向右
- 正下方：回到直视

---

## 场景资产

```text
apps/web/public/
├─ media/
│  ├─ formal-v4.mp4             场景源视频
│  └─ hero-poster.png           视频兜底封面
└─ scenes/
   ├─ manifest.json             场景注册表
   └─ story-v6/
      ├─ story-video.json       秒级时间线与视频转场映射
      └─ gaze-hd/               1280×720 WebP 首屏眼神帧
```

`story-v6/story-video.json` 是时间线的唯一真值：

- `sourceRange`：动作使用的源视频秒数
- `holdTime`：页面稳定秒数
- `playbackDurationMs`：转场播放时长
- `pacing`：动作内部的慢放、加速节奏

---

## 代码结构

```text
Jenrimark-Me/
├─ apps/
│  └─ web/
│     ├─ public/
│     │  ├─ media/
│     │  └─ scenes/
│     └─ src/
│        ├─ app/
│        │  ├─ page.tsx
│        │  ├─ layout.tsx
│        │  └─ admin/
│        ├─ components/
│        │  ├─ HomeExperience.tsx
│        │  └─ ScenePlayer.tsx
│        ├─ lib/
│        │  └─ content-server.ts
│        └─ styles/
│           └─ page.css
├─ packages/
│  ├─ scene/
│  │  └─ src/
│  │     ├─ story-scroll.ts
│  │     ├─ scroll-video.ts
│  │     ├─ scroll-map.ts
│  │     ├─ scroll-profile.ts
│  │     └─ gaze-math.ts
│  └─ content/
│     └─ src/
├─ server/
│  └─ internal/
└─ deploy/
   └─ docker-compose.yml
```

---

## 技术栈

- **前台**：Next.js 15、React、TypeScript
- **场景**：连续 JPEG 帧、双缓冲、帧预加载
- **动效**：GSAP、ScrollTrigger、Lenis
- **后端**：Go、Gin、SQLite、JWT
- **仓库**：pnpm workspace monorepo

---

## 测试

运行场景逻辑测试：

```sh
node --test --experimental-strip-types packages/scene/src/__tests__/*.test.ts
```

运行 TypeScript 检查：

```sh
./apps/web/node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit
```

运行后端测试：

```sh
cd server
go test ./...
```

---

## 构建与部署

构建前台：

```sh
pnpm --filter @jenrimark/web build
```

单机部署使用：

```text
deploy/docker-compose.yml
```

运行时生成的 `server/data/`、`.next/`、`node_modules/` 不进入 Git。
