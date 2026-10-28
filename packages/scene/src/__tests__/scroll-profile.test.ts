import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyWheel,
  createWheelProfiler,
  detectPlatform,
  readScrollOverrides,
  scrollConfigFor,
  type WheelSample,
} from '../scroll-profile.ts';

/** 构造一串 wheel 样本：step=间隔 ms，delta=每事件像素增量 */
function series(count: number, step: number, delta: number, extra: Partial<WheelSample> = {}): WheelSample[] {
  return Array.from({ length: count }, (_, i) => ({
    deltaMode: 0,
    deltaY: delta,
    deltaX: 0,
    time: i * step,
    ...extra,
  }));
}

/* ---------- detectPlatform ---------- */

test('detectPlatform reads UA', () => {
  assert.equal(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'), 'mac');
  assert.equal(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'windows');
  assert.equal(detectPlatform('Mozilla/5.0 (X11; Linux x86_64)'), 'linux');
  assert.equal(detectPlatform('something-else'), 'other');
});

/* ---------- classifyWheel ---------- */

test('Windows 鼠标（Chrome/Edge 像素档位）判 mouse', () => {
  // 一档 100px，约 5 档/秒（间隔 200ms）
  assert.equal(classifyWheel(series(5, 200, 100)), 'mouse');
});

test('Windows 鼠标低频小幅档位（33px/档）仍判 mouse', () => {
  assert.equal(classifyWheel(series(4, 250, 33)), 'mouse');
});

test('Firefox 行模式（deltaMode=1）判 mouse', () => {
  assert.equal(classifyWheel(series(4, 200, 3, { deltaMode: 1 })), 'mouse');
});

test('macOS 触控板（像素小增量 + 高频）判 trackpad', () => {
  // 3px/事件、8ms 间隔 ≈ 125 事件/秒
  assert.equal(classifyWheel(series(12, 8, 3)), 'trackpad');
});

test('慢速触控板微拖（低频但增量小）判 trackpad', () => {
  // 4px/事件、100ms 间隔：频率 10/s 不够，但中位增量 4 < 24
  assert.equal(classifyWheel(series(6, 100, 4)), 'trackpad');
});

test('小数增量（高分辨率/系统加速度）判 trackpad', () => {
  assert.equal(classifyWheel(series(3, 300, 40.5)), 'trackpad');
});

test('斜向增量（双指）判 trackpad', () => {
  assert.equal(classifyWheel(series(3, 300, 100, { deltaX: 12 })), 'trackpad');
});

test('MX Master 自由滚动（小而快的连续增量）判 trackpad', () => {
  // 6px/事件、12ms 间隔：连续高分辨率滚轮，与触控板同构
  assert.equal(classifyWheel(series(12, 12, 6)), 'trackpad');
});

test('纯横向事件（倾斜滚轮干扰）不误判为触控板', () => {
  // 只有 deltaX：垂直证据为空 → 保守判 mouse
  assert.equal(
    classifyWheel(series(3, 200, 0, { deltaX: 100 })),
    'mouse',
  );
});

/* ---------- scrollConfigFor ---------- */

test('配置矩阵：mac 一律原生；Win/Linux 鼠标补 lerp、触控板原生', () => {
  assert.deepEqual(scrollConfigFor('mac', 'mouse'), { smoothWheel: false, lerp: 1 });
  assert.deepEqual(scrollConfigFor('mac', 'trackpad'), { smoothWheel: false, lerp: 1 });
  assert.deepEqual(scrollConfigFor('windows', 'mouse'), { smoothWheel: true, lerp: 0.1 });
  assert.deepEqual(scrollConfigFor('windows', 'trackpad'), { smoothWheel: false, lerp: 1 });
  assert.deepEqual(scrollConfigFor('linux', 'mouse'), { smoothWheel: true, lerp: 0.1 });
});

/* ---------- readScrollOverrides ---------- */

test('URL 覆盖参数解析与钳制', () => {
  assert.deepEqual(readScrollOverrides(''), null);
  assert.deepEqual(readScrollOverrides('?scrollLerp=0.4'), { smoothWheel: true, lerp: 0.4 });
  assert.deepEqual(readScrollOverrides('?scrollSmooth=0'), { smoothWheel: false, lerp: 0.1 });
  assert.deepEqual(readScrollOverrides('?scrollLerp=2'), { smoothWheel: true, lerp: 1 });
  assert.deepEqual(readScrollOverrides('?scrollLerp=-1'), { smoothWheel: true, lerp: 0 });
  assert.deepEqual(readScrollOverrides('?scrollLerp=abc'), { smoothWheel: true, lerp: 0.1 });
});

/* ---------- createWheelProfiler ---------- */

test('采样器：攒够 12 个样本即判定，且只判定一次', () => {
  let calls = 0;
  const profiler = createWheelProfiler({ onDecision: () => calls++ });
  let result: string | null = null;
  for (const s of series(12, 8, 3)) result = profiler.add(s);
  assert.equal(result, 'trackpad');
  assert.equal(calls, 1);
  // 判定后继续喂样本：不再重复回调
  profiler.add({ deltaMode: 0, deltaY: 200, deltaX: 0, time: 1000 });
  assert.equal(calls, 1);
});

test('采样器：鼠标稀疏档位在窗口用尽时判定', () => {
  let result: string | null = null;
  const profiler = createWheelProfiler({
    onDecision: (input) => {
      result = input;
    },
    windowMs: 700,
  });
  // 3 档、每档 250ms：第 3 个样本时跨度 500ms 未满窗，第 4 个（750ms）触发
  for (const s of series(4, 250, 100)) profiler.add(s);
  assert.equal(result, 'mouse');
});

test('采样器：鼠标判定后遇到小数增量升级为触控板（外设切换）', () => {
  let result: string | null = null;
  const profiler = createWheelProfiler({
    onDecision: (input) => {
      result = input;
    },
  });
  // 真实鼠标节奏：5 档 × 100px，250ms 间隔（窗口 700ms 内判定）
  for (const s of series(5, 250, 100)) profiler.add(s);
  assert.equal(result, 'mouse');
  profiler.add({ deltaMode: 0, deltaY: 3.5, deltaX: 0, time: 5000 }); // 小数 → 升级
  assert.equal(result, 'trackpad');
});
