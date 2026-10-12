import { pointerToPose, frameTime, type RectLike } from './gaze-math.ts';

export const EYE_END_PROGRESS = 0.14;
export const EYE_DURATION = 10;
export const INTERACTION_FPS = 60;
export const SCROLL_SEEK_EPSILON = 0.012;
export const SCROLL_SMOOTH_FACTOR = 0.22;

export const SCROLL_TIMELINE: ReadonlyArray<readonly [number, number]> = Object.freeze([
  [0, 10],
  [0.08, 14],
  [0.12, 15],
  [0.2, 16],
  [0.34, 19],
  [0.48, 22],
  [0.55, 23],
  [0.64, 24],
  [0.76, 26],
  [0.86, 28],
  [0.93, 29],
  [1, 30.048],
] as const);

export function mapScrollTime(progress: number, duration = 30.048): number {
  const p = Math.max(0, Math.min(1, progress));
  const scale = Math.max(0, duration - EYE_DURATION) / (30.048 - EYE_DURATION);
  for (let index = 1; index < SCROLL_TIMELINE.length; index += 1) {
    const [endProgress, endTime] = SCROLL_TIMELINE[index];
    if (p <= endProgress) {
      const [startProgress, startTime] = SCROLL_TIMELINE[index - 1];
      const local = (p - startProgress) / (endProgress - startProgress);
      return EYE_DURATION + (startTime + (endTime - startTime) * local - EYE_DURATION) * scale;
    }
  }
  return duration;
}

export function needsScrollSeek(input: {
  currentTime: number;
  targetTime: number;
  seeking: boolean;
}): boolean {
  return !input.seeking && Math.abs(input.currentTime - input.targetTime) > SCROLL_SEEK_EPSILON;
}

export function smoothProgress(current: number, target: number, factor = SCROLL_SMOOTH_FACTOR): number {
  const safeFactor = Math.max(0, Math.min(1, factor));
  const next = current + (target - current) * safeFactor;
  return Math.abs(target - next) < 0.0003 ? target : next;
}

export function mapPointerTime(clientX: number, clientY: number, rect: RectLike | DOMRect): number {
  const pose = pointerToPose(clientX, clientY, rect);
  return Math.max(0, Math.min(EYE_DURATION, pose.time));
}

export function mapSceneTime(input: {
  progress: number;
  pointerTime: number;
  duration: number;
}): number {
  if (input.progress < EYE_END_PROGRESS) {
    return Math.max(0, Math.min(EYE_DURATION, input.pointerTime));
  }
  const scrollProgress = (input.progress - EYE_END_PROGRESS) / (1 - EYE_END_PROGRESS);
  return mapScrollTime(scrollProgress, input.duration);
}

export { frameTime };
