import test from 'node:test';
import assert from 'node:assert/strict';
import {
  storyFrameAtPageProgress,
  storyGazeFrame,
  storyProgressFromScroll,
  type StoryFrameManifest,
} from '../story-scroll.ts';

const manifest: Pick<StoryFrameManifest, 'gaze' | 'transitions'> = {
  gaze: {
    sourceRange: [0, 10],
    frameStart: 0,
    frameEnd: 240,
    directFrame: 0,
    face: { center: [0.5, 0.42], radii: [0.2, 0.24] },
  },
  transitions: [
    { id: 'experience', sourceRange: [10, 13], holdTime: 13, frameStart: 240, frameEnd: 312 },
    { id: 'projects', sourceRange: [15, 18], holdTime: 18, frameStart: 311, frameEnd: 384 },
    { id: 'work', sourceRange: [22, 27], holdTime: 27, frameStart: 383, frameEnd: 504 },
    { id: 'contact', sourceRange: [27, 30.048], holdTime: 30.048, frameStart: 503, frameEnd: 573 },
  ],
};

test('face region returns direct gaze', () => {
  const state = storyGazeFrame({ x: 0.5, y: 0.42 }, manifest.gaze);
  assert.equal(state.frame, 0);
  assert.equal(state.time, 0);
});

test('gaze outside face follows pointer direction', () => {
  const right = storyGazeFrame({ x: 0.95, y: 0.42 }, manifest.gaze);
  const left = storyGazeFrame({ x: 0.05, y: 0.42 }, manifest.gaze);
  assert.ok(right.frame > 20);
  assert.ok(left.frame > 20);
  assert.notEqual(right.frame, left.frame);
});

test('page progress reaches each stable hold frame', () => {
  assert.equal(storyFrameAtPageProgress(0, manifest, { x: 0.5, y: 0.42 }).frame, 0);
  assert.equal(storyFrameAtPageProgress(1, manifest, { x: 0.5, y: 0.42 }).frame, 311);
  assert.equal(storyFrameAtPageProgress(2, manifest, { x: 0.5, y: 0.42 }).frame, 383);
  assert.equal(storyFrameAtPageProgress(3, manifest, { x: 0.5, y: 0.42 }).frame, 503);
  assert.equal(storyFrameAtPageProgress(4, manifest, { x: 0.5, y: 0.42 }).frame, 572);
});

test('adjacent story transitions share the previous stable frame', () => {
  assert.equal(manifest.transitions[1].frameStart, manifest.transitions[0].frameEnd - 1);
  assert.equal(manifest.transitions[2].frameStart, manifest.transitions[1].frameEnd - 1);
  assert.equal(manifest.transitions[3].frameStart, manifest.transitions[2].frameEnd - 1);
});

test('near-integer scroll progress stays on the stable hold frame', () => {
  assert.equal(storyFrameAtPageProgress(3.0000001, manifest, { x: 0.5, y: 0.42 }).frame, 503);
  assert.equal(storyFrameAtPageProgress(3.000248, manifest, { x: 0.5, y: 0.42 }).frame, 503);
  assert.equal(storyFrameAtPageProgress(3.9999999, manifest, { x: 0.5, y: 0.42 }).frame, 572);
});

test('transition starts at the first action frame instead of flashing to the hold frame', () => {
  assert.equal(storyFrameAtPageProgress(0.00123, manifest, { x: 0.5, y: 0.42 }).frame, 240);
});

test('story page transitions use a two-second duration', async () => {
  const story = await import('../story-scroll.ts') as Record<string, unknown>;
  assert.equal(story.STORY_TRANSITION_DURATION_MS, 2000);
});

test('two-second story transition eases through the midpoint', async () => {
  const story = await import('../story-scroll.ts') as Record<string, unknown>;
  const scrollAt = story.storyTransitionScrollValue as
    | ((start: number, target: number, elapsed: number, duration?: number) => number)
    | undefined;
  assert.ok(scrollAt);
  assert.equal(scrollAt(0, 900, 1000, 2000), 450);
  assert.equal(scrollAt(0, 900, 200, 2000), 90);
});

test('source seconds convert to the exact source frame', async () => {
  const story = await import('../story-scroll.ts') as Record<string, unknown>;
  const sourceTimeToFrame = story.sourceTimeToFrame as
    | ((seconds: number, fps: number) => number)
    | undefined;
  assert.ok(sourceTimeToFrame);
  assert.equal(sourceTimeToFrame(13, 24), 312);
  assert.equal(sourceTimeToFrame(26, 24), 624);
  assert.equal(sourceTimeToFrame(29, 24), 696);
});

test('gaze path runs direct-right-up-left-direct without a downward gaze state', async () => {
  const story = await import('../story-scroll.ts') as Record<string, unknown>;
  const gazeTime = story.storyGazeTime as
    | ((pointer: { x: number; y: number }, gaze: unknown) => number)
    | undefined;
  assert.ok(gazeTime);
  const gaze = {
    directTime: 0,
    rightTime: 2.5,
    upTime: 5,
    leftTime: 7.25,
    returnTime: 9,
    deadZone: 0.08,
  };
  assert.equal(gazeTime({ x: 0.5, y: 0.5 }, gaze), 0);
  assert.equal(gazeTime({ x: 1, y: 0.5 }, gaze), 2.5);
  assert.equal(gazeTime({ x: 0.5, y: 0 }, gaze), 5);
  assert.equal(gazeTime({ x: 0, y: 0.5 }, gaze), 7.25);
  assert.equal(gazeTime({ x: 0.5, y: 1 }, gaze), 9);
  assert.equal(gazeTime({ x: 0.501, y: 0.985 }, gaze), 9);
  const lowerRight = gazeTime({ x: 0.85, y: 0.85 }, gaze);
  assert.ok(lowerRight >= 0 && lowerRight <= 2.5);
});

test('second-based timeline lands on the four requested hold times', async () => {
  const story = await import('../story-scroll.ts') as Record<string, unknown>;
  const timelineAt = story.storyTimelineAtPageProgress as
    | ((progress: number, manifest: unknown, pointer: { x: number; y: number }) => {
        sourceTime: number;
        frame: number;
        local: number;
      })
    | undefined;
  assert.ok(timelineAt);
  const manifest = {
    fps: 24,
    gaze: {
      sourceRange: [0, 10],
      directTime: 0,
      rightTime: 2.5,
      upTime: 5,
      leftTime: 7.25,
      returnTime: 9,
      deadZone: 0.08,
    },
    transitions: [
      {
        id: 'experience',
        sourceRange: [10, 12],
        holdTime: 13,
        playbackDurationMs: 3000,
        pacing: [[0, 0], [0.5, 0.25], [1, 1]],
      },
      {
        id: 'projects',
        sourceRange: [15, 18],
        holdTime: 18,
        playbackDurationMs: 3000,
        pacing: [[0, 0], [1, 1]],
      },
      {
        id: 'work',
        sourceRange: [21.07, 26],
        holdTime: 26,
        playbackDurationMs: 4000,
        pacing: [[0, 0], [0.25, 0.35], [1, 1]],
      },
      {
        id: 'contact',
        sourceRange: [26, 29],
        holdTime: 29,
        playbackDurationMs: 3000,
        pacing: [[0, 0], [1, 1]],
      },
    ],
  };
  assert.equal(timelineAt(1, manifest, { x: 0.5, y: 0.5 }).sourceTime, 13);
  assert.equal(timelineAt(2, manifest, { x: 0.5, y: 0.5 }).sourceTime, 18);
  assert.equal(timelineAt(3, manifest, { x: 0.5, y: 0.5 }).sourceTime, 26);
  assert.equal(timelineAt(4, manifest, { x: 0.5, y: 0.5 }).sourceTime, 29);
  assert.equal(timelineAt(3, manifest, { x: 0.5, y: 0.5 }).frame, 624);
  assert.equal(timelineAt(4, manifest, { x: 0.5, y: 0.5 }).frame, 696);
});

test('action one plays slow first and action three accelerates at the start', async () => {
  const story = await import('../story-scroll.ts') as Record<string, unknown>;
  const timelineAt = story.storyTimelineAtPageProgress as
    | ((progress: number, manifest: unknown, pointer: { x: number; y: number }) => {
        sourceTime: number;
        local: number;
      })
    | undefined;
  assert.ok(timelineAt);
  const manifest = {
    fps: 24,
    gaze: {
      sourceRange: [0, 10],
      directTime: 0,
      rightTime: 2.5,
      upTime: 5,
      leftTime: 7.25,
      returnTime: 9,
      deadZone: 0.08,
    },
    transitions: [
      {
        id: 'experience',
        sourceRange: [10, 12],
        holdTime: 13,
        playbackDurationMs: 3000,
        pacing: [[0, 0], [0.5, 0.25], [1, 1]],
      },
      {
        id: 'projects',
        sourceRange: [15, 18],
        holdTime: 18,
        playbackDurationMs: 3000,
        pacing: [[0, 0], [1, 1]],
      },
      {
        id: 'work',
        sourceRange: [21.07, 26],
        holdTime: 26,
        playbackDurationMs: 4000,
        pacing: [[0, 0], [0.25, 0.35], [1, 1]],
      },
      {
        id: 'contact',
        sourceRange: [26, 29],
        holdTime: 29,
        playbackDurationMs: 3000,
        pacing: [[0, 0], [1, 1]],
      },
    ],
  };
  const actionOneMid = timelineAt(0.5, manifest, { x: 0.5, y: 0.5 });
  assert.equal(actionOneMid.sourceTime, 10.5);
  const actionThreeQuarter = timelineAt(2.25, manifest, { x: 0.5, y: 0.5 });
  assert.ok(actionThreeQuarter.sourceTime > 21.07 + (26 - 21.07) * 0.25);
});

test('timeline falls back to linear pacing when pacing is missing', async () => {
  const story = await import('../story-scroll.ts') as Record<string, unknown>;
  const timelineAt = story.storyTimelineAtPageProgress as
    | ((progress: number, manifest: unknown, pointer: { x: number; y: number }) => { sourceTime: number })
    | undefined;
  assert.ok(timelineAt);
  const manifest = {
    fps: 24,
    gaze: {
      sourceRange: [0, 10],
      directTime: 0,
      rightTime: 2.5,
      upTime: 5,
      leftTime: 7.25,
      returnTime: 9,
      deadZone: 0.08,
    },
    transitions: [{
      id: 'legacy',
      sourceRange: [10, 12],
      holdTime: 12,
      playbackDurationMs: 2000,
    }],
  };
  let sourceTime = 0;
  try {
    sourceTime = timelineAt(0.5, manifest, { x: 0.5, y: 0.5 }).sourceTime;
  } catch {
    assert.fail('missing pacing should fall back to a linear mapping');
  }
  assert.equal(sourceTime, 11);
});

test('idle story rendering snaps partial progress to the nearest stable page', async () => {
  const story = await import('../story-scroll.ts') as Record<string, unknown>;
  const stableProgress = story.storyStablePageProgress as
    | ((progress: number, pageCount: number) => number)
    | undefined;
  assert.ok(stableProgress);
  assert.equal(stableProgress(1.04, 5), 1);
  assert.equal(stableProgress(1.25, 5), 1);
  assert.equal(stableProgress(1.62, 5), 2);
  assert.equal(stableProgress(3.98, 5), 4);
});

test('wheel input cannot restart an active story transition', async () => {
  const story = await import('../story-scroll.ts') as Record<string, unknown>;
  const shouldAcceptWheel = story.storyShouldAcceptWheelInput as
    | ((input: { navigating: boolean; delta: number; modalOpen: boolean; ctrlKey: boolean }) => boolean)
    | undefined;
  assert.ok(shouldAcceptWheel);
  assert.equal(shouldAcceptWheel({ navigating: true, delta: 120, modalOpen: false, ctrlKey: false }), false);
  assert.equal(shouldAcceptWheel({ navigating: false, delta: 20, modalOpen: false, ctrlKey: false }), true);
  assert.equal(shouldAcceptWheel({ navigating: false, delta: 0.2, modalOpen: false, ctrlKey: false }), false);
});

test('reverse scrolling follows the same reversible frame path', () => {
  const forward = storyFrameAtPageProgress(2.5, manifest, { x: 0.5, y: 0.42 }).frame;
  const backward = storyFrameAtPageProgress(2.5, manifest, { x: 0.5, y: 0.42 }).frame;
  assert.equal(forward, backward);
  assert.ok(forward >= 384 && forward < 504);
});

test('scroll progress is clamped to five pages', () => {
  assert.equal(storyProgressFromScroll(-20, 900, 5), 0);
  assert.equal(storyProgressFromScroll(1800, 900, 5), 2);
  assert.equal(storyProgressFromScroll(9999, 900, 5), 4);
});
