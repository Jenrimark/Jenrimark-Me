import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { StoryVideoManifest } from '../story-video-transition.ts';

test('story-video manifest matches the approved timeline and assets', async () => {
  const raw = await readFile(
    new URL('../../../../apps/web/public/scenes/story-v6/story-video.json', import.meta.url),
    'utf8',
  );
  const manifest = JSON.parse(raw) as StoryVideoManifest;
  assert.equal(manifest.schema, 'story-video/v1');
  assert.deepEqual(manifest.stableFrames, [null, 312, 432, 624, 696]);
  assert.deepEqual(
    manifest.transitions.map((item) => item.playbackDurationMs),
    [3000, 3000, 4000, 3000],
  );
  assert.deepEqual(
    manifest.transitions.map((item) => item.sourceRange),
    [[10, 12], [14.5, 18], [21.07, 26], [26, 29]],
  );
  assert.deepEqual(
    manifest.transitions.map((item) => item.playbackRate),
    [0.666667, 1.166667, 1.239583, 1],
  );
  manifest.transitions.forEach((item) => {
    assert.ok(item.forwardSrc.startsWith('/media/transitions/'));
    assert.ok(item.reverseSrc.startsWith('/media/transitions/'));
  });
});
