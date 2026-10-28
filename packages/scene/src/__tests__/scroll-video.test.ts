import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAMPER_SETTLE_EPSILON,
  EYE_END_PROGRESS,
  createFrameDamper,
  mapScrollTime,
  mapSceneTime,
  needsScrollSeek,
} from '../scroll-video.ts';

const FRAME = 1 / 60;

/** 以 60fps 推进 damper 直至收敛，返回帧数与轨迹 */
const runUntilSettled = (damper: ReturnType<typeof createFrameDamper>, maxFrames = 600) => {
  const trail: number[] = [];
  for (let i = 0; i < maxFrames && !damper.settled; i += 1) {
    trail.push(damper.update(FRAME));
  }
  return trail;
};

test('mapScrollTime anchors match timeline endpoints', () => {
  assert.equal(mapScrollTime(0), 10);
  assert.equal(mapScrollTime(1), 30.048);
});

test('mapSceneTime uses pointer before eye end and scroll after', () => {
  assert.equal(mapSceneTime({ progress: 0, pointerTime: 5, duration: 30 }), 5);
  assert.ok(mapSceneTime({ progress: EYE_END_PROGRESS + 0.01, pointerTime: 5, duration: 30.048 }) > 10);
});

test('needsScrollSeek respects seeking flag and epsilon', () => {
  assert.equal(needsScrollSeek({ currentTime: 10, targetTime: 10.001, seeking: false }), false);
  assert.equal(needsScrollSeek({ currentTime: 10, targetTime: 10.2, seeking: true }), false);
  assert.equal(needsScrollSeek({ currentTime: 10, targetTime: 10.2, seeking: false }), true);
});

/* ============ createFrameDamper ============ */

test('damper：默认参数平滑逼近目标且无过冲', () => {
  const damper = createFrameDamper();
  damper.setTarget(10);
  const trail = runUntilSettled(damper);
  assert.ok(trail.length > 1, '应分多帧追赶而非一步到位');
  assert.ok(trail.every((v) => v <= 10), '不得越过目标（临界阻尼无过冲）');
  assert.ok(Math.abs(damper.value - 10) < DAMPER_SETTLE_EPSILON);
});

test('damper：maxSpeed 限制单帧最大追赶量', () => {
  // smoothTime 0.16 + maxSpeed 3 → 单帧最多追 0.08
  const damper = createFrameDamper({ smoothTime: 0.16, maxSpeed: 3 });
  damper.setTarget(10);
  const first = damper.update(FRAME);
  assert.ok(first <= 3 * 0.16 + 1e-9, `首帧追赶量应被限速，实际 ${first}`);
  // 全程任何相邻两帧的推进量都不超限
  let prev = 0;
  for (let i = 0; i < 200; i += 1) {
    const next = damper.update(FRAME);
    assert.ok(next - prev <= 3 * 0.16 + 1e-9, `第 ${i} 帧超速：${next - prev}`);
    prev = next;
  }
});

test('damper：无限速时小目标仍按平滑时间收敛', () => {
  const damper = createFrameDamper({ smoothTime: 0.16 });
  damper.setTarget(1);
  const trail = runUntilSettled(damper);
  assert.ok(trail.length > 5);
  assert.ok(trail.every((v) => v <= 1));
});

test('damper：reducedMotion 每帧直通目标', () => {
  const damper = createFrameDamper({ reducedMotion: true });
  damper.setTarget(7);
  assert.equal(damper.update(FRAME), 7);
  assert.ok(damper.settled);
});

test('damper：snapTo 无动画立即到位', () => {
  const damper = createFrameDamper();
  damper.setTarget(5);
  damper.update(FRAME);
  damper.snapTo(0);
  assert.equal(damper.value, 0);
  assert.ok(damper.settled);
});

test('damper：超大 dt 按 1/30 封顶，不炸步长', () => {
  const damper = createFrameDamper({ smoothTime: 0.16, maxSpeed: 3 });
  damper.setTarget(10);
  const afterBigStep = damper.update(1); // 模拟切后台 1 秒
  const oneFrameCap = 3 * 0.16 + 1e-9;
  assert.ok(afterBigStep <= oneFrameCap, `1s dt 应被截断，实际推进 ${afterBigStep}`);
});

test('damper：反向输入时从当前速度继续追，不跳回起点', () => {
  const damper = createFrameDamper({ smoothTime: 0.16 });
  damper.setTarget(10);
  runUntilSettled(damper);
  const mid = damper.value;
  damper.setTarget(0); // 快速反向
  const afterReverse = damper.update(FRAME);
  assert.ok(afterReverse < mid, '反向应立即开始往回走');
  assert.ok(afterReverse >= 0, '反向不得越过新目标');
  runUntilSettled(damper);
  assert.ok(Math.abs(damper.value) < DAMPER_SETTLE_EPSILON);
});
