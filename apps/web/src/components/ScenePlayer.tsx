'use client';

import { useEffect, useRef, useState } from 'react';
import {
  EYE_DURATION,
  EYE_END_PROGRESS,
  INTERACTION_FPS,
  createAdaptiveLenis,
  createFrameDamper,
  frameTime,
  mapPointerTime,
  mapSceneTime,
  needsScrollSeek,
  STORY_TRANSITION_DURATION_MS,
  storyFrameURL,
  storyProgressFromScroll,
  storyTimelineAtPageProgress,
  storyTransitionScrollValue,
  sourceTimeToFrame,
  type StoryTimelineManifest,
} from '@jenrimark/scene';
import { frameAtProgress, type SceneBudget } from '@jenrimark/scene/scroll';

type SceneProgressDetail = {
  progress: number;
  time: number;
  duration: number;
  page?: number;
};

export type SceneMode = 'video' | 'frames' | 'spec' | 'story';

export default function ScenePlayer({
  mode = 'video',
  framesConfig,
  specConfig,
  storyConfig,
}: {
  mode?: SceneMode;
  /** frames 模式：budget.json 地址 + 帧目录（public 相对路径，如 /scenes/demo/） */
  framesConfig?: { budgetUrl: string; framesDir: string };
  /** R5：spec 模式：budget（帧数）+ 帧目录 + interaction-spec.json（双端动效规格） */
  specConfig?: { budgetUrl: string; framesDir: string; specUrl: string };
  /** 五页动作叙事：24fps 帧目录 + story.json 页面/动作映射 */
  storyConfig?: { framesDir: string; specUrl: string };
}) {
  const isFrames = mode === 'frames' && !!framesConfig;
  const isSpec = mode === 'spec' && !!specConfig;
  const isStory = mode === 'story' && !!storyConfig;
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [active, setActive] = useState(false);

  /* ============ story 模式：五页吸附 + 四段完整动作播放/倒放 ============ */
  useEffect(() => {
    if (!isStory || !storyConfig) return;
    const root = rootRef.current;
    const img = imgRef.current;
    const scrollRoot = document.querySelector<HTMLElement>('#scene-scroll');
    if (!root || !img || !scrollRoot) return;
    scrollRootRef.current = scrollRoot;

    let manifest: StoryTimelineManifest | null = null;
    let rafId = 0;
    let requestedFrame = -1;
    let visibleFrame = -1;
    let frameRequestId = 0;
    let lastRenderAt = 0;
    // 上一次 transition（滚动方向感知：前进预取下一个、后退预取上一个，避免三连全量预取）
    let lastTransition = -1;
    let navigating = false;
    let navigationStartProgress = 0;
    let navigationTargetProgress = -1;
    let lockedTargetPage = 0;
    const pointer = { x: 0.5, y: 0.5 };
    const cache = new Map<number, HTMLImageElement>();
    const CACHE_MAX = 120;
    const preloadedTransitions = new Set<number>();
    const backBuffer = document.createElement('img');
    backBuffer.className = img.className;
    backBuffer.alt = '';
    backBuffer.draggable = false;
    backBuffer.tabIndex = -1;
    backBuffer.setAttribute('aria-hidden', 'true');
    backBuffer.style.opacity = '0';
    img.style.opacity = '1';
    img.parentElement?.appendChild(backBuffer);
    let frontBuffer = img;
    let backImage = backBuffer;

    const pointerX = createFrameDamper({ smoothTime: 0.16, maxSpeed: 2 });
    const pointerY = createFrameDamper({ smoothTime: 0.16, maxSpeed: 2 });
    pointerX.snapTo(pointer.x);
    pointerY.snapTo(pointer.y);

    const frameURL = (frame: number) =>
      manifest ? storyFrameURL(manifest, frame) : '';

    const loadImage = (frame: number): HTMLImageElement => {
      const cached = cache.get(frame);
      if (cached) {
        cache.delete(frame);
        cache.set(frame, cached);
        return cached;
      }
      const image = new Image();
      image.decoding = 'async';
      image.src = frameURL(frame);
      cache.set(frame, image);
      while (cache.size > CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined || oldest === frame || oldest === visibleFrame) break;
        cache.delete(oldest);
      }
      return image;
    };

    const decodeImage = (image: HTMLImageElement): Promise<void> => {
      if (image.complete && image.naturalWidth > 0) return Promise.resolve();
      if (typeof image.decode === 'function') return image.decode().then(() => undefined);
      return new Promise((resolve, reject) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', reject, { once: true });
      });
    };

    const prefetchAround = (frame: number) => {
      if (!manifest) return;
      for (let offset = -4; offset <= 4; offset += 1) {
        const next = frame + offset;
        if (next < 0 || next >= manifest.totalFrames) continue;
        void decodeImage(loadImage(next)).catch(() => undefined);
      }
    };

    const preloadTransition = (index: number) => {
      if (!manifest || index < 0 || index >= manifest.transitions.length || preloadedTransitions.has(index)) return;
      preloadedTransitions.add(index);
      const spec = manifest.transitions[index];
      const frames: number[] = [];
      const startFrame = sourceTimeToFrame(spec.sourceRange[0], manifest.fps);
      const endFrame = sourceTimeToFrame(spec.sourceRange[1], manifest.fps);
      const holdFrame = sourceTimeToFrame(spec.holdTime, manifest.fps);
      for (let frame = startFrame; frame <= endFrame; frame += 1) frames.push(frame);
      if (!frames.includes(holdFrame)) frames.push(holdFrame);
      let cursor = 0;
      const pump = () => {
        const deadline = performance.now() + 6;
        while (cursor < frames.length && performance.now() < deadline) {
          void decodeImage(loadImage(frames[cursor])).catch(() => undefined);
          cursor += 1;
        }
        if (cursor < frames.length) window.setTimeout(pump, 0);
      };
      pump();
    };

    const showFrame = (frame: number) => {
      if (!manifest || frame === requestedFrame) return;
      requestedFrame = frame;
      const requestId = ++frameRequestId;
      const decoded = loadImage(frame);
      void decodeImage(decoded)
        .then(async () => {
          if (requestId !== frameRequestId) return;
          backImage.src = decoded.src;
          await decodeImage(backImage).catch(() => undefined);
          if (requestId !== frameRequestId) return;
          backImage.style.opacity = '1';
          frontBuffer.style.opacity = '0';
          const previousFront = frontBuffer;
          frontBuffer = backImage;
          backImage = previousFront;
          visibleFrame = frame;
          prefetchAround(frame);
        })
        .catch(() => {
          if (requestId === frameRequestId) requestedFrame = -1;
        });
    };

    const render = () => {
      const now = performance.now();
      const dt = lastRenderAt ? (now - lastRenderAt) / 1000 : 1 / 60;
      lastRenderAt = now;
      pointerX.update(dt);
      pointerY.update(dt);
      pointer.x = pointerX.value;
      pointer.y = pointerY.value;
      if (!manifest) return;

      const rawPageProgress = storyProgressFromScroll(scrollY, innerHeight, manifest.pages.length);
      const pageProgress = navigating
        ? Math.max(
            Math.min(navigationStartProgress, navigationTargetProgress),
            Math.min(rawPageProgress, Math.max(navigationStartProgress, navigationTargetProgress)),
          )
        : rawPageProgress;
      const sceneState = storyTimelineAtPageProgress(pageProgress, manifest, pointer);
      showFrame(sceneState.frame);
      // 懒加载：只预取当前 transition + 滚动方向的邻接 transition（首帧只取当前）
      const t = sceneState.transition;
      preloadTransition(t);
      if (lastTransition >= 0) {
        if (t > lastTransition) preloadTransition(t + 1);
        else if (t < lastTransition) preloadTransition(t - 1);
      }
      lastTransition = t;
      root.dataset.state = 'story';
      root.dataset.page = String(sceneState.page);
      root.dataset.pointerX = pointer.x.toFixed(3);
      root.dataset.pointerY = pointer.y.toFixed(3);
      root.dataset.scrollProgress = rawPageProgress.toFixed(6);
      root.dataset.pageProgress = pageProgress.toFixed(6);
      root.dataset.transition = String(sceneState.transition);
      root.dataset.local = sceneState.local.toFixed(6);
      root.dataset.frame = String(sceneState.frame);
      root.dataset.sourceTime = sceneState.sourceTime.toFixed(3);
      document.dispatchEvent(new CustomEvent<SceneProgressDetail>('v4sceneprogress', {
        detail: {
          progress: pageProgress / Math.max(1, manifest.pages.length - 1),
          time: sceneState.sourceTime,
          duration: manifest.duration,
          page: sceneState.page,
        },
      }));
    };

    const tick = () => {
      render();
      rafId = window.setTimeout(tick, 16);
    };

    void fetch(storyConfig.specUrl)
      .then((response) => response.json())
      .then((value: StoryTimelineManifest) => {
        manifest = { ...value, framesDir: storyConfig.framesDir };
        lockedTargetPage = Math.round(scrollY / innerHeight);
        document.documentElement.classList.add('scene-snap-enabled');
        document.querySelectorAll<HTMLElement>('.scene-spacer').forEach((spacer) => {
          spacer.style.height = '100svh';
        });
        showFrame(0);
        preloadTransition(0);
        render();
      })
      .catch(() => undefined);
    rafId = window.setTimeout(tick, 16);

    const pageTop = (page: number) => page * innerHeight;
    const nearestPage = () => Math.round(scrollY / innerHeight);
    let navigationTimer = 0;
    let navigationRaf = 0;
    const settleNavigation = () => {
      document.documentElement.classList.remove('story-programmatic-scroll');
      navigating = false;
      if (navigationTargetProgress >= 0) {
        lockedTargetPage = navigationTargetProgress;
        window.scrollTo(0, pageTop(lockedTargetPage));
      }
      if (navigationRaf) {
        window.clearTimeout(navigationRaf);
        navigationRaf = 0;
      }
    };
    const goToPage = (requestedPage: number) => {
      if (!manifest || navigating) return;
      const startPage = nearestPage();
      const page = Math.max(0, Math.min(manifest.pages.length - 1, requestedPage));
      lockedTargetPage = page;
      navigating = true;
      window.clearTimeout(navigationTimer);
      const targetTop = pageTop(page);
      const startTop = scrollY;
      navigationStartProgress = startPage;
      navigationTargetProgress = page;
      const transitionFrom = Math.min(startPage, page);
      const transitionTo = Math.max(startPage, page);
      const playbackDurationMs = manifest.transitions
        .slice(transitionFrom, transitionTo)
        .reduce((total, transition) => total + transition.playbackDurationMs, 0) ||
        STORY_TRANSITION_DURATION_MS;
      root.dataset.navStart = String(startPage);
      root.dataset.navTarget = String(page);
      root.dataset.navDuration = String(playbackDurationMs);
      root.dataset.navState = 'started';
      const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
      document.documentElement.classList.add('story-programmatic-scroll');
      if (reducedMotion) {
        window.scrollTo(0, targetTop);
        settleNavigation();
        return;
      }
      const startedAt = performance.now();
      const step = (now: number) => {
        const elapsed = now - startedAt;
        root.dataset.navElapsed = String(Math.round(elapsed));
        window.scrollTo(0, storyTransitionScrollValue(startTop, targetTop, elapsed, playbackDurationMs));
        if (elapsed < playbackDurationMs) {
          navigationRaf = window.setTimeout(() => step(performance.now()), 16);
          return;
        }
        window.scrollTo(0, targetTop);
        navigationRaf = 0;
        root.dataset.navState = 'settled';
        settleNavigation();
      };
      navigationRaf = window.setTimeout(() => step(performance.now()), 16);
      navigationTimer = window.setTimeout(() => {
        if (!navigating) return;
        window.scrollTo(0, targetTop);
        root.dataset.navState = 'settled';
        settleNavigation();
      }, playbackDurationMs + 250);
    };
    const onStoryNavigate = (event: Event) => {
      const page = (event as CustomEvent<{ page: number }>).detail?.page;
      if (typeof page === 'number') goToPage(page);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      pointerX.setTarget(Math.max(0, Math.min(1, event.clientX / innerWidth)));
      pointerY.setTarget(Math.max(0, Math.min(1, event.clientY / innerHeight)));
    };
    const onScrollEnd = () => {
      const targetPage = navigating ? lockedTargetPage : nearestPage();
      const targetTop = pageTop(targetPage);
      if (Math.abs(scrollY - targetTop) > 1) window.scrollTo(0, targetTop);
      if (!navigating) settleNavigation();
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('scrollend', onScrollEnd as EventListener);
    window.addEventListener('story:navigate', onStoryNavigate);
    root.classList.add('is-active');
    setActive(true);

    return () => {
      window.clearTimeout(rafId);
      window.clearTimeout(navigationTimer);
      if (navigationRaf) window.clearTimeout(navigationRaf);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('scrollend', onScrollEnd as EventListener);
      window.removeEventListener('story:navigate', onStoryNavigate);
      document.documentElement.classList.remove('scene-snap-enabled');
      document.documentElement.classList.remove('story-programmatic-scroll');
      backBuffer.remove();
    };
  }, [isStory, storyConfig]);

  /* ============ frames 模式：滚动进度 → 帧序列 ============ */
  useEffect(() => {
    if (!isFrames || !framesConfig) return;
    const root = rootRef.current;
    const img = imgRef.current;
    const scrollRoot = document.querySelector<HTMLElement>('#scene-scroll');
    if (!root || !img || !scrollRoot) return;
    scrollRootRef.current = scrollRoot;

    const state = { progress: 0, inputProgress: 0 };
    let budget: SceneBudget | null = null;
    const frameUrl = (frame: number) =>
      `${framesConfig.framesDir}${String(frame).padStart(6, '0')}.webp`;

    // R3：帧缓存（LRU）+ 邻近帧预取，滚动高频切帧时避免重复网络请求
    const cache = new Map<number, HTMLImageElement>();
    const CACHE_MAX = 24;
    const frameFileName = (frame: number) => `${String(frame).padStart(6, '0')}.webp`;
    const getCached = (frame: number): HTMLImageElement | null => {
      const el = cache.get(frame);
      if (el) {
        cache.delete(frame); // 命中 → 挪到队尾（最近使用）
        cache.set(frame, el);
        return el;
      }
      return null;
    };
    const putCached = (frame: number): HTMLImageElement => {
      const el = new Image();
      el.src = frameUrl(frame);
      cache.set(frame, el);
      if (cache.size > CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined && oldest !== frame) cache.delete(oldest);
      }
      return el;
    };
    const prefetchAround = (frame: number, radius: number) => {
      for (let d = -radius; d <= radius; d++) {
        if (d === 0) continue;
        const f = frame + d;
        if (f < 0) continue;
        if (cache.has(f)) continue;
        const el = new Image();
        el.src = frameUrl(f);
        if (typeof el.decode === 'function') el.decode().catch(() => {});
        cache.set(f, el);
      }
      if (cache.size > CACHE_MAX + radius * 2) {
        const keys = [...cache.keys()];
        for (const k of keys.slice(0, cache.size - CACHE_MAX)) {
          if (k !== frame) cache.delete(k);
        }
      }
    };

    const render = () => {
      state.progress = state.inputProgress;
      if (!budget) return;
      const entry = frameAtProgress(budget, state.progress);
      if (img.src.split('/').pop() !== frameFileName(entry.frame)) {
        const cached = getCached(entry.frame);
        img.src = cached && cached.complete && cached.naturalWidth > 0 ? cached.src : frameUrl(entry.frame);
        if (!cached) putCached(entry.frame);
        prefetchAround(entry.frame, 2);
      }
      root.dataset.state = 'frames';
      const detail: SceneProgressDetail = {
        progress: state.progress,
        time: entry.time,
        duration: budget.total_out_frames,
      };
      document.dispatchEvent(new CustomEvent('v4sceneprogress', { detail }));
    };

    void fetch(framesConfig.budgetUrl)
      .then((r) => r.json())
      .then((b: SceneBudget) => {
        budget = b;
        // 预载首帧
        img.src = frameUrl(0);
        render();
      })
      .catch(() => {
        // 预算加载失败：保持空白，滚动端不崩溃
      });

    const readScrollProgress = () =>
      Math.min(1, Math.max(0, (scrollY || 0) / Math.max(1, scrollRoot.offsetHeight - innerHeight)));
    const onScroll = () => {
      state.inputProgress = readScrollProgress();
    };

    let gsapInstance: typeof import('gsap').gsap | null = null;
    let lenisInstance: import('lenis').default | null = null;
    let stopScrollProfile: (() => void) | null = null;
    const stopLenis = () => lenisInstance?.stop();
    const startLenis = () => lenisInstance?.start();
    window.addEventListener('portfolio:modal-open', stopLenis);
    window.addEventListener('portfolio:modal-close', startLenis);
    let scrollTriggerInstance: { progress: number } | null = null;
    let tickFn: ((time: number) => void) | null = null;
    let fallbackRaf = 0;
    let fallbackTick: (() => void) | null = null;
    let onVisibility: (() => void) | null = null;

    const boot = async () => {
      const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!prefersReduced) {
        try {
          const [{ gsap }, { ScrollTrigger }, { default: Lenis }] = await Promise.all([
            import('gsap'),
            import('gsap/ScrollTrigger'),
            import('lenis'),
          ]);
          gsap.registerPlugin(ScrollTrigger);
          gsapInstance = gsap;
          // 双平台自适应平滑：mac / Windows 触控板交还原生（系统已提供惯性），
          // Windows 鼠标补单层 lerp；首次 wheel 采样判定后热改 lenis.options
          const adaptive = createAdaptiveLenis(Lenis);
          lenisInstance = adaptive.lenis;
          stopScrollProfile = adaptive.stop;
          scrollTriggerInstance = ScrollTrigger.create({
            trigger: scrollRoot,
            start: 'top top',
            end: 'bottom bottom',
            onUpdate: (self: { progress: number }) => {
              state.inputProgress = self.progress;
            },
          }) as unknown as { progress: number };
          tickFn = (time: number) => {
            lenisInstance?.raf(time * 1000);
            if (!scrollTriggerInstance) state.inputProgress = readScrollProgress();
            render();
          };
          gsap.ticker.add(tickFn);
          gsap.ticker.lagSmoothing(0);
          gsap.set(root, { autoAlpha: 1 });
          ScrollTrigger.refresh();
        } catch {
          gsapInstance = null;
        }
      }
      if (!gsapInstance) {
        fallbackTick = () => {
          render();
          fallbackRaf = requestAnimationFrame(fallbackTick!);
        };
        state.inputProgress = readScrollProgress();
        addEventListener('scroll', onScroll, { passive: true });
        fallbackRaf = requestAnimationFrame(fallbackTick);
      }
      onVisibility = () => {
        if (document.hidden) {
          lenisInstance?.stop();
          if (tickFn && gsapInstance) gsapInstance.ticker.remove(tickFn);
          if (fallbackRaf) {
            cancelAnimationFrame(fallbackRaf);
            fallbackRaf = 0;
          }
        } else {
          if (gsapInstance && tickFn) gsapInstance.ticker.add(tickFn);
          lenisInstance?.start();
          if (!gsapInstance && fallbackTick && !fallbackRaf) {
            fallbackRaf = requestAnimationFrame(fallbackTick);
          }
        }
      };
      document.addEventListener('visibilitychange', onVisibility);
      root.classList.add('is-active');
      setActive(true);
    };

    void boot();

    return () => {
      removeEventListener('scroll', onScroll);
      if (onVisibility) document.removeEventListener('visibilitychange', onVisibility);
      if (fallbackRaf) cancelAnimationFrame(fallbackRaf);
      if (tickFn && gsapInstance) gsapInstance.ticker.remove(tickFn);
      window.removeEventListener('portfolio:modal-open', stopLenis);
      window.removeEventListener('portfolio:modal-close', startLenis);
      stopScrollProfile?.();
      lenisInstance?.destroy();
    };
  }, [isFrames, framesConfig]);

  /* ============ R5：spec 模式——动效规格驱动（双端参数） ============ */
  useEffect(() => {
    if (!isSpec || !specConfig) return;
    const root = rootRef.current;
    const img = imgRef.current;
    const scrollRoot = document.querySelector<HTMLElement>('#scene-scroll');
    if (!root || !img || !scrollRoot) return;
    scrollRootRef.current = scrollRoot;

    type SpecSeg = {
      range: [number, number];
      behavior: string;
      travel: number;
      axis: string;
      sensitivity: number;
      followRange: [number, number];
      segStart: number;
      segFrames: number;
      /** gaze 轴：[[角度deg, 帧序], ...]，角度 0=右 90=上（屏幕坐标 y 已反转） */
      gazeMap?: Array<[number, number]>;
      boundary?: { type: string; at: number };
    };

    const state = { progress: 0, inputProgress: 0, px: 0.5, py: 0.5, pointerSeen: false };
    let totalOutFrames = 0;
    let specDuration = 0;
    let segs: SpecSeg[] = [];
    let totalTravel = 0;
    // 设备判定：有精细指针（鼠标/触控板）即启用指针交互。
    // 不再卡 min-width——窄窗/半屏分屏同样是桌面鼠标环境，之前 1024px 门槛会把
    // mouse-track 整个关掉，表现为「没有鼠标跟随环节、只有滚动」。
    const isDesktop = matchMedia('(pointer: fine)').matches;
    const frameUrl = (frame: number) => `${specConfig.framesDir}${String(frame).padStart(6, '0')}.webp`;

    const buildSegs = (spec: {
      duration?: number;
      segments?: Array<{
        range?: [number, number];
        desktop?: { behavior?: string; params?: Record<string, unknown> };
        mobile?: { behavior?: string; params?: Record<string, unknown> };
        boundary?: { type?: string; at?: number };
      }>;
    }) => {
      specDuration = Number(spec.duration ?? 0);
      const list = spec.segments ?? [];
      const totalDur = list.reduce((a, s) => a + Math.max(1e-6, (s.range?.[1] ?? 0) - (s.range?.[0] ?? 0)), 0);
      const devSegs: Array<Omit<SpecSeg, 'segStart'>> = list.map((s) => {
        const d = isDesktop ? s.desktop : s.mobile;
        const p = (d?.params ?? {}) as Record<string, unknown>;
        const travel = d?.behavior === 'static' ? 80 : Number(p.travel ?? 600);
        const dur = Math.max(1e-6, (s.range?.[1] ?? 0) - (s.range?.[0] ?? 0));
        const segFrames = Math.max(1, Math.round((dur / totalDur) * totalOutFrames));
        const followRange: [number, number] = Array.isArray(p.followRange)
          ? [Number(p.followRange[0]), Number(p.followRange[1])]
          : [0, 1];
        // gaze 轴：[[角度deg, 帧序], ...]，缺省用首屏视线变体的 7 向分布
        const gazeMap: Array<[number, number]> | undefined = Array.isArray(p.gazeMap)
          ? (p.gazeMap as number[][]).map((pair) => [Number(pair[0]), Number(pair[1])] as [number, number])
          : undefined;
        return {
          range: (s.range ?? [0, 0]) as [number, number],
          behavior: d?.behavior ?? 'static',
          travel,
          segFrames,
          axis: String(p.axis ?? 'x'),
          sensitivity: Number(p.sensitivity ?? 1),
          followRange,
          gazeMap,
          boundary: s.boundary
            ? { type: String(s.boundary.type ?? ''), at: Number(s.boundary.at ?? 0) }
            : undefined,
        };
      });
      // 段帧数按时长比例分摊；分段起帧 = 前缀和
      let acc = 0;
      segs = devSegs.map((s) => {
        const segStart = acc;
        acc += s.segFrames;
        return { ...s, segStart };
      });
      totalTravel = segs.reduce((a, s) => a + s.travel, 0);
    };

    const frameOf = (scrollPos: number): number => {
      if (segs.length === 0) return 0;
      if (!Number.isFinite(scrollPos)) scrollPos = 0;
      let acc = 0;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        if (scrollPos < acc + s.travel || i === segs.length - 1) {
          const b = s.behavior;
          if (b === 'mouse-track' && isDesktop) {
            // 指针从未移动（纯滚轮用户）→ 退化为滚动扫帧，避免整段画面锁死
            if (!state.pointerSeen) {
              const local = s.travel > 0 ? (scrollPos - acc) / s.travel : 0;
              const p = Math.max(0, Math.min(1, local));
              const f = s.segStart + Math.round(p * (s.segFrames - 1));
              return Number.isFinite(f) ? f : 0;
            }
            if (s.axis === 'gaze') {
              const f = gazeFrameOf(s, state.px, state.py);
              return Number.isFinite(f) ? f : s.segStart;
            }
            // sensitivity：以中点为轴放大指针行程（>1 时小幅移动即扫到段端）
            const sens = Number.isFinite(s.sensitivity) && s.sensitivity > 0 ? s.sensitivity : 1;
            const raw = s.axis === 'angle' ? angleOf(state.px, state.py) : s.axis === 'y' ? state.py : state.px;
            const v = Math.max(0, Math.min(1, 0.5 + (raw - 0.5) * sens));
            const [lo, hi] = [Math.min(s.followRange[0], s.followRange[1]), Math.max(s.followRange[0], s.followRange[1])];
            const p = Math.max(0, Math.min(1, (v - lo) / Math.max(1e-6, hi - lo)));
            const f = s.segStart + Math.round(p * (s.segFrames - 1));
            return Number.isFinite(f) ? f : s.segStart;
          }
          const local = s.travel > 0 ? (scrollPos - acc) / s.travel : 0;
          const p = Math.max(0, Math.min(1, local));
          const f = s.segStart + Math.round(p * (s.segFrames - 1));
          return Number.isFinite(f) ? f : 0;
        }
        acc += s.travel;
      }
      return 0;
    };

    // 叙事时间轴（秒）：与 video/frames 模式同口径，供 v4sceneprogress 切场景字幕。
    // spec 段自带 range=[t0,t1]（0..28.9s），按滚动在段内插值还原真实时间，
    // 不能用 progress×duration 归一化——那会得到 0..1，字幕将永远停在第一幕。
    const timeOf = (scrollPos: number): number => {
      if (segs.length === 0) return 0;
      if (!Number.isFinite(scrollPos)) scrollPos = 0;
      let acc = 0;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        if (scrollPos < acc + s.travel || i === segs.length - 1) {
          const local = s.travel > 0 ? (scrollPos - acc) / s.travel : 1;
          const p = Math.max(0, Math.min(1, local));
          const t = s.range[0] + p * Math.max(0, s.range[1] - s.range[0]);
          return Number.isFinite(t) ? t : specDuration;
        }
        acc += s.travel;
      }
      return specDuration;
    };

    const angleOf = (px: number, py: number): number => {
      const dx = px - 0.5;
      const dy = py - 0.5;
      return (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI);
    };

    // gaze 轴：指针相对画面中心的角度 → 最近视线帧。
    // 首屏帧 000000–000006 是 7 向视线变体：0 正面 / 1 看左 / 2 看右 / 3 右上 /
    // 4 上偏右 / 5 上偏左 / 6 左上。无「向下」素材，指向下半屏时回正面。
    // 角度制：0=右 90=上 180=左 270=下（屏幕 y 已反转）。
    const DEFAULT_GAZE_MAP: Array<[number, number]> = [
      [0, 2], // 看右
      [45, 3], // 右上
      [75, 4], // 上偏右
      [105, 5], // 上偏左
      [135, 6], // 左上
      [180, 1], // 看左
      [270, 0], // 指向下半屏 → 正面
    ];
    const gazeFrameOf = (seg: SpecSeg, px: number, py: number): number => {
      const map = seg.gazeMap && seg.gazeMap.length > 0 ? seg.gazeMap : DEFAULT_GAZE_MAP;
      const dx = (px - 0.5) * 2;
      const dy = (py - 0.5) * 2;
      const radius = Math.hypot(dx, dy);
      // 中心死区 → 正面帧（segStart 即段内 0 号帧）
      if (radius <= 0.12) return seg.segStart;
      // 屏幕 y 向下；换算数学角（0=右，90=上）
      const angle = (Math.atan2(-dy, dx) * 180) / Math.PI;
      let bestFrame = 0;
      let bestDist = Infinity;
      for (const [a, f] of map) {
        // 环形角距；严格小于保证同距时取表中靠前项（左右水平帧排在下区帧之前）
        const d = Math.abs(((angle - a + 540) % 360) - 180);
        if (d < bestDist) {
          bestDist = d;
          bestFrame = f;
        }
      }
      const idx = Math.max(0, Math.min(seg.segFrames - 1, Math.round(bestFrame)));
      return seg.segStart + idx;
    };

    const frameFileName = (frame: number) => `${String(frame).padStart(6, '0')}.webp`;
    const render = () => {
      // 指针阻尼每帧推进（render 由 gsap.ticker 或 raf 驱动，二者必居其一）
      const now = performance.now();
      const dt = lastRenderAt ? (now - lastRenderAt) / 1000 : 1 / 60;
      lastRenderAt = now;
      pxDamper.update(dt);
      pyDamper.update(dt);
      // 直读滚动位置（Lenis/原生滚动都会写入 scrollY），不依赖 ScrollTrigger 的 start/end 计算
      state.inputProgress = readScrollProgress();
      state.progress = state.inputProgress;
      // mouse-track 段的唯一输入源：阻尼后的 px/py
      state.px = pxDamper.value;
      state.py = pyDamper.value;
      if (segs.length === 0 || totalTravel <= 0) return;
      const scrollPos = state.progress * totalTravel;
      const frame = frameOf(scrollPos);
      if (img.src.split('/').pop() !== frameFileName(frame)) img.src = frameUrl(frame);
      root.dataset.state = 'spec';
      const detail: SceneProgressDetail = {
        progress: state.progress,
        time: timeOf(scrollPos),
        duration: totalOutFrames,
      };
      document.dispatchEvent(new CustomEvent('v4sceneprogress', { detail }));
    };

    const readScrollProgress = () =>
      Math.min(1, Math.max(0, (scrollY || 0) / Math.max(1, scrollRoot.offsetHeight - innerHeight)));
    const onScroll = () => {
      state.inputProgress = readScrollProgress();
    };

    void Promise.all([fetch(specConfig.budgetUrl).then((r) => r.json()), fetch(specConfig.specUrl).then((r) => r.json())])
      .then(([budget, spec]) => {
        totalOutFrames = Number((budget as { total_out_frames?: number }).total_out_frames ?? 0) || 1;
        buildSegs(spec as Parameters<typeof buildSegs>[0]);
        // 规格驱动：滚动总行程 = Σ travel；把 spacer 归零、滚动根高度置为总行程
        document.querySelectorAll<HTMLElement>('.scene-spacer').forEach((el) => (el.style.height = '0px'));
        scrollRoot.style.height = `${Math.max(innerHeight, totalTravel)}px`;
        img.src = frameUrl(0);
        state.inputProgress = readScrollProgress();
        render();
      })
      .catch(() => {
        // 规格加载失败：静默降级（保持原页面高度与空白）
      });

    let gsapInstance: typeof import('gsap').gsap | null = null;
    let lenisInstance: import('lenis').default | null = null;
    let stopScrollProfile: (() => void) | null = null;
    const stopLenis = () => lenisInstance?.stop();
    const startLenis = () => lenisInstance?.start();
    window.addEventListener('portfolio:modal-open', stopLenis);
    window.addEventListener('portfolio:modal-close', startLenis);
    let scrollTriggerInstance: { progress: number } | null = null;
    let tickFn: ((time: number) => void) | null = null;
    let fallbackRaf = 0;
    let fallbackTick: (() => void) | null = null;
    let onVisibility: (() => void) | null = null;

    // 桌面鼠标追踪：指针移动驱动 mouse-track 段。
    // px/py 过阻尼器（smoothDamp + maxSpeed 限速，移植自 oil-motion FrameAnimator）：
    // maxSpeed 2 = 每秒最多横扫 2 屏；pointermove 的 120Hz 抖动被摊薄为连续帧序列，
    // 使 img.src 换帧速率落在浏览器解码能力内，消除快速划动时的抽动。
    let lastRenderAt = 0;
    const pointerDamperOptions = {
      smoothTime: 0.16,
      maxSpeed: 2,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    } as const;
    const pxDamper = createFrameDamper(pointerDamperOptions);
    const pyDamper = createFrameDamper(pointerDamperOptions);
    pxDamper.snapTo(state.px);
    pyDamper.snapTo(state.py);
    const onPointer = (e: PointerEvent) => {
      if (!isDesktop) return;
      // 仅真实指针移动算数（touch 的 pointermove 不该把 mouse-track 激活）
      if (e.pointerType === 'touch') return;
      state.pointerSeen = true;
      pxDamper.setTarget(Math.max(0, Math.min(1, e.clientX / innerWidth)));
      pyDamper.setTarget(Math.max(0, Math.min(1, e.clientY / innerHeight)));
    };
    window.addEventListener('pointermove', onPointer);

    const boot = async () => {
      const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!prefersReduced) {
        try {
          const [{ gsap }, { ScrollTrigger }, { default: Lenis }] = await Promise.all([
            import('gsap'),
            import('gsap/ScrollTrigger'),
            import('lenis'),
          ]);
          gsap.registerPlugin(ScrollTrigger);
          gsapInstance = gsap;
          // 双平台自适应平滑：mac / Windows 触控板交还原生（系统已提供惯性），
          // Windows 鼠标补单层 lerp；首次 wheel 采样判定后热改 lenis.options
          const adaptive = createAdaptiveLenis(Lenis);
          lenisInstance = adaptive.lenis;
          stopScrollProfile = adaptive.stop;
          scrollTriggerInstance = ScrollTrigger.create({
            trigger: scrollRoot,
            start: 'top top',
            end: 'bottom bottom',
            onUpdate: (self: { progress: number }) => {
              state.inputProgress = self.progress;
            },
          }) as unknown as { progress: number };
          tickFn = (time: number) => {
            lenisInstance?.raf(time * 1000);
            if (!scrollTriggerInstance) state.inputProgress = readScrollProgress();
            render();
          };
          gsap.ticker.add(tickFn);
          gsap.ticker.lagSmoothing(0);
          gsap.set(root, { autoAlpha: 1 });
          ScrollTrigger.refresh();
        } catch {
          gsapInstance = null;
        }
      }
      if (!gsapInstance) {
        fallbackTick = () => {
          render();
          fallbackRaf = requestAnimationFrame(fallbackTick!);
        };
        state.inputProgress = readScrollProgress();
        addEventListener('scroll', onScroll, { passive: true });
        fallbackRaf = requestAnimationFrame(fallbackTick);
      }
      onVisibility = () => {
        if (document.hidden) {
          lenisInstance?.stop();
          if (tickFn && gsapInstance) gsapInstance.ticker.remove(tickFn);
          if (fallbackRaf) {
            cancelAnimationFrame(fallbackRaf);
            fallbackRaf = 0;
          }
        } else {
          if (gsapInstance && tickFn) gsapInstance.ticker.add(tickFn);
          lenisInstance?.start();
          if (!gsapInstance && fallbackTick && !fallbackRaf) {
            fallbackRaf = requestAnimationFrame(fallbackTick);
          }
        }
      };
      document.addEventListener('visibilitychange', onVisibility);
      root.classList.add('is-active');
      setActive(true);
    };

    void boot();

    return () => {
      removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', onPointer);
      if (onVisibility) document.removeEventListener('visibilitychange', onVisibility);
      if (fallbackRaf) cancelAnimationFrame(fallbackRaf);
      if (tickFn && gsapInstance) gsapInstance.ticker.remove(tickFn);
      window.removeEventListener('portfolio:modal-open', stopLenis);
      window.removeEventListener('portfolio:modal-close', startLenis);
      stopScrollProfile?.();
      lenisInstance?.destroy();
    };
  }, [isSpec, specConfig]);

  /* ============ video 模式（默认，行为不变） ============ */
  useEffect(() => {
    if (isFrames || isSpec || isStory) return;
    const root = rootRef.current;
    const video = videoRef.current;
    const scrollRoot = document.querySelector<HTMLElement>('#scene-scroll');
    if (!root || !video || !scrollRoot) return;
    scrollRootRef.current = scrollRoot;

    const state = {
      progress: 0,
      inputProgress: 0,
      pointerTime: 0,
      duration: 0,
      scrollTarget: 0,
    };

    // EYE 段指针阻尼：smoothDamp + maxSpeed 限速（算法移植自 oil-motion FrameAnimator）。
    // maxSpeed 6 = 每秒最多追赶 6 秒视频时间：指针飞掠过整条 10s 时长时约 1.7s 连续补完，
    // 替代旧 GSAP tween（160ms 追完）——那个目标超出 video seek 的呈现能力，只能跳变。
    // 滚动段不过阻尼器：Lenis 已提供单层平滑（A3 定论，杜绝双层叠加）。
    const eyeDamper = createFrameDamper({
      smoothTime: 0.16,
      maxSpeed: 6,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    });

    const seekEye = (time: number) => {
      if (video.readyState < 1 || !state.duration) return;
      const target = frameTime(
        Math.max(0, Math.min(state.duration - 0.05, time)),
        state.duration,
        INTERACTION_FPS,
      );
      if (!video.seeking && Math.abs(video.currentTime - target) > 1 / (INTERACTION_FPS * 2)) {
        video.currentTime = target;
      }
    };

    const seekScroll = (time: number) => {
      if (video.readyState < 1 || !state.duration) return;
      const target = Math.max(EYE_DURATION, Math.min(state.duration - 0.02, time));
      state.scrollTarget = target;
      if (needsScrollSeek({ currentTime: video.currentTime, targetTime: target, seeking: video.seeking })) {
        video.currentTime = target;
      }
    };

    const seek = (time: number) =>
      state.progress < EYE_END_PROGRESS ? seekEye(time) : seekScroll(time);

    let lastRenderAt = 0;

    const render = () => {
      // EYE 段指针阻尼每帧推进（dt 自管；render 由 gsap.ticker 或 raf 驱动，二者必居其一）
      const now = performance.now();
      const dt = lastRenderAt ? (now - lastRenderAt) / 1000 : 1 / 60;
      lastRenderAt = now;
      eyeDamper.update(dt);
      // A3: 删除自研指数平滑层，进度直通，只保留 Lenis 单层平滑
      state.progress = state.inputProgress;
      // EYE 段画面时间的唯一来源：指针阻尼器当前值（滚动段不使用 pointerTime）
      state.pointerTime = eyeDamper.value;
      const time = mapSceneTime(state);
      seek(time);
      root.dataset.state = state.progress < EYE_END_PROGRESS ? 'eye' : 'scroll';
      const detail: SceneProgressDetail = {
        progress: state.progress,
        time,
        duration: state.duration,
      };
      document.dispatchEvent(new CustomEvent('v4sceneprogress', { detail }));
    };

    const onMeta = () => {
      state.duration = video.duration || 0;
      seek(mapSceneTime(state));
    };
    video.addEventListener('loadedmetadata', onMeta, { once: true });

    const resumeLatestScrollTarget = () => {
      if (state.progress < EYE_END_PROGRESS || !state.duration || video.seeking) return;
      if (needsScrollSeek({ currentTime: video.currentTime, targetTime: state.scrollTarget, seeking: false })) {
        video.currentTime = state.scrollTarget;
      }
    };

    type VideoWithRVFC = HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
    };
    const v = video as VideoWithRVFC;
    let rafId = 0;
    if (v.requestVideoFrameCallback) {
      const onFrame = () => {
        resumeLatestScrollTarget();
        v.requestVideoFrameCallback!(onFrame);
      };
      rafId = v.requestVideoFrameCallback(onFrame);
    }
    video.addEventListener('seeked', resumeLatestScrollTarget);

    const readScrollProgress = () =>
      Math.min(1, Math.max(0, (scrollY || 0) / Math.max(1, scrollRoot.offsetHeight - innerHeight)));
    const readPointerTime = (e: PointerEvent) =>
      mapPointerTime(e.clientX, e.clientY, video.getBoundingClientRect());

    let gsapInstance: typeof import('gsap').gsap | null = null;
    let lenisInstance: import('lenis').default | null = null;
    let stopScrollProfile: (() => void) | null = null;
    const stopLenis = () => lenisInstance?.stop();
    const startLenis = () => lenisInstance?.start();
    window.addEventListener('portfolio:modal-open', stopLenis);
    window.addEventListener('portfolio:modal-close', startLenis);
    let scrollTriggerInstance: { progress: number } | null = null;
    let tickFn: ((time: number) => void) | null = null;
    let fallbackRaf = 0;
    let fallbackTick: (() => void) | null = null;
    let onVisibility: (() => void) | null = null;

    const onPointer = (e: PointerEvent) => {
      if (state.progress >= EYE_END_PROGRESS || !state.duration) return;
      // 只设目标；平滑与限速由 eyeDamper 在每帧 tick 里推进（tickFn/fallbackTick 驱动）
      eyeDamper.setTarget(readPointerTime(e));
    };

    const onScroll = () => {
      state.inputProgress = readScrollProgress();
    };

    const boot = async () => {
      const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const isTouchOnly = matchMedia('(hover: none)').matches;

      if (!prefersReduced) {
        try {
          const [{ gsap }, { ScrollTrigger }, { default: Lenis }] = await Promise.all([
            import('gsap'),
            import('gsap/ScrollTrigger'),
            import('lenis'),
          ]);
          gsap.registerPlugin(ScrollTrigger);
          gsapInstance = gsap;

          // A1 已内聚到 createAdaptiveLenis：syncTouch:false + 桌面双平台自适应 lerp
          // 双平台自适应平滑：mac / Windows 触控板交还原生（系统已提供惯性），
          // Windows 鼠标补单层 lerp；首次 wheel 采样判定后热改 lenis.options
          const adaptive = createAdaptiveLenis(Lenis);
          lenisInstance = adaptive.lenis;
          stopScrollProfile = adaptive.stop;
          scrollTriggerInstance = ScrollTrigger.create({
            trigger: scrollRoot,
            start: 'top top',
            end: 'bottom bottom',
            onUpdate: (self: { progress: number }) => {
              state.inputProgress = self.progress;
            },
          }) as unknown as { progress: number };

          tickFn = (time: number) => {
            lenisInstance?.raf(time * 1000);
            if (!scrollTriggerInstance) state.inputProgress = readScrollProgress();
            render();
          };
          gsap.ticker.add(tickFn);
          // A2: 按 Lenis 官方 GSAP 集成要求清零 lagSmoothing，排除 GSAP 侧叠加延迟
          gsap.ticker.lagSmoothing(0);
          gsap.set(root, { autoAlpha: 1 });
          ScrollTrigger.refresh();
        } catch {
          gsapInstance = null;
        }
      }

      if (!gsapInstance) {
        fallbackTick = () => {
          render();
          fallbackRaf = requestAnimationFrame(fallbackTick!);
        };
        state.inputProgress = readScrollProgress();
        // A4: 仅降级分支（无 ScrollTrigger）才挂被动 scroll 监听；主路径由 ScrollTrigger onUpdate 单一写进度
        addEventListener('scroll', onScroll, { passive: true });
        fallbackRaf = requestAnimationFrame(fallbackTick);
      }

      addEventListener('pointermove', onPointer, { passive: true });

      // A7: 标签页隐藏时停掉 ticker/RAF 与 Lenis，回到前台再恢复，避免离屏空转
      onVisibility = () => {
        if (document.hidden) {
          lenisInstance?.stop();
          if (tickFn && gsapInstance) gsapInstance.ticker.remove(tickFn);
          if (fallbackRaf) {
            cancelAnimationFrame(fallbackRaf);
            fallbackRaf = 0;
          }
        } else {
          if (gsapInstance && tickFn) gsapInstance.ticker.add(tickFn);
          lenisInstance?.start();
          if (!gsapInstance && fallbackTick && !fallbackRaf) {
            fallbackRaf = requestAnimationFrame(fallbackTick);
          }
        }
      };
      document.addEventListener('visibilitychange', onVisibility);

      root.classList.add('is-active');
      setActive(true);
      video.load();
      if (isTouchOnly || prefersReduced) {
        // Keep video controllable for manual play on touch / reduced-motion.
        video.controls = false;
      }
    };

    void boot();

    return () => {
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('seeked', resumeLatestScrollTarget);
      removeEventListener('pointermove', onPointer);
      removeEventListener('scroll', onScroll);
      if (onVisibility) document.removeEventListener('visibilitychange', onVisibility);
      if (fallbackRaf) cancelAnimationFrame(fallbackRaf);
      if (tickFn && gsapInstance) gsapInstance.ticker.remove(tickFn);
      window.removeEventListener('portfolio:modal-open', stopLenis);
      window.removeEventListener('portfolio:modal-close', startLenis);
      stopScrollProfile?.();
      lenisInstance?.destroy();
      void rafId;
    };
  }, [isFrames, isSpec, isStory]);

  return (
    <div
      id="v3-scene"
      className={`v3-scene${active ? ' is-active' : ''}`}
      aria-hidden="true"
      ref={rootRef}
    >
      <div className="v3-scene-frame">
        {isFrames || isSpec || isStory ? (
          <img
            id="v3-scene-frames"
            className="v3-scene-video"
            alt=""
            draggable={false}
            tabIndex={-1}
            ref={imgRef}
          />
        ) : (
          <video
            id="v3-scene-video"
            className="v3-scene-video"
            src="/media/formal-v4.mp4"
            poster="/media/hero-poster.png"
            muted
            playsInline
            preload="auto"
            tabIndex={-1}
            ref={videoRef}
          />
        )}
      </div>
    </div>
  );
}
