import { type RectLike } from './gaze-math.ts';
import { mapPointerTime } from './scroll-video.ts';

export interface StoryFaceRegion {
  center: [number, number];
  radii: [number, number];
}

export interface StoryGazeSpec {
  sourceRange: [number, number];
  frameStart: number;
  frameEnd: number;
  directFrame: number;
  face: StoryFaceRegion;
}

export interface StoryTransitionSpec {
  id: string;
  sourceRange: [number, number];
  holdTime: number;
  frameStart: number;
  frameEnd: number;
}

export interface StoryFrameManifest {
  schema: 'story-frames/v1';
  source: string;
  fps: number;
  duration: number;
  totalFrames: number;
  framesDir: string;
  extension: string;
  gaze: StoryGazeSpec;
  pages: string[];
  transitions: StoryTransitionSpec[];
}

export interface StoryFrameState {
  frame: number;
  time: number;
  page: number;
  transition: number;
  local: number;
}

export interface StoryTimelineGazeSpec {
  sourceRange: [number, number];
  directTime: number;
  rightTime: number;
  upTime: number;
  leftTime: number;
  returnTime: number;
  deadZone: number;
}

export interface StoryTimelineTransitionSpec {
  id: string;
  sourceRange: [number, number];
  holdTime: number;
  playbackDurationMs: number;
  pacing?: Array<[number, number]>;
}

export interface StoryTimelineManifest {
  schema: 'story-timeline/v1';
  source: string;
  fps: number;
  duration: number;
  totalFrames: number;
  framesDir: string;
  extension: string;
  gaze: StoryTimelineGazeSpec;
  pages: string[];
  transitions: StoryTimelineTransitionSpec[];
}

export interface StoryTimelineState {
  sourceTime: number;
  frame: number;
  page: number;
  transition: number;
  local: number;
}

const UNIT_RECT: RectLike = { left: 0, top: 0, width: 1, height: 1 };

export const STORY_TRANSITION_DURATION_MS = 2000;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const lerp = (start: number, end: number, progress: number) =>
  start + (end - start) * clamp(progress, 0, 1);

export function sourceTimeToFrame(sourceTime: number, fps: number): number {
  return Math.max(0, Math.round(sourceTime * Math.max(1, fps)));
}

export function storyGazeTime(
  pointer: { x: number; y: number },
  gaze: StoryTimelineGazeSpec,
): number {
  const dx = pointer.x - 0.5;
  const dy = pointer.y - 0.5;
  if (Math.hypot(dx, dy) <= gaze.deadZone) return gaze.directTime;

  const angle = (Math.atan2(-dy, dx) + Math.PI * 2) % (Math.PI * 2);
  const quarter = Math.PI / 2;
  if (angle < quarter) {
    return lerp(gaze.rightTime, gaze.upTime, angle / quarter);
  }
  if (angle < Math.PI) {
    return lerp(gaze.upTime, gaze.leftTime, (angle - quarter) / quarter);
  }
  if (angle < quarter * 3) {
    return lerp(gaze.leftTime, gaze.returnTime, (angle - Math.PI) / quarter);
  }
  if (Math.abs(angle - quarter * 3) < 1e-9) return gaze.returnTime;
  const lowerAngleDistance = Math.min(
    Math.abs(angle - quarter * 3),
    Math.PI * 2 - Math.abs(angle - quarter * 3),
  );
  if (lowerAngleDistance <= Math.PI / 12) return gaze.returnTime;
  return lerp(gaze.directTime, gaze.rightTime, (angle - quarter * 3) / quarter);
}

function pacingSourceProgress(local: number, pacing?: Array<[number, number]>): number {
  const points = pacing && pacing.length >= 2 ? pacing : [[0, 0], [1, 1]] as Array<[number, number]>;
  const progress = clamp(local, 0, 1);
  for (let index = 1; index < points.length; index += 1) {
    const [previousPlayback, previousSource] = points[index - 1];
    const [nextPlayback, nextSource] = points[index];
    if (progress <= nextPlayback || index === points.length - 1) {
      const segment = Math.max(1e-6, nextPlayback - previousPlayback);
      return lerp(previousSource, nextSource, (progress - previousPlayback) / segment);
    }
  }
  return 1;
}

export function storyTimelineAtPageProgress(
  pageProgress: number,
  manifest: Pick<StoryTimelineManifest, 'fps' | 'gaze' | 'transitions'>,
  pointer: { x: number; y: number },
): StoryTimelineState {
  const pageSpan = manifest.transitions.length;
  const progress = clamp(pageProgress, 0, pageSpan);
  if (progress <= 0) {
    const sourceTime = storyGazeTime(pointer, manifest.gaze);
    return {
      sourceTime,
      frame: sourceTimeToFrame(sourceTime, manifest.fps),
      page: 0,
      transition: -1,
      local: 0,
    };
  }

  const roundedProgress = Math.round(progress);
  const atStablePage = roundedProgress > 0 && Math.abs(progress - roundedProgress) < 0.003;
  const transition = atStablePage
    ? clamp(roundedProgress - 1, 0, pageSpan - 1)
    : Math.min(pageSpan - 1, Math.ceil(progress) - 1);
  const local = atStablePage ? 1 : clamp(progress - transition, 0, 1);
  const spec = manifest.transitions[transition];
  const sourceProgress = pacingSourceProgress(local, spec.pacing);
  const sourceTime = local >= 1
    ? spec.holdTime
    : lerp(spec.sourceRange[0], spec.sourceRange[1], sourceProgress);
  return {
    sourceTime,
    frame: sourceTimeToFrame(sourceTime, manifest.fps),
    page: Math.min(manifest.transitions.length, transition + 1),
    transition,
    local,
  };
}

export function storyTransitionScrollValue(
  start: number,
  target: number,
  elapsed: number,
  duration: number = STORY_TRANSITION_DURATION_MS,
): number {
  const safeDuration = Math.max(1, duration);
  const progress = clamp(elapsed / safeDuration, 0, 1);
  return start + (target - start) * progress;
}

export function storyGazeFrame(
  pointer: { x: number; y: number },
  gaze: StoryGazeSpec,
): { frame: number; time: number } {
  const x = clamp(pointer.x, 0, 1);
  const y = clamp(pointer.y, 0, 1);
  const dx = (x - gaze.face.center[0]) / gaze.face.radii[0];
  const dy = (y - gaze.face.center[1]) / gaze.face.radii[1];
  if (dx * dx + dy * dy <= 1) {
    return { frame: gaze.frameStart + gaze.directFrame, time: gaze.sourceRange[0] };
  }
  const time = mapPointerTime(x, y, UNIT_RECT);
  const frameOffset = Math.round(
    ((time - gaze.sourceRange[0]) / (gaze.sourceRange[1] - gaze.sourceRange[0])) *
      (gaze.frameEnd - gaze.frameStart - 1),
  );
  return {
    frame: gaze.frameStart + clamp(frameOffset, 0, gaze.frameEnd - gaze.frameStart - 1),
    time,
  };
}

export function storyProgressFromScroll(
  scrollY: number,
  viewportHeight: number,
  pageCount: number,
): number {
  const pages = Math.max(1, pageCount - 1);
  return clamp(scrollY / Math.max(1, viewportHeight), 0, pages);
}

export function storyStablePageProgress(pageProgress: number, pageCount: number): number {
  return clamp(Math.round(pageProgress), 0, Math.max(0, pageCount - 1));
}

export function storyShouldAcceptWheelInput(input: {
  navigating: boolean;
  delta: number;
  modalOpen: boolean;
  ctrlKey: boolean;
}): boolean {
  return !input.navigating &&
    !input.modalOpen &&
    !input.ctrlKey &&
    Math.abs(input.delta) >= 0.5;
}

export function storyFrameAtPageProgress(
  pageProgress: number,
  manifest: Pick<StoryFrameManifest, 'gaze' | 'transitions'>,
  pointer: { x: number; y: number },
): StoryFrameState {
  const pageSpan = manifest.transitions.length;
  const progress = clamp(pageProgress, 0, pageSpan);
  if (progress <= 0) {
    const gaze = storyGazeFrame(pointer, manifest.gaze);
    return { ...gaze, page: 0, transition: -1, local: 0 };
  }

  const roundedProgress = Math.round(progress);
  const atStablePage = roundedProgress > 0 && Math.abs(progress - roundedProgress) < 0.003;
  const transition = atStablePage
    ? clamp(roundedProgress - 1, 0, pageSpan - 1)
    : Math.min(pageSpan - 1, Math.ceil(progress) - 1);
  const local = atStablePage ? 1 : clamp(progress - transition, 0, 1);
  const spec = manifest.transitions[transition];
  const frameCount = Math.max(1, spec.frameEnd - spec.frameStart);
  const frameOffset = Math.round(local * (frameCount - 1));
  const frame = spec.frameStart + clamp(frameOffset, 0, frameCount - 1);
  const time = spec.sourceRange[0] + local * (spec.holdTime - spec.sourceRange[0]);
  return {
    frame,
    time,
    page: Math.min(manifest.transitions.length, transition + 1),
    transition,
    local,
  };
}

export function storyFrameURL(
  manifest: Pick<StoryFrameManifest, 'framesDir' | 'extension' | 'totalFrames'>,
  frame: number,
): string {
  const safeFrame = clamp(Math.round(frame), 0, manifest.totalFrames - 1);
  return `${manifest.framesDir}${String(safeFrame).padStart(6, '0')}${manifest.extension}`;
}
