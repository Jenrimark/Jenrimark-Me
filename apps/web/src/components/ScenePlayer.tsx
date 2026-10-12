'use client';

import { useEffect, useRef, useState } from 'react';
import {
  EYE_DURATION,
  EYE_END_PROGRESS,
  INTERACTION_FPS,
  SCROLL_SMOOTH_FACTOR,
  frameTime,
  mapPointerTime,
  mapSceneTime,
  needsScrollSeek,
  smoothProgress,
} from '@jenrimark/scene';

type SceneProgressDetail = {
  progress: number;
  time: number;
  duration: number;
};

export default function ScenePlayer() {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
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

    const render = () => {
      state.progress = smoothProgress(state.progress, state.inputProgress, SCROLL_SMOOTH_FACTOR);
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
    let scrollTriggerInstance: { progress: number } | null = null;
    let tickFn: ((time: number) => void) | null = null;
    let fallbackRaf = 0;

    const onPointer = (e: PointerEvent) => {
      if (state.progress >= EYE_END_PROGRESS || !state.duration) return;
      const time = readPointerTime(e);
      if (gsapInstance) {
        gsapInstance.to(state, {
          pointerTime: time,
          duration: 0.16,
          overwrite: true,
          onUpdate: () => {
            if (state.progress < EYE_END_PROGRESS) seek(mapSceneTime(state));
          },
        });
      } else {
        state.pointerTime = time;
        if (state.progress < EYE_END_PROGRESS) seek(mapSceneTime(state));
      }
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

          lenisInstance = new Lenis({ lerp: 0.14, smoothWheel: true, syncTouch: true, autoRaf: false });
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
          gsap.ticker.lagSmoothing(500, 33);
          gsap.set(root, { autoAlpha: 1 });
          ScrollTrigger.refresh();
        } catch {
          gsapInstance = null;
        }
      }

      if (!gsapInstance) {
        const fallbackTick = () => {
          render();
          fallbackRaf = requestAnimationFrame(fallbackTick);
        };
        state.inputProgress = readScrollProgress();
        fallbackRaf = requestAnimationFrame(fallbackTick);
      }

      addEventListener('pointermove', onPointer, { passive: true });
      addEventListener('scroll', onScroll, { passive: true });

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
      if (fallbackRaf) cancelAnimationFrame(fallbackRaf);
      if (tickFn && gsapInstance) gsapInstance.ticker.remove(tickFn);
      lenisInstance?.destroy();
      void rafId;
    };
  }, []);

  return (
    <div
      id="v3-scene"
      className={`v3-scene${active ? ' is-active' : ''}`}
      aria-hidden="true"
      ref={rootRef}
    >
      <div className="v3-scene-frame">
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
      </div>
    </div>
  );
}
