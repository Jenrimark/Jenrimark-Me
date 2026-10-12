import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EYE_END_PROGRESS,
  mapScrollTime,
  mapSceneTime,
  needsScrollSeek,
  smoothProgress,
} from '../scroll-video.ts';

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

test('smoothProgress snaps near target', () => {
  assert.equal(smoothProgress(0.5, 0.5), 0.5);
  const next = smoothProgress(0, 1, 0.22);
  assert.ok(next > 0 && next < 1);
});
