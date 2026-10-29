# Video Transition Controller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace story transition frame scrubbing with atomic forward/reverse MP4 playback while preserving hero gaze frames and fixed stable frames.

**Architecture:** Keep transition rules and the lockable state machine in `@jenrimark/scene`, put DOM video playback in a focused `StoryVideoPlayer` component, and route `ScenePlayer` story mode to it. `HomeExperience` remains responsible for page copy and performs the approved 200ms content crossfade.

**Tech Stack:** React 19, Next.js 15, TypeScript, HTML video, FFmpeg-generated H.264 MP4, Node test runner.

---

## File Structure

- Create `packages/scene/src/story-video-transition.ts`: manifest types, transition lookup, playback-rate calculation, reverse bridge calculation, and pure state reducer.
- Create `packages/scene/src/__tests__/story-video-transition.test.ts`: transition state-machine unit tests.
- Create `apps/web/public/scenes/story-v6/story-video.json`: runtime manifest for stable frames and four video transitions.
- Create `apps/web/public/media/transitions/action-01-forward.mp4` through `action-04-reverse.mp4`: eight muted H.264 assets.
- Create `apps/web/src/components/StoryVideoPlayer.tsx`: gesture gate, video lifecycle, frame display, input lock, fallback, and scene events.
- Modify `packages/scene/src/index.ts` and `packages/scene/package.json`: export the new scene module.
- Modify `apps/web/src/components/ScenePlayer.tsx`: route `story` mode to `StoryVideoPlayer` and remove the old frame-scrubbing story effect.
- Modify `apps/web/src/components/HomeExperience.tsx`: clone and fade the old copy layer, route direct navigation, and accept transition phase events.
- Modify `apps/web/src/styles/page.css`: video frame stack, 200ms copy crossfade, locked input state, and reduced-motion handling.

## Task 1: Pure Transition Contract

**Files:**
- Create: `packages/scene/src/story-video-transition.ts`
- Test: `packages/scene/src/__tests__/story-video-transition.test.ts`
- Modify: `packages/scene/src/index.ts:1-5`
- Modify: `packages/scene/package.json:8-14`

- [ ] **Step 1: Write the failing state-machine tests**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialStoryVideoState,
  reduceStoryVideoState,
  resolveStoryVideoTransition,
  storyVideoPlaybackRate,
  storyVideoReverseBridge,
  type StoryVideoManifest,
} from '../story-video-transition.ts';

const manifest: StoryVideoManifest = {
  schema: 'story-video/v1',
  fps: 24,
  duration: 30.048,
  totalFrames: 721,
  framesDir: '/scenes/story-v6/frames/',
  extension: '.webp',
  gaze: {
    sourceRange: [0, 10],
    directTime: 0,
    rightTime: 2.5,
    upTime: 5,
    leftTime: 7.25,
    returnTime: 9,
    deadZone: 0.08,
  },
  pages: ['about', 'experience', 'projects', 'work', 'contact'],
  stableFrames: [null, 312, 432, 624, 696],
  transitions: [
    {
      id: 'experience',
      sourceRange: [10, 12],
      forwardSrc: '/media/transitions/action-01-forward.mp4',
      reverseSrc: '/media/transitions/action-01-reverse.mp4',
      playbackDurationMs: 3000,
      playbackRate: 0.666667,
      startBlendMs: 200,
      startBridge: 'fade',
      endBridge: 'jump',
      endHoldFrame: 312,
    },
    {
      id: 'projects',
      sourceRange: [14.5, 18],
      forwardSrc: '/media/transitions/action-02-forward.mp4',
      reverseSrc: '/media/transitions/action-02-reverse.mp4',
      playbackDurationMs: 3000,
      playbackRate: 1.166667,
      startBlendMs: 200,
      startBridge: 'fade',
      endBridge: 'continuous',
      endHoldFrame: 432,
    },
    {
      id: 'work',
      sourceRange: [21.07, 26],
      forwardSrc: '/media/transitions/action-03-forward.mp4',
      reverseSrc: '/media/transitions/action-03-reverse.mp4',
      playbackDurationMs: 4000,
      playbackRate: 1.239583,
      startBlendMs: 200,
      startBridge: 'fade',
      endBridge: 'continuous',
      endHoldFrame: 624,
    },
    {
      id: 'contact',
      sourceRange: [26, 29],
      forwardSrc: '/media/transitions/action-04-forward.mp4',
      reverseSrc: '/media/transitions/action-04-reverse.mp4',
      playbackDurationMs: 3000,
      playbackRate: 1,
      startBlendMs: 200,
      startBridge: 'continuous',
      endBridge: 'continuous',
      endHoldFrame: 696,
    },
  ],
};

test('resolves only adjacent forward and reverse transitions', () => {
  assert.equal(resolveStoryVideoTransition(0, 1, manifest)?.id, 'experience');
  assert.equal(resolveStoryVideoTransition(4, -1, manifest)?.id, 'contact');
  assert.equal(resolveStoryVideoTransition(0, -1, manifest), null);
  assert.equal(resolveStoryVideoTransition(4, 1, manifest), null);
});

test('a new request is ignored until the current transition settles', () => {
  let state = initialStoryVideoState();
  state = reduceStoryVideoState(state, { type: 'request', direction: 1 }, manifest);
  assert.equal(state.phase, 'preparing');
  assert.equal(state.targetPage, 1);

  const locked = reduceStoryVideoState(state, { type: 'request', direction: 1 }, manifest);
  assert.equal(locked, state);
});

test('one request walks through preparation, playback, settling, and unlock', () => {
  let state = initialStoryVideoState();
  state = reduceStoryVideoState(state, { type: 'request', direction: 1 }, manifest);
  state = reduceStoryVideoState(state, { type: 'prepared' }, manifest);
  assert.equal(state.phase, 'blending');
  state = reduceStoryVideoState(state, { type: 'blend-complete' }, manifest);
  assert.equal(state.phase, 'playing');
  state = reduceStoryVideoState(state, { type: 'ended' }, manifest);
  assert.equal(state.phase, 'settling');
  state = reduceStoryVideoState(state, { type: 'settled' }, manifest);
  assert.equal(state.phase, 'idle');
  assert.equal(state.page, 1);
});

test('error recovery locks the page and discards pending requests', () => {
  let state = initialStoryVideoState();
  state = reduceStoryVideoState(state, { type: 'request', direction: 1 }, manifest);
  state = reduceStoryVideoState(state, { type: 'error' }, manifest);
  assert.equal(state.phase, 'error');
  assert.equal(
    reduceStoryVideoState(state, { type: 'request', direction: 1 }, manifest),
    state,
  );
  state = reduceStoryVideoState(state, { type: 'recover' }, manifest);
  assert.equal(state.phase, 'idle');
  assert.equal(state.page, 1);
});

test('playback rates map source duration to page duration', () => {
  assert.equal(storyVideoPlaybackRate(2, 3000), 0.666667);
  assert.equal(storyVideoPlaybackRate(3.5, 3000), 1.166667);
  assert.equal(storyVideoPlaybackRate(4.958333, 4000), 1.239583);
  assert.equal(storyVideoPlaybackRate(3, 3000), 1);
});

test('reverse bridges mirror forward bridges', () => {
  assert.equal(storyVideoReverseBridge(manifest.transitions[0], 'end'), 'fade');
  assert.equal(storyVideoReverseBridge(manifest.transitions[0], 'start'), 'fade');
  assert.equal(storyVideoReverseBridge(manifest.transitions[2], 'start'), 'continuous');
  assert.equal(storyVideoReverseBridge(manifest.transitions[2], 'end'), 'fade');
});
```

- [ ] **Step 2: Run the tests and verify the expected failure**

Run: `node --test --experimental-strip-types packages/scene/src/__tests__/story-video-transition.test.ts`

Expected: FAIL because `../story-video-transition.ts` cannot be resolved.

- [ ] **Step 3: Implement the pure transition module**

Create `packages/scene/src/story-video-transition.ts`:

```ts
export type StoryVideoBridge = 'fade' | 'continuous';
export type StoryVideoPhase =
  | 'idle'
  | 'preparing'
  | 'blending'
  | 'playing'
  | 'settling'
  | 'error';

export interface StoryVideoGazeSpec {
  sourceRange: [number, number];
  directTime: number;
  rightTime: number;
  upTime: number;
  leftTime: number;
  returnTime: number;
  deadZone: number;
}

export interface StoryVideoTransitionSpec {
  id: string;
  sourceRange: [number, number];
  forwardSrc: string;
  reverseSrc: string;
  playbackDurationMs: number;
  playbackRate: number;
  startBlendMs: number;
  startBridge: StoryVideoBridge;
  endBridge: StoryVideoBridge;
  endHoldFrame: number;
}

export interface StoryVideoManifest {
  schema: 'story-video/v1';
  fps: number;
  duration: number;
  totalFrames: number;
  framesDir: string;
  extension: string;
  gaze: StoryVideoGazeSpec;
  pages: string[];
  stableFrames: Array<number | null>;
  transitions: StoryVideoTransitionSpec[];
}

export interface StoryVideoState {
  phase: StoryVideoPhase;
  page: number;
  targetPage: number;
  transitionId: string | null;
  direction: 1 | -1 | 0;
}

export type StoryVideoEvent =
  | { type: 'request'; direction: 1 | -1 }
  | { type: 'prepared' }
  | { type: 'blend-complete' }
  | { type: 'ended' }
  | { type: 'error' }
  | { type: 'settled' }
  | { type: 'recover' };

export function initialStoryVideoState(page = 0): StoryVideoState {
  return {
    phase: 'idle',
    page,
    targetPage: page,
    transitionId: null,
    direction: 0,
  };
}

export function resolveStoryVideoTransition(
  page: number,
  direction: 1 | -1,
  manifest: Pick<StoryVideoManifest, 'transitions'>,
): StoryVideoTransitionSpec | null {
  const index = direction > 0 ? page : page - 1;
  return manifest.transitions[index] ?? null;
}

export function storyVideoPlaybackRate(
  sourceDurationSeconds: number,
  playbackDurationMs: number,
): number {
  const sourceDuration = Math.max(0, sourceDurationSeconds);
  const playbackSeconds = Math.max(0.001, playbackDurationMs / 1000);
  return Number((sourceDuration / playbackSeconds).toFixed(6));
}

export function storyVideoReverseBridge(
  transition: StoryVideoTransitionSpec,
  edge: 'start' | 'end',
): StoryVideoBridge {
  if (edge === 'start') {
    return transition.endBridge === 'jump' ? 'fade' : 'continuous';
  }
  return transition.startBridge === 'fade' ? 'fade' : 'continuous';
}

export function reduceStoryVideoState(
  state: StoryVideoState,
  event: StoryVideoEvent,
  manifest: Pick<StoryVideoManifest, 'transitions'>,
): StoryVideoState {
  if (event.type === 'request') {
    if (state.phase !== 'idle') return state;
    const transition = resolveStoryVideoTransition(state.page, event.direction, manifest);
    if (!transition) return state;
    return {
      ...state,
      phase: 'preparing',
      targetPage: state.page + event.direction,
      transitionId: transition.id,
      direction: event.direction,
    };
  }

  if (state.phase === 'preparing' && event.type === 'prepared') {
    return { ...state, phase: 'blending' };
  }
  if (state.phase === 'blending' && event.type === 'blend-complete') {
    return { ...state, phase: 'playing' };
  }
  if (state.phase === 'playing' && event.type === 'ended') {
    return { ...state, phase: 'settling' };
  }
  if (state.phase === 'settling' && event.type === 'settled') {
    return initialStoryVideoState(state.targetPage);
  }
  if (event.type === 'error' && state.phase !== 'idle') {
    return { ...state, phase: 'error' };
  }
  if (state.phase === 'error' && event.type === 'recover') {
    return initialStoryVideoState(state.targetPage);
  }
  return state;
}
```

- [ ] **Step 4: Export the module**

Add to `packages/scene/src/index.ts`:

```ts
export * from './story-video-transition.ts';
```

Add to the `exports` object in `packages/scene/package.json`:

```json
"./story-video-transition": "./src/story-video-transition.ts"
```

- [ ] **Step 5: Run the tests and make them pass**

Run: `node --test --experimental-strip-types packages/scene/src/__tests__/story-video-transition.test.ts`

Expected: PASS for all six tests.

- [ ] **Step 6: Commit**

```bash
git add packages/scene/src/story-video-transition.ts packages/scene/src/__tests__/story-video-transition.test.ts packages/scene/src/index.ts packages/scene/package.json
git commit -m "feat: add atomic story video transition state machine"
```

## Task 2: Video Assets And Manifest

**Files:**
- Create: `apps/web/public/media/transitions/action-01-forward.mp4`
- Create: `apps/web/public/media/transitions/action-01-reverse.mp4`
- Create: `apps/web/public/media/transitions/action-02-forward.mp4`
- Create: `apps/web/public/media/transitions/action-02-reverse.mp4`
- Create: `apps/web/public/media/transitions/action-03-forward.mp4`
- Create: `apps/web/public/media/transitions/action-03-reverse.mp4`
- Create: `apps/web/public/media/transitions/action-04-forward.mp4`
- Create: `apps/web/public/media/transitions/action-04-reverse.mp4`
- Create: `apps/web/public/scenes/story-v6/story-video.json`
- Test: `packages/scene/src/__tests__/story-video-manifest.test.ts`

- [ ] **Step 1: Write the failing manifest test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { StoryVideoManifest } from '../story-video-transition.ts';

test('story-video manifest matches the approved timeline and assets', async () => {
  const raw = await readFile(
    new URL('../../../../apps/web/public/scenes/story-v6/story-video.json', import.meta.url),
    'utf8',
  );
  const manifest = JSON.parse(raw) as StoryVideoManifest;
  assert.equal(manifest.schema, 'story-video/v1');
  assert.deepEqual(manifest.stableFrames, [null, 312, 432, 624, 696]);
  assert.deepEqual(
    manifest.transitions.map((item) => item.playbackDurationMs),
    [3000, 3000, 4000, 3000],
  );
  assert.deepEqual(
    manifest.transitions.map((item) => item.sourceRange),
    [[10, 12], [14.5, 18], [21.07, 26], [26, 29]],
  );
  assert.deepEqual(
    manifest.transitions.map((item) => item.playbackRate),
    [0.666667, 1.166667, 1.239583, 1],
  );
  manifest.transitions.forEach((item) => {
    assert.ok(item.forwardSrc.startsWith('/media/transitions/'));
    assert.ok(item.reverseSrc.startsWith('/media/transitions/'));
  });
});
```

- [ ] **Step 2: Run the test and verify the expected failure**

Run: `node --test --experimental-strip-types packages/scene/src/__tests__/story-video-manifest.test.ts`

Expected: FAIL because `story-video.json` does not exist.

- [ ] **Step 3: Generate eight canonical muted MP4 assets**

Run one command per source clip. The existing range clips are inputs only; canonical outputs are committed.

```bash
mkdir -p apps/web/public/media/transitions
ffmpeg -i apps/web/public/media/actions/action-01_10.00-12.00.mp4 -map 0:v:0 -c:v copy -an apps/web/public/media/transitions/action-01-forward.mp4
ffmpeg -i apps/web/public/media/actions/action-02_14.50-18.00.mp4 -map 0:v:0 -c:v copy -an apps/web/public/media/transitions/action-02-forward.mp4
ffmpeg -i apps/web/public/media/actions/action-03_21.07-26.00.mp4 -map 0:v:0 -c:v copy -an apps/web/public/media/transitions/action-03-forward.mp4
ffmpeg -i apps/web/public/media/actions/action-04_26.00-29.00.mp4 -map 0:v:0 -c:v copy -an apps/web/public/media/transitions/action-04-forward.mp4
ffmpeg -i apps/web/public/media/transitions/action-01-forward.mp4 -vf reverse -an -r 24 -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p apps/web/public/media/transitions/action-01-reverse.mp4
ffmpeg -i apps/web/public/media/transitions/action-02-forward.mp4 -vf reverse -an -r 24 -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p apps/web/public/media/transitions/action-02-reverse.mp4
ffmpeg -i apps/web/public/media/transitions/action-03-forward.mp4 -vf reverse -an -r 24 -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p apps/web/public/media/transitions/action-03-reverse.mp4
ffmpeg -i apps/web/public/media/transitions/action-04-forward.mp4 -vf reverse -an -r 24 -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p apps/web/public/media/transitions/action-04-reverse.mp4
```

- [ ] **Step 4: Create the runtime manifest**

Create `apps/web/public/scenes/story-v6/story-video.json` with the exact object used by Task 1's `StoryVideoManifest` test fixture. Set these manifest fields:

```json
{
  "schema": "story-video/v1",
  "source": "../../media/formal-v4.mp4",
  "fps": 24,
  "duration": 30.048,
  "totalFrames": 721,
  "framesDir": "/scenes/story-v6/frames/",
  "extension": ".webp",
  "gaze": {
    "sourceRange": [0, 10],
    "directTime": 0,
    "rightTime": 2.5,
    "upTime": 5,
    "leftTime": 7.25,
    "returnTime": 9,
    "deadZone": 0.08
  },
  "pages": ["about", "experience", "projects", "work", "contact"],
  "stableFrames": [null, 312, 432, 624, 696],
  "transitions": [
    {
      "id": "experience",
      "sourceRange": [10, 12],
      "forwardSrc": "/media/transitions/action-01-forward.mp4",
      "reverseSrc": "/media/transitions/action-01-reverse.mp4",
      "playbackDurationMs": 3000,
      "playbackRate": 0.666667,
      "startBlendMs": 200,
      "startBridge": "fade",
      "endBridge": "jump",
      "endHoldFrame": 312
    },
    {
      "id": "projects",
      "sourceRange": [14.5, 18],
      "forwardSrc": "/media/transitions/action-02-forward.mp4",
      "reverseSrc": "/media/transitions/action-02-reverse.mp4",
      "playbackDurationMs": 3000,
      "playbackRate": 1.166667,
      "startBlendMs": 200,
      "startBridge": "fade",
      "endBridge": "continuous",
      "endHoldFrame": 432
    },
    {
      "id": "work",
      "sourceRange": [21.07, 26],
      "forwardSrc": "/media/transitions/action-03-forward.mp4",
      "reverseSrc": "/media/transitions/action-03-reverse.mp4",
      "playbackDurationMs": 4000,
      "playbackRate": 1.239583,
      "startBlendMs": 200,
      "startBridge": "fade",
      "endBridge": "continuous",
      "endHoldFrame": 624
    },
    {
      "id": "contact",
      "sourceRange": [26, 29],
      "forwardSrc": "/media/transitions/action-04-forward.mp4",
      "reverseSrc": "/media/transitions/action-04-reverse.mp4",
      "playbackDurationMs": 3000,
      "playbackRate": 1,
      "startBlendMs": 200,
      "startBridge": "continuous",
      "endBridge": "continuous",
      "endHoldFrame": 696
    }
  ]
}
```

- [ ] **Step 5: Verify media durations and the manifest test**

Run: `for f in apps/web/public/media/transitions/*.mp4; do ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1 "$f"; done`

Expected: forward/reverse pairs have matching durations; action three is approximately 4.958s and the others are 2.000s, 3.500s, and 3.000s.

Run: `node --test --experimental-strip-types packages/scene/src/__tests__/story-video-manifest.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/public/media/transitions apps/web/public/scenes/story-v6/story-video.json packages/scene/src/__tests__/story-video-manifest.test.ts
git commit -m "feat: add forward and reverse story transition media"
```

## Task 3: DOM Video Player

**Files:**
- Create: `apps/web/src/components/StoryVideoPlayer.tsx`
- Modify: `apps/web/src/styles/page.css:239-243`

- [ ] **Step 1: Add the focused player component**

Create `apps/web/src/components/StoryVideoPlayer.tsx`. It must own only story DOM behavior: one stable `<img>`, one `<video>`, one state reference, gesture listeners, transition lifecycle, and `v4sceneprogress` events.

```tsx
'use client';

import { useEffect, useRef } from 'react';
import {
  initialStoryVideoState,
  reduceStoryVideoState,
  resolveStoryVideoTransition,
  sourceTimeToFrame,
  storyGazeTime,
  storyVideoReverseBridge,
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
    let touchStartY = 0;
    let touchHandled = false;
    let heroEnabled = true;

    const frameURL = (frameNumber: number) =>
      `${framesDir}${String(Math.max(0, Math.min((manifest?.totalFrames ?? 1) - 1, Math.round(frameNumber)))).padStart(6, '0')}${manifest?.extension ?? '.webp'}`;

    const decodeFrame = async (frameNumber: number) => {
      const requestId = ++frameRequestId;
      frame.src = frameURL(frameNumber);
      if (typeof frame.decode === 'function') await frame.decode().catch(() => undefined);
      return requestId === frameRequestId;
    };

    const publish = () => {
      const page = state.phase === 'idle' ? state.page : state.targetPage;
      const detail: ProgressDetail = {
        progress: page / Math.max(1, (manifest?.pages.length ?? 1) - 1),
        time: manifest?.stableFrames[page] == null ? 0 : (manifest.stableFrames[page] ?? 0) / (manifest?.fps || 24),
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
    };

    const showStablePage = async (page: number) => {
      if (!manifest) return;
      heroEnabled = page === 0;
      const stableFrame = manifest.stableFrames[page];
      await decodeFrame(stableFrame ?? sourceTimeToFrame(manifest.gaze.directTime, manifest.fps));
    };

    const finishFallback = async () => {
      if (!manifest || !activeTransition) return;
      const targetPage = state.targetPage;
      await showStablePage(targetPage);
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.style.opacity = '0';
      frame.style.opacity = '1';
      dispatch({ type: 'recover' });
      await showStablePage(state.page);
    };

    const settle = async () => {
      if (!manifest || !activeTransition) return;
      window.clearTimeout(canPlayTimer);
      window.clearTimeout(blendTimer);
      const targetPage = state.targetPage;
      await showStablePage(targetPage);
      video.pause();
      video.style.opacity = '0';
      frame.style.opacity = '1';
      dispatch({ type: 'settled' });
    };

    const beginTransition = (direction: 1 | -1) => {
      if (!manifest || state.phase !== 'idle') return;
      const previousPage = state.page;
      const transition = resolveStoryVideoTransition(previousPage, direction, manifest);
      if (!transition) return;
      dispatch({ type: 'request', direction });
      activeTransition = transition;
      heroEnabled = false;

      const reverse = direction < 0;
      const startBridge = reverse
        ? storyVideoReverseBridge(transition, 'start')
        : transition.startBridge;
      const src = reverse ? transition.reverseSrc : transition.forwardSrc;
      video.src = src;
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
        frame.style.opacity = startBridge === 'fade' ? '0' : '1';
        void video.play().catch(fail);
        blendTimer = window.setTimeout(() => {
          if (state.phase === 'blending') dispatch({ type: 'blend-complete' });
        }, transition.startBlendMs);
      };
      canPlayTimer = window.setTimeout(fail, CAN_PLAY_TIMEOUT_MS);
    };

    const requestDirection = (direction: 1 | -1) => {
      if (!manifest || state.phase !== 'idle') return;
      beginTransition(direction);
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (Math.abs(event.deltaY) < WHEEL_THRESHOLD) return;
      requestDirection(event.deltaY > 0 ? 1 : -1);
    };

    const onTouchStart = (event: TouchEvent) => {
      touchStartY = event.touches[0]?.clientY ?? 0;
      touchHandled = false;
    };
    const onTouchMove = (event: TouchEvent) => {
      event.preventDefault();
      if (touchHandled) return;
      const currentY = event.touches[0]?.clientY ?? touchStartY;
      const delta = touchStartY - currentY;
      if (Math.abs(delta) < SWIPE_THRESHOLD) return;
      touchHandled = true;
      requestDirection(delta > 0 ? 1 : -1);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const nextKeys = new Set(['ArrowDown', 'PageDown', 'Space', 'Numpad2']);
      const previousKeys = new Set(['ArrowUp', 'PageUp', 'Numpad8']);
      if (!nextKeys.has(event.code) && !previousKeys.has(event.code)) return;
      event.preventDefault();
      requestDirection(nextKeys.has(event.code) ? 1 : -1);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!manifest || !heroEnabled || state.phase !== 'idle' || state.page !== 0 || event.pointerType === 'touch') return;
      const pointer = {
        x: Math.max(0, Math.min(1, event.clientX / innerWidth)),
        y: Math.max(0, Math.min(1, event.clientY / innerHeight)),
      };
      void decodeFrame(sourceTimeToFrame(storyGazeTime(pointer, manifest.gaze), manifest.fps));
    };

    const onNavigate = (event: Event) => {
      const requestedPage = (event as CustomEvent<{ page: number }>).detail?.page;
      if (!manifest || state.phase !== 'idle' || !Number.isInteger(requestedPage)) return;
      const page = Math.max(0, Math.min(manifest.pages.length - 1, requestedPage as number));
      state = { ...state, page, targetPage: page };
      void showStablePage(page);
      publish();
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

    void fetch(specUrl)
      .then((response) => response.json())
      .then(async (value: StoryVideoManifest) => {
        if (disposed) return;
        manifest = value;
        document.documentElement.classList.add('story-video-mode');
        await showStablePage(0);
        publish();
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
      window.clearTimeout(canPlayTimer);
      window.clearTimeout(blendTimer);
      window.clearTimeout(hiddenTimer);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('story:navigate', onNavigate);
      document.removeEventListener('visibilitychange', onVisibility);
      document.documentElement.classList.remove(INPUT_LOCK_CLASS, 'story-video-mode');
    };
  }, [framesDir, specUrl]);

  return (
    <div id="v3-scene" className="v3-scene is-active story-video-scene" ref={rootRef} aria-hidden="true">
      <div className="v3-scene-frame">
        <img className="scene-stable-frame" alt="" draggable={false} ref={frameRef} />
        <video className="scene-transition-video" muted playsInline preload="metadata" ref={videoRef} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add focused CSS**

Append to `apps/web/src/styles/page.css`:

```css
.story-video-scene .scene-stable-frame,
.story-video-scene .scene-transition-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:opacity 200ms ease}
.story-video-scene .scene-transition-video{opacity:0;pointer-events:none}
html.story-video-mode{overflow:hidden;touch-action:none}
html.story-video-mode .scene-spacer{height:100svh}
html.story-video-locked{cursor:progress}
@media(prefers-reduced-motion:reduce){.story-video-scene .scene-stable-frame,.story-video-scene .scene-transition-video{transition:none}}
```

- [ ] **Step 3: Run TypeScript checking**

Run: `./apps/web/node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit`

Expected: PASS with no diagnostics.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/StoryVideoPlayer.tsx apps/web/src/styles/page.css
git commit -m "feat: add atomic video story player"
```

## Task 4: Route Story Mode To The Video Player

**Files:**
- Modify: `apps/web/src/components/ScenePlayer.tsx:1-21`
- Modify: `apps/web/src/components/ScenePlayer.tsx:56-352`
- Modify: `apps/web/src/components/ScenePlayer.tsx:1124-1157`
- Modify: `apps/web/public/scenes/manifest.json:5-13`

- [ ] **Step 1: Add the route regression test**

Add to `packages/scene/src/__tests__/story-video-manifest.test.ts`:

```ts
test('scene registry points story mode at the video manifest', async () => {
  const raw = await readFile(
    new URL('../../../../apps/web/public/scenes/manifest.json', import.meta.url),
    'utf8',
  );
  const registry = JSON.parse(raw) as {
    scenes: Array<{ id: string; mode: string; spec: string }>;
  };
  const story = registry.scenes.find((item) => item.id === 'story-v6');
  assert.equal(story?.mode, 'story');
  assert.equal(story?.spec, 'story-video.json');
});
```

- [ ] **Step 2: Run the test and verify the expected failure**

Run: `node --test --experimental-strip-types packages/scene/src/__tests__/story-video-manifest.test.ts`

Expected: FAIL because `spec` is still `story.json`.

- [ ] **Step 3: Switch the registry**

Change `apps/web/public/scenes/manifest.json` story entry to:

```json
{
  "id": "story-v6",
  "title": "五页动作视频叙事",
  "frameCount": 721,
  "duration": 30.048,
  "fps": 24,
  "framesDir": "frames/",
  "mode": "story",
  "spec": "story-video.json"
}
```

- [ ] **Step 4: Replace the old story effect**

In `apps/web/src/components/ScenePlayer.tsx`:

- Import `StoryVideoPlayer` after the existing component imports.
- Remove imports used only by the old story effect: `STORY_TRANSITION_DURATION_MS`, `storyFrameURL`, `storyProgressFromScroll`, `storyTimelineAtPageProgress`, `storyTransitionScrollValue`, `sourceTimeToFrame`, and `StoryTimelineManifest`.
- Delete the entire `/* story 模式 */` effect from lines 56-352.
- Keep `isStory` so mode routing remains explicit.
- Change the component return to route story mode before the shared scene root:

```tsx
  if (isStory && storyConfig) {
    return <StoryVideoPlayer framesDir={storyConfig.framesDir} specUrl={storyConfig.specUrl} />;
  }
```

- Change the image condition from `isFrames || isSpec || isStory` to `isFrames || isSpec`.
- Change the video-mode effect guard from `if (isFrames || isSpec || isStory) return;` to `if (isFrames || isSpec) return;`.
- Update the effect dependency array to `[isFrames, isSpec]`.

- [ ] **Step 5: Run tests and TypeScript checking**

Run: `pnpm --filter @jenrimark/web test`

Expected: PASS.

Run: `./apps/web/node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/ScenePlayer.tsx apps/web/public/scenes/manifest.json packages/scene/src/__tests__/story-video-manifest.test.ts
git commit -m "feat: route story mode through atomic video playback"
```

## Task 5: Content Crossfade And Direct Navigation

**Files:**
- Modify: `apps/web/src/components/HomeExperience.tsx:64-205`
- Modify: `apps/web/src/styles/page.css:1-50`

- [ ] **Step 1: Crossfade the old DOM copy layer without refactoring scene JSX**

In `HomeExperience`, add a ref and timer cleanup for the active scene:

```ts
const activeSceneRef = useRef('about');
const copyFadeTimerRef = useRef(0);
```

Add the following cleanup to the existing effect that registers `v4sceneprogress`:

```ts
      window.clearTimeout(copyFadeTimerRef.current);
```

Replace the existing `applyScene` function with:

```ts
    const applyScene = (id: string) => {
      if (activeSceneRef.current !== id) {
        const source = document.querySelector<HTMLElement>('#scene-copy');
        if (source && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
          const leaving = source.cloneNode(true) as HTMLElement;
          leaving.id = '';
          leaving.classList.add('scene-copy-clone');
          leaving.setAttribute('aria-hidden', 'true');
          source.parentElement?.appendChild(leaving);
          requestAnimationFrame(() => leaving.classList.add('is-fading'));
          window.clearTimeout(copyFadeTimerRef.current);
          copyFadeTimerRef.current = window.setTimeout(() => leaving.remove(), 220);
        }
        activeSceneRef.current = id;
        setActiveScene(id);
      }
      document.querySelector('#portal-dock')?.classList.toggle('is-expanded', id === 'about' || id === 'contact');
      document.querySelector('.site-footer')?.classList.toggle('is-visible', id === 'contact');
    };
```

Keep the existing `id="scene-copy"` JSX unchanged. The clone is created only while the old scene is still rendered, then fades out over 200ms to reveal the React-updated target scene underneath.

Update the existing anchor handler so direct header navigation dispatches `story:navigate` in video mode:

```ts
      const videoMode = document.documentElement.classList.contains('story-video-mode');
      const snapMode = document.documentElement.classList.contains('scene-snap-enabled');
      if (storyPageIndex >= 0 && (snapMode || videoMode)) {
        window.dispatchEvent(new CustomEvent('story:navigate', { detail: { page: storyPageIndex } }));
        history.replaceState(null, '', href);
        return;
      }
```

Replace only the existing `if (storyPageIndex >= 0 && document.documentElement.classList.contains('scene-snap-enabled'))` block with this expanded block. The fallback `scrollIntoView` path remains unchanged for non-story pages.

- [ ] **Step 2: Update the progress event type**

The local event detail type may include the phase for diagnostics:

```ts
const detail = (event as CustomEvent<{
  progress: number;
  time: number;
  page?: number;
  phase?: string;
}>).detail;
```

The existing `applyScene` call remains unchanged. `StoryVideoPlayer` dispatches the target page immediately when a transition starts, so the old copy fades out while the target copy appears and the video begins its frame fade.

- [ ] **Step 3: Add copy crossfade CSS**

Append to `apps/web/src/styles/page.css`:

```css
.scene-copy-clone{pointer-events:none;opacity:1;transition:opacity 200ms ease}
.scene-copy-clone.is-fading{opacity:0}
@media(prefers-reduced-motion:reduce){.scene-copy-clone{display:none}}
```

- [ ] **Step 4: Run TypeScript checking and the full test suite**

Run: `./apps/web/node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit`

Expected: PASS.

Run: `pnpm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/HomeExperience.tsx apps/web/src/styles/page.css
git commit -m "feat: crossfade story copy during atomic transitions"
```

## Task 6: Reduced Motion And Failure Recovery

**Files:**
- Modify: `apps/web/src/components/StoryVideoPlayer.tsx`
- Test: `packages/scene/src/__tests__/story-video-transition.test.ts`

- [ ] **Step 1: Add reduced-motion transition tests**

```ts
test('reduced-motion request still locks exactly one target page', () => {
  let state = initialStoryVideoState();
  state = reduceStoryVideoState(state, { type: 'request', direction: 1 }, manifest);
  state = reduceStoryVideoState(state, { type: 'error' }, manifest);
  state = reduceStoryVideoState(state, { type: 'recover' }, manifest);
  assert.equal(state.phase, 'idle');
  assert.equal(state.page, 1);
});
```

- [ ] **Step 2: Skip video playback under reduced motion**

In `StoryVideoPlayer.beginTransition`, immediately branch before assigning `video.src`:

```ts
      const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reducedMotion) {
        void showStablePage(state.targetPage).then(() => {
          dispatch({ type: 'error' });
          dispatch({ type: 'recover' });
        });
        return;
      }
```

This intentionally uses the same locked fallback path: exactly one accepted request, one stable-page result, and no further input until recovery.

- [ ] **Step 3: Verify timeout recovery does not retain a video source**

In `finishFallback`, retain the existing `removeAttribute('src')` and `video.load()` calls. Add an assertion to `story-video-transition.test.ts` that `recover` creates a fresh idle state rather than retaining `transitionId`:

```ts
test('recovery clears transition identity', () => {
  let state = initialStoryVideoState();
  state = reduceStoryVideoState(state, { type: 'request', direction: 1 }, manifest);
  state = reduceStoryVideoState(state, { type: 'error' }, manifest);
  state = reduceStoryVideoState(state, { type: 'recover' }, manifest);
  assert.equal(state.transitionId, null);
  assert.equal(state.direction, 0);
});
```

- [ ] **Step 4: Run all tests and TypeScript checking**

Run: `pnpm test`

Expected: PASS.

Run: `./apps/web/node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/StoryVideoPlayer.tsx packages/scene/src/__tests__/story-video-transition.test.ts
git commit -m "feat: handle reduced motion and video transition recovery"
```

## Task 7: Browser Acceptance And Performance Audit

**Files:**
- No production files unless a verified defect is found.

- [ ] **Step 1: Start the web app**

Run: `pnpm dev`

Expected: `http://localhost:3000` returns HTTP 200.

- [ ] **Step 2: Verify forward and reverse behavior**

On `http://localhost:3000`:

1. Move the pointer on the hero and confirm the face follows without loading transition video.
2. Scroll down once and confirm only action one plays for 3s, copy crossfades to 学履, and frame 312 is displayed at completion.
3. Continue downward and verify durations 3s, 4s, and 3s and stable frames 432, 624, and 696.
4. During each playback, send repeated wheel, touch, and arrow-key input. Verify none changes the page or playback direction.
5. Scroll upward through all four reverse clips and verify the hero gaze interaction resumes only after the direct frame is shown.
6. Repeat on a touch viewport and verify one vertical swipe produces one transition.
7. Repeat with reduced motion enabled and verify stable pages switch without video playback or locked input.

- [ ] **Step 3: Verify failure fallback**

In browser dev tools, block `/media/transitions/action-02-forward.mp4`, then trigger the second transition.

Expected: the page fades directly to frame 432 and input unlocks within 2.2s. No blank video frame remains.

- [ ] **Step 4: Audit network and decoding**

Record a browser network profile while traversing all five pages.

Expected:
- No requests for `/scenes/story-v6/frames/000241.webp` through `/scenes/story-v6/frames/000720.webp` during normal transitions.
- Only hero gaze frames and stable frames `000312`, `000432`, `000624`, and `000696` are requested.
- No more than one transition video is active at a time.
- Adjacent videos are loaded before non-adjacent videos.

- [ ] **Step 5: Run final verification**

Run: `pnpm test`

Expected: PASS.

Run: `pnpm build`

Expected: PASS.

Run: `git diff --check`

Expected: no output.

- [ ] **Step 6: Commit any verified fixes**

```bash
git add apps/web/src/components/StoryVideoPlayer.tsx apps/web/src/styles/page.css packages/scene/src/story-video-transition.ts packages/scene/src/__tests__/story-video-transition.test.ts
git commit -m "fix: resolve video transition acceptance findings"
```

If no defects are found, do not create an empty commit.

## Self-Review

- Spec coverage: hero gaze, fixed stable frames, four forward clips, four reverse clips, 3/3/4/3 playback, input discard, 200ms crossfade, reduced motion, error fallback, and network reduction each map to a task.
- Type consistency: `StoryVideoManifest`, `StoryVideoTransitionSpec`, `StoryVideoState`, `StoryVideoEvent`, `resolveStoryVideoTransition`, `reduceStoryVideoState`, and `storyVideoReverseBridge` use the same names in tests, implementation, and DOM player.
- Scope: one feature with one controller and one media family. Existing frame scrubbing remains only as an unused fallback asset and is removed from the normal story path.
- Ambiguity: direct header navigation remains a stable-page jump; only wheel, touch, and directional keyboard input trigger video transitions.
