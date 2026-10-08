import test from 'node:test';
import assert from 'node:assert/strict';
import { mapSceneTime, mapPointerTime, mapScrollTime, INTERACTION_FPS, needsScrollSeek } from '../v3-scene.mjs';

test('eye interaction uses a 60Hz control grid', () => {
  assert.equal(INTERACTION_FPS, 60);
});

test('mouse direction is reversed to match the V4 eye-motion recording', () => {
  const rect = { left: 100, top: 50, width: 1000, height: 600 };
  assert.equal(mapPointerTime(990, 320, rect), 2.5);
  assert.equal(mapPointerTime(590, 20, rect), 5);
  assert.equal(mapPointerTime(90, 320, rect), 7.25);
  assert.equal(mapPointerTime(590, 620, rect), 9);
});

test('mouse mode is limited to the first ten seconds', () => {
  assert.equal(mapSceneTime({ progress: 0, pointerTime: 0, duration: 30 }), 0);
  assert.equal(mapSceneTime({ progress: 0.1, pointerTime: 10, duration: 30 }), 10);
});

test('scroll mode maps the remaining page to the final twenty seconds', () => {
  assert.equal(mapSceneTime({ progress: 0.14, pointerTime: 4, duration: 30 }), 10);
  assert.equal(mapSceneTime({ progress: 1, pointerTime: 4, duration: 30 }), 30);
});

test('scroll timeline gives transitions more distance than stable holds', () => {
  assert.equal(mapScrollTime(0, 30.048), 10);
  assert.equal(mapScrollTime(0.1, 30.048), 14.5);
  assert.ok(Math.abs(mapScrollTime(0.32, 30.048) - 18.571428) < 0.001);
  assert.ok(Math.abs(mapScrollTime(0.74, 30.048) - 25.666666) < 0.001);
  assert.equal(mapScrollTime(1, 30.048), 30.048);
});

test('segmented scroll mapping stays continuous and reversible', () => {
  let previous = mapScrollTime(0, 30.048);
  for (let step = 1; step <= 1000; step += 1) {
    const progress = step / 1000;
    const next = mapScrollTime(progress, 30.048);
    assert.ok(next >= previous, `timeline reversed at ${progress}`);
    previous = next;
  }
});

test('scrolling back before the handoff restores mouse mode', () => {
  assert.equal(mapSceneTime({ progress: 0.13, pointerTime: 7, duration: 30 }), 7);
});

test('scroll seeks coalesce while decoding and resume for the latest target', () => {
  assert.equal(needsScrollSeek({ currentTime: 18, targetTime: 22, seeking: true }), false);
  assert.equal(needsScrollSeek({ currentTime: 18, targetTime: 22, seeking: false }), true);
  assert.equal(needsScrollSeek({ currentTime: 21.995, targetTime: 22, seeking: false }), false);
});
