import { pointerToPose, frameTime, type RectLike } from './gaze-math.ts';

export const EYE_END_PROGRESS = 0.14;
export const EYE_DURATION = 10;
export const INTERACTION_FPS = 60;
export const SCROLL_SEEK_EPSILON = 0.012;

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

/* ============ 帧阻尼：输入目标 → 平滑追赶 + 限速 ============ */

const dampClamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * 临界阻尼平滑 + 单帧最大追赶量限制。
 * 算法移植自 oil-motion（MIT，github.com/oil-oil/oil-motion
 * assets/interactive-motion.ts 的 smoothDamp），改为 tick 驱动：
 * 不自带 raf，由调用方每帧 update(dt)。
 * 限速语义：单帧最多追赶 maxSpeed * smoothTime，target 越远被裁得越近。
 */
const smoothDamp = (
  current: number,
  target: number,
  velocity: number,
  smoothTime: number,
  maxSpeed: number,
  deltaTime: number,
): [number, number] => {
  const safeTime = Math.max(0.0001, smoothTime);
  const omega = 2 / safeTime;
  const x = omega * deltaTime;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const originalTarget = target;
  const maxChange = maxSpeed * safeTime;
  const change = dampClamp(current - target, -maxChange, maxChange);
  const limitedTarget = current - change;
  const temp = (velocity + omega * change) * deltaTime;
  let nextVelocity = (velocity - omega * temp) * decay;
  let nextPosition = limitedTarget + (change + temp) * decay;

  if ((originalTarget - current > 0) === (nextPosition > originalTarget)) {
    nextPosition = originalTarget;
    nextVelocity = 0;
  }
  return [nextPosition, nextVelocity];
};

/** 收敛死区：小于该距离且速度趋零视为到位，避免无限微追 */
export const DAMPER_SETTLE_EPSILON = 0.002;

export type FrameDamperOptions = {
  /** 平滑时间（秒）：越小越跟手。默认 0.16 */
  smoothTime?: number;
  /** 每秒最大追赶量（单位与 target 相同）。默认 Infinity（不限速） */
  maxSpeed?: number;
  /** 减少动态效果时每帧直通 target */
  reducedMotion?: boolean;
};

export type FrameDamper = {
  /** 当前值（每帧 update 后读取） */
  readonly value: number;
  /** 是否已收敛到 target */
  readonly settled: boolean;
  setTarget(target: number): void;
  /** 无动画立即到位（模态开关、段切换等场景） */
  snapTo(target: number): void;
  /** 推进一帧，返回当前值。dt 单位秒，超过 1/30 按 1/30 计（防跳帧后炸步长） */
  update(dt: number): number;
};

export function createFrameDamper(options: FrameDamperOptions = {}): FrameDamper {
  const smoothTime = Math.max(0.0001, options.smoothTime ?? 0.16);
  const maxSpeed = Number.isFinite(options.maxSpeed ?? Infinity)
    ? (options.maxSpeed as number)
    : Infinity;
  let position = 0;
  let target = 0;
  let velocity = 0;

  return {
    get value() {
      return position;
    },
    get settled() {
      return Math.abs(target - position) < DAMPER_SETTLE_EPSILON && Math.abs(velocity) < DAMPER_SETTLE_EPSILON;
    },
    setTarget(next: number) {
      target = next;
    },
    snapTo(next: number) {
      target = next;
      position = next;
      velocity = 0;
    },
    update(dt: number) {
      if (options.reducedMotion) {
        position = target;
        velocity = 0;
        return position;
      }
      const step = dampClamp(dt, 0, 1 / 30);
      if (step <= 0) return position;
      [position, velocity] = smoothDamp(position, target, velocity, smoothTime, maxSpeed, step);
      return position;
    },
  };
}
