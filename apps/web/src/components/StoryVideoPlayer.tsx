'use client';

import { useEffect, useRef } from 'react';
import {
  createGazeFrameCache,
  initialStoryVideoState,
  reduceStoryVideoState,
  resolveStoryVideoTransition,
  sourceTimeToFrame,
  storyVideoCanPlayMotion,
  storyGazeTime,
  storyVideoDirectionFromDelta,
  storyVideoDirectionFromKey,
  storyVideoPosterForDirection,
  type StoryVideoEvent,
  type StoryVideoManifest,
  type StoryVideoState,
  type StoryVideoTransitionSpec,
} from '@jenrimark/scene';

type ProgressDetail = {
  progress: number;
  time: number;
  duration: number;
  page: number;
  phase: StoryVideoState['phase'];
};

const INPUT_LOCK_CLASS = 'story-video-locked';
const CAN_PLAY_TIMEOUT_MS = 2000;
const HIDDEN_RECOVERY_MS = 2000;
const WHEEL_THRESHOLD = 18;
const SWIPE_THRESHOLD = 48;

export default function StoryVideoPlayer({
  framesDir,
  specUrl,
}: {
  framesDir: string;
  specUrl: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const frame = frameRef.current;
    const video = videoRef.current;
    if (!root || !frame || !video) return;

    let manifest: StoryVideoManifest | null = null;
    let state = initialStoryVideoState();
    let disposed = false;
    let activeTransition: StoryVideoTransitionSpec | null = null;
    let canPlayTimer = 0;
    let blendTimer = 0;
    let hiddenTimer = 0;
    let frameRequestId = 0;
    let videoGeneration = 0;
    let touchStartY = 0;
    let touchHandled = false;
    let heroEnabled = true;
    type GazeImage = { src: string; image: HTMLImageElement };
    let gazeCache: ReturnType<typeof createGazeFrameCache<Blob, GazeImage>> | null = null;
    let gazeTarget = -1;
    let visibleGaze = -1;
    let gazeRaf = 0;
    let gazeWarmTimer = 0;
    const preloadedVideos = new Map<string, HTMLVideoElement>();
    const manifestAbort = new AbortController();

    const frameURL = (frameNumber: number) => {
      const totalFrames = manifest?.gazeTotalFrames ?? 1;
      const safeFrame = Math.max(0, Math.min(totalFrames - 1, Math.round(frameNumber)));
      const gazeFramesDir = manifest?.gazeFramesDir ?? framesDir;
      return `${gazeFramesDir}${String(safeFrame).padStart(6, '0')}${manifest?.extension ?? '.webp'}`;
    };

    const scheduleGazeRender = () => {
      if (gazeRaf || disposed) return;
      gazeRaf = requestAnimationFrame(() => {
        gazeRaf = 0;
        if (disposed || !heroEnabled || state.phase !== 'idle' || state.page !== 0) return;
        const ready = gazeCache?.peek(gazeTarget);
        if (!ready || gazeTarget === visibleGaze) return;
        frameRequestId += 1;
        frame.src = ready.src;
        visibleGaze = gazeTarget;
        gazeCache?.setVisible(visibleGaze);
        root.dataset.gazeFrame = String(visibleGaze);
      });
    };

    const decodeStableImage = async (source: string) => {
      const requestId = ++frameRequestId;
      frame.src = source;
      if (typeof frame.decode === 'function') {
        await frame.decode().catch(() => undefined);
      }
      return requestId === frameRequestId;
    };

    const waitForNextPaint = () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });

    const publish = () => {
      const page = state.phase === 'idle' ? state.page : state.targetPage;
      const stableFrame = manifest?.stableFrames[page] ?? null;
      const detail: ProgressDetail = {
        progress: page / Math.max(1, (manifest?.pages.length ?? 1) - 1),
        time: stableFrame == null ? 0 : stableFrame / (manifest?.fps || 24),
        duration: manifest?.duration ?? 30.048,
        page,
        phase: state.phase,
      };
      document.dispatchEvent(new CustomEvent<ProgressDetail>('v4sceneprogress', { detail }));
      root.dataset.storyPhase = state.phase;
      root.dataset.storyPage = String(page);
    };

    const dispatch = (event: StoryVideoEvent) => {
      if (!manifest) return;
      state = reduceStoryVideoState(state, event, manifest);
      document.documentElement.classList.toggle(INPUT_LOCK_CLASS, state.phase !== 'idle');
      publish();
      if (state.phase === 'idle' && state.page === 0) scheduleGazeRender();
    };

    const showStablePage = async (page: number) => {
      if (!manifest) return;
      heroEnabled = page === 0;
      visibleGaze = -1;
      const stableImage = manifest.stableImages[page];
      const isCurrent = await decodeStableImage(stableImage);
      if (isCurrent) await waitForNextPaint();
      if (isCurrent && page === 0) scheduleGazeRender();
    };

    const preloadTransition = (transition: StoryVideoTransitionSpec, eager: boolean) => {
      for (const src of [transition.forwardSrc, transition.reverseSrc]) {
        if (preloadedVideos.has(src)) continue;
        const preloadVideo = document.createElement('video');
        preloadVideo.muted = true;
        preloadVideo.preload = eager ? 'auto' : 'metadata';
        preloadVideo.src = src;
        preloadVideo.load();
        preloadedVideos.set(src, preloadVideo);
      }
    };

    const updateAdjacentPreload = (page: number) => {
      if (!manifest) return;
      const adjacent = new Set([
        manifest.transitions[page - 1],
        manifest.transitions[page],
      ]);
      manifest.transitions.forEach((transition) => preloadTransition(transition, adjacent.has(transition)));
    };

    const finishFallback = async () => {
      if (!manifest || !activeTransition) return;
      await showStablePage(state.targetPage);
      const generation = videoGeneration;
      video.pause();
      video.style.opacity = '0';
      frame.style.opacity = '1';
      dispatch({ type: 'recover' });
      window.setTimeout(() => {
        if (generation !== videoGeneration) return;
        video.removeAttribute('src');
        video.load();
      }, 220);
    };

    const settle = async () => {
      if (!manifest || !activeTransition) return;
      window.clearTimeout(canPlayTimer);
      window.clearTimeout(blendTimer);
      await showStablePage(state.targetPage);
      const generation = videoGeneration;
      video.pause();
      video.style.opacity = '0';
      frame.style.opacity = '1';
      dispatch({ type: 'settled' });
      updateAdjacentPreload(state.page);
      window.setTimeout(() => {
        if (generation !== videoGeneration) return;
        video.removeAttribute('src');
        video.load();
      }, 220);
    };

    const beginTransition = (direction: 1 | -1) => {
      if (!manifest || state.phase !== 'idle') return;
      const transition = resolveStoryVideoTransition(state.page, direction, manifest);
      if (!transition) return;
      dispatch({ type: 'request', direction });
      activeTransition = transition;
      heroEnabled = false;
      videoGeneration += 1;

      const canPlayMotion = storyVideoCanPlayMotion(
        matchMedia('(prefers-reduced-motion: reduce)').matches,
      );
      if (!canPlayMotion) {
        void showStablePage(state.targetPage).then(() => {
          dispatch({ type: 'error' });
          dispatch({ type: 'recover' });
          updateAdjacentPreload(state.page);
        });
        return;
      }

      const reverse = direction < 0;
      video.src = reverse ? transition.reverseSrc : transition.forwardSrc;
      video.poster = storyVideoPosterForDirection(transition, direction);
      video.playbackRate = transition.playbackRate;
      video.currentTime = 0;
      video.load();

      const fail = () => {
        if (disposed || state.phase === 'idle') return;
        window.clearTimeout(canPlayTimer);
        dispatch({ type: 'error' });
        void finishFallback();
      };

      video.onerror = fail;
      video.onended = () => {
        if (state.phase === 'playing') dispatch({ type: 'ended' });
        void settle();
      };
      video.oncanplay = () => {
        if (disposed || state.phase !== 'preparing') return;
        window.clearTimeout(canPlayTimer);
        dispatch({ type: 'prepared' });
        video.style.opacity = '1';
        frame.style.opacity = '1';
        void video.play().catch(fail);
        blendTimer = window.setTimeout(() => {
          if (state.phase === 'blending') dispatch({ type: 'blend-complete' });
        }, transition.startBlendMs);
      };
      canPlayTimer = window.setTimeout(fail, CAN_PLAY_TIMEOUT_MS);
    };

    const requestDirection = (direction: 1 | -1 | null) => {
      if (!manifest || !direction || state.phase !== 'idle') return;
      beginTransition(direction);
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      requestDirection(storyVideoDirectionFromDelta(event.deltaY, WHEEL_THRESHOLD));
    };

    const onTouchStart = (event: TouchEvent) => {
      touchStartY = event.touches[0]?.clientY ?? 0;
      touchHandled = false;
    };
    const onTouchMove = (event: TouchEvent) => {
      event.preventDefault();
      if (touchHandled) return;
      const currentY = event.touches[0]?.clientY ?? touchStartY;
      const direction = storyVideoDirectionFromDelta(touchStartY - currentY, SWIPE_THRESHOLD);
      if (!direction) return;
      touchHandled = true;
      requestDirection(direction);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const direction = storyVideoDirectionFromKey(event.code);
      if (!direction) return;
      event.preventDefault();
      requestDirection(direction);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (
        !manifest ||
        !heroEnabled ||
        state.phase !== 'idle' ||
        state.page !== 0 ||
        event.pointerType === 'touch'
      ) {
        return;
      }
      const pointer = {
        x: Math.max(0, Math.min(1, event.clientX / innerWidth)),
        y: Math.max(0, Math.min(1, event.clientY / innerHeight)),
      };
      const nextFrame = sourceTimeToFrame(storyGazeTime(pointer, manifest.gaze), manifest.fps);
      if (nextFrame === gazeTarget) return;
      gazeTarget = nextFrame;
      gazeCache?.request(gazeTarget);
      scheduleGazeRender();
    };

    const onNavigate = (event: Event) => {
      const requestedPage = (event as CustomEvent<{ page: number }>).detail?.page;
      if (!manifest || state.phase !== 'idle' || !Number.isInteger(requestedPage)) return;
      const page = Math.max(0, Math.min(manifest.pages.length - 1, requestedPage as number));
      state = { ...state, page, targetPage: page };
      void showStablePage(page);
      publish();
      updateAdjacentPreload(page);
    };

    const onVisibility = () => {
      if (document.hidden) {
        if (state.phase === 'playing') video.pause();
        hiddenTimer = window.setTimeout(() => {
          if (state.phase !== 'idle') void finishFallback();
        }, HIDDEN_RECOVERY_MS);
      } else {
        window.clearTimeout(hiddenTimer);
        if (state.phase === 'playing') void video.play().catch(() => undefined);
      }
    };

    void fetch(specUrl, { signal: manifestAbort.signal })
      .then((response) => response.json())
      .then(async (value: StoryVideoManifest) => {
        if (disposed) return;
        manifest = { ...value, gazeFramesDir: framesDir };
        document.documentElement.classList.add('story-video-mode');
        await showStablePage(0);
        if (disposed) return;
        publish();
        updateAdjacentPreload(0);
        if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
          gazeCache = createGazeFrameCache({
            totalFrames: manifest.gazeTotalFrames,
            priorityFrames: [
              manifest.gaze.directTime, manifest.gaze.rightTime, manifest.gaze.upTime,
              manifest.gaze.leftTime, manifest.gaze.returnTime,
            ].map((time) => sourceTimeToFrame(time, value.fps)),
            fetchFrame: async (frameNumber, signal) => {
              const response = await fetch(frameURL(frameNumber), { signal, cache: 'force-cache' });
              if (!response.ok) throw new Error(`Gaze frame ${frameNumber}: ${response.status}`);
              return response.blob();
            },
            decodeFrame: async (_frameNumber, blob) => {
              const src = URL.createObjectURL(blob);
              const image = new Image();
              image.decoding = 'async';
              image.src = src;
              try {
                await image.decode();
                return { src, image };
              } catch (error) {
                URL.revokeObjectURL(src);
                throw error;
              }
            },
            releaseFrame: ({ src, image }) => {
              image.removeAttribute('src');
              URL.revokeObjectURL(src);
            },
            onReady: scheduleGazeRender,
            onProgress: (stats) => {
              root.dataset.gazeLoaded = String(stats.loaded);
              root.dataset.gazeDecoded = String(stats.decoded);
              root.dataset.gazeFailed = String(stats.failed);
            },
          });
          if (gazeTarget < 0) gazeTarget = sourceTimeToFrame(manifest.gaze.directTime, manifest.fps);
          gazeCache.request(gazeTarget);
          gazeWarmTimer = window.setTimeout(() => gazeCache?.warm(), 500);
        }
      })
      .catch(() => undefined);

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('story:navigate', onNavigate);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      disposed = true;
      manifestAbort.abort();
      window.clearTimeout(canPlayTimer);
      window.clearTimeout(blendTimer);
      window.clearTimeout(hiddenTimer);
      window.clearTimeout(gazeWarmTimer);
      cancelAnimationFrame(gazeRaf);
      gazeCache?.dispose();
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('story:navigate', onNavigate);
      document.removeEventListener('visibilitychange', onVisibility);
      document.documentElement.classList.remove(INPUT_LOCK_CLASS, 'story-video-mode');
      videoGeneration += 1;
      preloadedVideos.forEach((preloadVideo) => {
        preloadVideo.removeAttribute('src');
        preloadVideo.load();
      });
      preloadedVideos.clear();
    };
  }, [framesDir, specUrl]);

  return (
    <div
      id="v3-scene"
      className="v3-scene is-active story-video-scene"
      ref={rootRef}
      aria-hidden="true"
    >
      <div className="v3-scene-frame">
        <img className="scene-stable-frame" alt="" draggable={false} ref={frameRef} />
        <video
          className="scene-transition-video"
          muted
          playsInline
          preload="metadata"
          ref={videoRef}
        />
      </div>
    </div>
  );
}
