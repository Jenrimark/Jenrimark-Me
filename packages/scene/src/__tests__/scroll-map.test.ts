import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, frameAtProgress, type SceneBudget } from '../scroll-map.ts';

// 3 段预算：快段 4 帧 / 静止去重 1 帧 / 慢段 2 帧（共 7 帧）
const budget: SceneBudget = {
  segments: [
    { start: 0, end: 1, ratio: 4, src_frames: 10, out_frames: 4, out_fps: 120 },
    { start: 1, end: 2, ratio: 1, dedup: true, src_frames: 10, out_frames: 1, out_fps: 1 },
    { start: 2, end: 3, ratio: 2, src_frames: 10, out_frames: 2, out_fps: 60 },
  ],
  total_out_frames: 7,
  map: [],
};

test('buildIndex covers all frames with continuous progress', () => {
  const map = buildIndex(budget.segments);
  assert.equal(map.length, 7);
  assert.equal(map[0].frame, 0);
  assert.equal(map[6].frame, 6);
  assert.equal(map[0].pFrom, 0);
  assert.equal(map[6].pTo, 1);
  // 段归属正确
  assert.equal(map[4].seg, 1); // 第 5 帧 = 静止去重段
  assert.equal(map[4].time, 1);
});

test('frameAtProgress maps frame-linearly (fast segment rolls slow)', () => {
  // 快段占 4/7 进度：p=0.1 仍在该段内
  const e1 = frameAtProgress({ ...budget, map: buildIndex(budget.segments) }, 0.1);
  assert.equal(e1.seg, 0);
  // 静止段只有 1 帧：p=0.6~0.7 内都命中它
  const e2 = frameAtProgress({ ...budget, map: buildIndex(budget.segments) }, 0.65);
  assert.equal(e2.seg, 1);
  assert.equal(e2.frame, 4);
  // 末段尾部
  const e3 = frameAtProgress({ ...budget, map: buildIndex(budget.segments) }, 0.99);
  assert.equal(e3.frame, 6);
  // 越界收敛
  assert.equal(frameAtProgress({ ...budget, map: buildIndex(budget.segments) }, -1).frame, 0);
  assert.equal(frameAtProgress({ ...budget, map: buildIndex(budget.segments) }, 2).frame, 6);
});
