# V3 场景播放器重构计划

**目标：** 用一个固定全屏播放器按 `S00 → T00 → T01 → S01 → T02 → S02 → T03 → S03 → T04 → S04` 呈现首页视觉主线，鼠标追视与滚动时间轴互不抢控制权。

**架构：** 首页只保留 V3 场景播放器与最小滚动轨道。Lenis 负责平滑滚动，GSAP 负责状态补间和播放器层过渡，单个 `<video>` 与单张静态海报负责所有场景，避免多视频叠加造成闪帧。

**技术栈：** 原生 ES modules、GSAP 3、Lenis、HTMLVideoElement、CSS 固定画布。

---

## 任务

- [x] 冻结 V3 素材映射与本地路径。
- [x] 移除首页文字/内容层，保留视觉播放器。
- [x] 实现单播放器、首尾海报、视频时间轴和鼠标追视。
- [x] 接入 Lenis 平滑滚动与 GSAP 状态过渡。
- [x] 更新构建脚本复制 V3 素材。
- [x] 运行测试、构建和本地资源检查。

## 素材映射

```text
S00 = media/v3/S00.png
T00 = media/v3/T00.mp4
S01 = media/v3/S01.png
T01 = media/v3/T01.mp4
S02 = media/v3/S02.png
T02 = media/v3/T02.mp4
S03 = media/v3/S03.png
T03 = media/v3/T03.mp4
S04 = media/v3/S04.png
T04 = media/v3/T04.mp4
```

## 验收

- 首页不显示旧文字、旧 Canvas 或旧多层视频。
- 鼠标停留首屏时，T00 由指针方向驱动视线时间。
- 滚动后由 Lenis 的平滑进度驱动五段视频时间。
- 每段视频开始显示上一张静态图，结束切换到下一张静态图。
- 播放器始终固定 `16:9`、`object-fit: cover`，不拉伸。
- `npm test`、`npm run build` 通过，首页和 V3 资源返回 HTTP 200。
