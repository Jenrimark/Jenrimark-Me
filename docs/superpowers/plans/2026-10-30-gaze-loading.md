# 首屏眼神跟随优化执行计划

**目标：** 保留画质，修复眼神帧下载取消，并改善资源复用。

**架构：** 将网络获取、有限离屏解码和可见帧显示分离。图片采用内容版本目录和长期 HTTP 缓存；CDN 接入使用可配置源站。

**技术：** TypeScript、Next.js 15、原生浏览器图片解码、Node 测试、Playwright、阿里云 MCP。

## 1. 保存基线

- [x] 确认现有修改已提交，记录 `b9bc189`。
- [x] 建立 `checkpoint/gaze-before-2026-10-30`。
- [x] 提交诊断设计和本计划（`34e259e`）。

## 2. 帧缓存与显示

文件：`packages/scene/src/gaze-frame-cache.ts`、`packages/scene/src/__tests__/gaze-frame-cache.test.ts`、`packages/scene/src/index.ts`、`apps/web/src/components/StoryVideoPlayer.tsx`。

- [x] 先写并运行延迟请求、并发上限、优先级、淘汰和卸载的失败测试。
- [x] 实现 `createGazeFrameCache`：`request(frame)`、`peek(frame)`、`setVisible(frame)`、`warm()`、`dispose()`；网络和解码通过可注入函数测试，最多 4 个网络请求和 2 个解码任务，最多 24 个解码结果。
- [x] 真实浏览器加载器获取原图 Blob，离屏图片解码完成后提供对象 URL；缓存淘汰和卸载释放 URL。
- [x] 指针只更新目标，`requestAnimationFrame` 显示准备好的帧；保持原有 `storyGazeTime` 映射。
- [x] 运行 `node --test --experimental-strip-types packages/scene/src/__tests__/gaze-frame-cache.test.ts`，再运行现有场景测试。
- [x] 提交经过验证的加载修复（`bada68d`）。

## 3. 资源缓存

文件：`apps/web/next.config.mjs`、`apps/web/public/scenes/manifest.json`、`apps/web/public/scenes/story-v6/story-video.json`、`packages/scene/src/__tests__/story-video-manifest.test.ts`。

- [x] 对所有眼神帧计算内容摘要；仅重命名资源目录，不重新编码。
- [x] 更新两个场景清单并配置版本资源 `public, max-age=31536000, immutable`；场景配置保留可更新策略。
- [x] 增加可选 `SCENE_ASSET_ORIGIN` 配置，以便后续接入独立资源域名。
- [x] 验证 SHA-256、清单、生产 HTTP 响应和 TypeScript。
- [x] 运行生产构建、真实组件浏览器回归；记录取消数、资源获取与眼神显示的改善。
- [ ] 提交缓存修改，审查后推送 Git 和回退标记，验证部署完成。

## 4. OSS/CDN

- [x] 用阿里云 MCP 核实存储空间、CDN 开通情况、域名和服务器。
- [x] 准备最小资源配置及收费依据；新增服务需要用户确认报价。
- [ ] 可复用资源直接配置；新增资源获批后再开通、上传、配置 HTTPS/CORS/缓存。
- [ ] 验证原图摘要、资源可达性、缓存命中和线上眼神跟随。

## 5. 交付

- [x] 请求代码审查，修复影响正确性、缓存和资源释放的问题。
- [ ] 更新验证记录，报告 Git 提交、线上结果和云侧费用或待确认项。
