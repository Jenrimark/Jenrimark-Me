const TAU = Math.PI * 2;
const QUARTER = Math.PI / 2;
const SEAM = Math.PI * 1.75;
const DIRECTION_TIMES = [2.5, 5, 7.25, 9];

export interface Pose {
  angle: number | null;
  time: number;
  strength: number;
  seamStrength?: number;
}

export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const smoothstep = (value: number) => value * value * (3 - 2 * value);
const frontPose = (): Pose => ({ angle: null, time: 0, strength: 0 });

export function normalizeAngle(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  const wrapped = angle % TAU;
  return wrapped < 0 ? wrapped + TAU : wrapped;
}

export function shortestAngleDelta(from: number, to: number): number {
  return normalizeAngle(to - from + Math.PI) - Math.PI;
}

export function angleToPose(angle: number): { time: number; seamStrength: number } {
  const normalized = normalizeAngle(angle);
  if (normalized >= QUARTER * 3) {
    // Approved clip returns to front after down; hide the narrow seam with the front poster.
    const seamStrength = smoothstep(clamp(Math.abs(normalized - SEAM) / 0.14, 0, 1));
    return { time: normalized < SEAM ? DIRECTION_TIMES[3] : 0, seamStrength };
  }
  const segment = Math.floor(normalized / QUARTER);
  const progress = (normalized - segment * QUARTER) / QUARTER;
  const time =
    DIRECTION_TIMES[segment] +
    (DIRECTION_TIMES[segment + 1] - DIRECTION_TIMES[segment]) * progress;
  return { time, seamStrength: 1 };
}

export function pointerToPose(
  clientX: number,
  clientY: number,
  rect: RectLike | DOMRect | undefined | null,
): Pose {
  const values = [clientX, clientY, rect?.left, rect?.top, rect?.width, rect?.height];
  if (!values.every((v) => Number.isFinite(v as number)) || !rect || rect.width <= 0 || rect.height <= 0) {
    return frontPose();
  }
  const x = (clientX - rect.left - rect.width * 0.49) / (rect.width * 0.5);
  const y = (clientY - rect.top - rect.height * 0.45) / (rect.height * 0.5);
  const radius = Math.hypot(x, y);
  const deadZone = 0.12;
  if (radius <= deadZone) return frontPose();
  // Screen Y grows downward; approved sequence runs right, up, left, down.
  const angle = normalizeAngle(Math.atan2(-y, x));
  const pose = angleToPose(angle);
  const strength = smoothstep(clamp((radius - deadZone) / (0.7 - deadZone), 0, 1));
  return { angle, time: pose.time, strength: strength * pose.seamStrength };
}

export function needsPoseReset(from: number, to: number): boolean {
  const start = normalizeAngle(from);
  const delta = shortestAngleDelta(start, to);
  if (Math.abs(delta) > (Math.PI * 2) / 3) return true;
  const end = start + delta;
  for (const offset of [-TAU, 0, TAU]) {
    const seam = SEAM + offset;
    if (Math.abs(delta) > 1e-6 && seam >= Math.min(start, end) && seam <= Math.max(start, end)) return true;
  }
  return false;
}

export function frameTime(time: number, duration: number, fps = 24): number {
  if (!Number.isFinite(time) || !Number.isFinite(duration) || duration <= 0 || fps <= 0) return 0;
  const lastFrame = Math.max(0, Math.floor(duration * fps - 1 + 1e-4));
  return clamp(Math.round(time * fps), 0, lastFrame) / fps;
}

export function smoothToward(current: number, target: number, elapsedMs: number, timeConstant = 110): number {
  const step = 1 - Math.exp(-clamp(elapsedMs, 0, 50) / timeConstant);
  const next = current + (target - current) * step;
  return Math.abs(target - next) < 0.001 ? target : next;
}

export function stepAngle(current: number, target: number, elapsedMs: number): number {
  const delta = shortestAngleDelta(current, target);
  return normalizeAngle(current + smoothToward(0, delta, elapsedMs, 95));
}
