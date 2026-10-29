import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialStoryVideoState,
  reduceStoryVideoState,
  resolveStoryVideoTransition,
  storyVideoCanPlayMotion,
  storyVideoDirectionFromDelta,
  storyVideoDirectionFromKey,
  storyVideoPosterForDirection,
  storyVideoPlaybackRate,
  storyVideoReverseBridge,
  type StoryVideoManifest,
} from '../story-video-transition.ts';

const manifest: StoryVideoManifest = {
  schema: 'story-video/v1',
  fps: 24,
  duration: 30.048,
  totalFrames: 721,
  framesDir: '/scenes/story-v6/frames/',
  gazeFramesDir: '/scenes/story-v6/gaze-hd/',
  gazeTotalFrames: 241,
  extension: '.webp',
  gaze: {
    sourceRange: [0, 10],
    directTime: 0,
    rightTime: 2.5,
    upTime: 5,
    leftTime: 7.25,
    returnTime: 9,
    deadZone: 0.08,
  },
  pages: ['about', 'experience', 'projects', 'work', 'contact'],
  stableFrames: [null, 312, 432, 624, 696],
  stableImages: [
    '/media/scene-stills/00-about.png',
    '/media/scene-stills/01-experience.png',
    '/media/scene-stills/02-projects.png',
    '/media/scene-stills/03-work.png',
    '/media/scene-stills/04-contact.png',
  ],
  transitions: [
    {
      id: 'experience',
      sourceRange: [10, 12],
      forwardSrc: '/media/transitions/action-01-forward.mp4',
      reverseSrc: '/media/transitions/action-01-reverse.mp4',
      forwardPoster: '/media/transitions/action-01-forward.jpg',
      reversePoster: '/media/transitions/action-01-reverse.jpg',
      playbackDurationMs: 3000,
      playbackRate: 0.666667,
      startBlendMs: 200,
      startBridge: 'fade',
      endBridge: 'jump',
      endHoldFrame: 312,
    },
    {
      id: 'projects',
      sourceRange: [14.5, 18],
      forwardSrc: '/media/transitions/action-02-forward.mp4',
      reverseSrc: '/media/transitions/action-02-reverse.mp4',
      forwardPoster: '/media/transitions/action-02-forward.jpg',
      reversePoster: '/media/transitions/action-02-reverse.jpg',
      playbackDurationMs: 3000,
      playbackRate: 1.166667,
      startBlendMs: 200,
      startBridge: 'fade',
      endBridge: 'continuous',
      endHoldFrame: 432,
    },
    {
      id: 'work',
      sourceRange: [21.07, 26],
      forwardSrc: '/media/transitions/action-03-forward.mp4',
      reverseSrc: '/media/transitions/action-03-reverse.mp4',
      forwardPoster: '/media/transitions/action-03-forward.jpg',
      reversePoster: '/media/transitions/action-03-reverse.jpg',
      playbackDurationMs: 4000,
      playbackRate: 1.239583,
      startBlendMs: 200,
      startBridge: 'fade',
      endBridge: 'continuous',
      endHoldFrame: 624,
    },
    {
      id: 'contact',
      sourceRange: [26, 29],
      forwardSrc: '/media/transitions/action-04-forward.mp4',
      reverseSrc: '/media/transitions/action-04-reverse.mp4',
      forwardPoster: '/media/transitions/action-04-forward.jpg',
      reversePoster: '/media/transitions/action-04-reverse.jpg',
      playbackDurationMs: 3000,
      playbackRate: 1,
      startBlendMs: 200,
      startBridge: 'continuous',
      endBridge: 'continuous',
      endHoldFrame: 696,
    },
  ],
};

test('resolves only adjacent forward and reverse transitions', () => {
  assert.equal(resolveStoryVideoTransition(0, 1, manifest)?.id, 'experience');
  assert.equal(resolveStoryVideoTransition(4, -1, manifest)?.id, 'contact');
  assert.equal(resolveStoryVideoTransition(0, -1, manifest), null);
  assert.equal(resolveStoryVideoTransition(4, 1, manifest), null);
});

test('a new request is ignored until the current transition settles', () => {
  let state = initialStoryVideoState();
  state = reduceStoryVideoState(state, { type: 'request', direction: 1 }, manifest);
  assert.equal(state.phase, 'preparing');
  assert.equal(state.targetPage, 1);

  const locked = reduceStoryVideoState(state, { type: 'request', direction: 1 }, manifest);
  assert.equal(locked, state);
});

test('one request walks through preparation, playback, settling, and unlock', () => {
  let state = initialStoryVideoState();
  state = reduceStoryVideoState(state, { type: 'request', direction: 1 }, manifest);
  state = reduceStoryVideoState(state, { type: 'prepared' }, manifest);
  assert.equal(state.phase, 'blending');
  state = reduceStoryVideoState(state, { type: 'blend-complete' }, manifest);
  assert.equal(state.phase, 'playing');
  state = reduceStoryVideoState(state, { type: 'ended' }, manifest);
  assert.equal(state.phase, 'settling');
  state = reduceStoryVideoState(state, { type: 'settled' }, manifest);
  assert.equal(state.phase, 'idle');
  assert.equal(state.page, 1);
});

test('error recovery locks the page and discards pending requests', () => {
  let state = initialStoryVideoState();
  state = reduceStoryVideoState(state, { type: 'request', direction: 1 }, manifest);
  state = reduceStoryVideoState(state, { type: 'error' }, manifest);
  assert.equal(state.phase, 'error');
  assert.equal(
    reduceStoryVideoState(state, { type: 'request', direction: 1 }, manifest),
    state,
  );
  state = reduceStoryVideoState(state, { type: 'recover' }, manifest);
  assert.equal(state.phase, 'idle');
  assert.equal(state.page, 1);
});

test('playback rates map source duration to page duration', () => {
  assert.equal(storyVideoPlaybackRate(2, 3000), 0.666667);
  assert.equal(storyVideoPlaybackRate(3.5, 3000), 1.166667);
  assert.equal(storyVideoPlaybackRate(4.958333, 4000), 1.239583);
  assert.equal(storyVideoPlaybackRate(3, 3000), 1);
});

test('reverse bridges mirror forward bridges', () => {
  assert.equal(storyVideoReverseBridge(manifest.transitions[0], 'end'), 'fade');
  assert.equal(storyVideoReverseBridge(manifest.transitions[0], 'start'), 'fade');
  assert.equal(storyVideoReverseBridge(manifest.transitions[2], 'start'), 'continuous');
  assert.equal(storyVideoReverseBridge(manifest.transitions[2], 'end'), 'fade');
});

test('direction chooses the matching decoded first-frame poster', () => {
  assert.equal(
    storyVideoPosterForDirection(manifest.transitions[0], 1),
    '/media/transitions/action-01-forward.jpg',
  );
  assert.equal(
    storyVideoPosterForDirection(manifest.transitions[0], -1),
    '/media/transitions/action-01-reverse.jpg',
  );
});

test('vertical deltas below threshold do not trigger a transition', () => {
  assert.equal(storyVideoDirectionFromDelta(17, 18), null);
  assert.equal(storyVideoDirectionFromDelta(-17, 18), null);
  assert.equal(storyVideoDirectionFromDelta(18, 18), 1);
  assert.equal(storyVideoDirectionFromDelta(-18, 18), -1);
});

test('keyboard navigation maps only approved vertical keys', () => {
  assert.equal(storyVideoDirectionFromKey('ArrowDown'), 1);
  assert.equal(storyVideoDirectionFromKey('PageDown'), 1);
  assert.equal(storyVideoDirectionFromKey('Space'), 1);
  assert.equal(storyVideoDirectionFromKey('Numpad2'), 1);
  assert.equal(storyVideoDirectionFromKey('ArrowUp'), -1);
  assert.equal(storyVideoDirectionFromKey('PageUp'), -1);
  assert.equal(storyVideoDirectionFromKey('Numpad8'), -1);
  assert.equal(storyVideoDirectionFromKey('ArrowLeft'), null);
});

test('reduced motion disables transition video playback', () => {
  assert.equal(storyVideoCanPlayMotion(false), true);
  assert.equal(storyVideoCanPlayMotion(true), false);
});
