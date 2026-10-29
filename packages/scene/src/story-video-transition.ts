export type StoryVideoStartBridge = 'fade' | 'continuous';
export type StoryVideoEndBridge = StoryVideoStartBridge | 'jump';
export type StoryVideoBridge = StoryVideoStartBridge;
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
  forwardPoster: string;
  reversePoster: string;
  playbackDurationMs: number;
  playbackRate: number;
  startBlendMs: number;
  startBridge: StoryVideoStartBridge;
  endBridge: StoryVideoEndBridge;
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
  stableImages: string[];
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

export function storyVideoDirectionFromDelta(
  delta: number,
  threshold: number,
): 1 | -1 | null {
  if (!Number.isFinite(delta) || Math.abs(delta) < threshold) return null;
  return delta > 0 ? 1 : -1;
}

export function storyVideoCanPlayMotion(reducedMotion: boolean): boolean {
  return !reducedMotion;
}

export function storyVideoPosterForDirection(
  transition: StoryVideoTransitionSpec,
  direction: 1 | -1,
): string {
  return direction > 0 ? transition.forwardPoster : transition.reversePoster;
}

export function storyVideoDirectionFromKey(code: string): 1 | -1 | null {
  if (['ArrowDown', 'PageDown', 'Space', 'Numpad2'].includes(code)) return 1;
  if (['ArrowUp', 'PageUp', 'Numpad8'].includes(code)) return -1;
  return null;
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
