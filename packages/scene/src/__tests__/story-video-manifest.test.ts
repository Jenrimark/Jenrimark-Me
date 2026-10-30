import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { StoryVideoManifest } from '../story-video-transition.ts';
import { sceneConfigFromRegistry } from '../story-video-transition.ts';

test('story-video manifest matches the approved timeline and assets', async () => {
  const raw = await readFile(
    new URL('../../../../apps/web/public/scenes/story-v6/story-video.json', import.meta.url),
    'utf8',
  );
  const manifest = JSON.parse(raw) as StoryVideoManifest;
  assert.equal(manifest.schema, 'story-video/v1');
  assert.match(manifest.gazeFramesDir, /^\/scenes\/story-v6\/gaze-hd-[a-f0-9]{12}\/$/);
  assert.equal(manifest.gazeTotalFrames, 241);
  assert.deepEqual(manifest.stableFrames, [null, 312, 432, 624, 696]);
  assert.deepEqual(manifest.stableImages, [
    '/media/scene-stills/00-about.png',
    '/media/scene-stills/01-experience.png',
    '/media/scene-stills/02-projects.png',
    '/media/scene-stills/03-work.png',
    '/media/scene-stills/04-contact.png',
  ]);
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

test('scene registry points story mode at the video manifest', async () => {
  const raw = await readFile(
    new URL('../../../../apps/web/public/scenes/manifest.json', import.meta.url),
    'utf8',
  );
  const registry = JSON.parse(raw) as {
    scenes: Array<{ id: string; mode: string; spec: string }>;
  };
  const story = registry.scenes.find((item) => item.id === 'story-v6');
  assert.equal(story?.mode, 'story');
  assert.equal(story?.spec, 'story-video.json');
});

test('registry resolves story config without a network lookup', async () => {
  const raw = await readFile(
    new URL('../../../../apps/web/public/scenes/manifest.json', import.meta.url),
    'utf8',
  );
  const registry = JSON.parse(raw) as {
    scenes: Array<{ id: string; mode: string; framesDir: string; spec: string }>;
  };
  assert.deepEqual(sceneConfigFromRegistry(registry), {
    mode: 'story',
    framesDir: `/scenes/story-v6/${registry.scenes[0].framesDir}`,
    specUrl: '/scenes/story-v6/story-video.json',
  });
});

test('immutable gaze directory fingerprint matches every image byte', async () => {
  const publicRoot = new URL('../../../../apps/web/public/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('scenes/story-v6/story-video.json', publicRoot), 'utf8')) as StoryVideoManifest;
  const directory = new URL(manifest.gazeFramesDir.slice(1), publicRoot);
  const files = (await readdir(directory)).filter((name) => name.endsWith('.webp')).sort();
  assert.equal(files.length, manifest.gazeTotalFrames);
  const digest = createHash('sha256');
  for (const filename of files) {
    digest.update(`${filename}\0`);
    digest.update(await readFile(new URL(filename, directory)));
  }
  assert.equal(manifest.gazeFramesDir, `/scenes/story-v6/gaze-hd-${digest.digest('hex').slice(0, 12)}/`);
});

test('an external scene asset origin changes image URLs while keeping the manifest local', () => {
  const registry = { scenes: [{ id: 'story-v6', mode: 'story', framesDir: 'gaze-hd-fingerprint/', spec: 'story-video.json' }] };
  assert.deepEqual(sceneConfigFromRegistry(registry, 'https://assets.example.com/'), {
    mode: 'story',
    framesDir: 'https://assets.example.com/scenes/story-v6/gaze-hd-fingerprint/',
    specUrl: '/scenes/story-v6/story-video.json',
  });
});
