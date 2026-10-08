# Sticky IP 场景实现计划

> **面向 AI 代理的工作者：** 使用现有测试与构建命令逐项验证。

**目标：** 将当前长页面改为贴近 PDF 的分章节 Sticky IP 滚动叙事，每个主要章节拥有独立 IP 场景、intro/main/outro 进度和上下滚动可逆状态。

**架构：** HTML 为每个章节提供独立 `.scene-stage` 与 IP 图层；JavaScript 通过 `requestAnimationFrame` 计算章节进度并更新 CSS 变量、状态类和文案阶段；CSS 只负责视觉过渡、层级和移动端/低动效降级。现有首页追视、作品弹窗和 CMS 数据流保持不变。

**技术栈：** 原生 HTML/CSS/JavaScript、IntersectionObserver、requestAnimationFrame、Node test/build。

## 任务 1：章节舞台标记

**文件：** `site/index.html`

- [ ] 为 about、journey、story、work、toolbox、contact 添加独立 `.scene-stage`、`.scene-ip` 与进度标记。
- [ ] 保留现有内容 DOM 和可访问名称，IP 图片使用现有 `media/ip-*.png`。

## 任务 2：滚动场景控制器

**文件：** `site/portfolio.mjs`

- [ ] 添加统一 `setupSceneRail()`，按章节矩形计算 0-1 progress。
- [ ] 使用 rAF 合并 scroll 更新，写入 `--scene-progress`、`--scene-phase`，并切换 `scene-intro/scene-main/scene-outro`。
- [ ] 进入/离开章节时只控制可见性，不依赖一次性 reveal；上下滚动可逆。

## 任务 3：场景视觉与转场

**文件：** `site/portfolio.css`

- [ ] 为每章节提供 sticky IP 舞台、intro/main/outro 透明度和位移状态。
- [ ] 增加跨章节色彩/光晕过渡，确保内容层级高于 IP。
- [ ] 移动端改为静态章节 IP + 轻量位移，reduced-motion 禁用过渡但保留内容。

## 任务 4：验证

**文件：** `site/tests/`、`tests/`

- [ ] 运行 `npm test`，确认现有内容、追视和服务器测试全部通过。
- [ ] 运行 `npm run build`，确认所有章节素材复制到 dist。
- [ ] 检查素材 HTTP 200、脚本语法和构建产物。
