import test from 'node:test';
import assert from 'node:assert/strict';
import { createGazeFrameCache } from '../gaze-frame-cache.ts';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness(options: { maxFetches?: number; maxDecodedFrames?: number } = {}) {
  const requests: Array<{ frame: number; signal: AbortSignal; gate: ReturnType<typeof deferred<number>> }> = [];
  const released: number[] = [];
  const decoded: number[] = [];
  const cache = createGazeFrameCache({
    totalFrames: 8,
    prefetchRadius: 0,
    priorityFrames: [],
    maxFetches: options.maxFetches ?? 2,
    maxDecodedFrames: options.maxDecodedFrames ?? 3,
    fetchFrame: (frame, signal) => {
      const gate = deferred<number>();
      requests.push({ frame, signal, gate });
      return gate.promise;
    },
    decodeFrame: async (frame, encoded) => {
      assert.equal(encoded, frame);
      decoded.push(frame);
      return { frame, src: `blob:frame-${frame}` };
    },
    releaseFrame: (image) => { released.push(image.frame); },
  });
  async function finish(frame: number) {
    const request = requests.findLast((item) => item.frame === frame);
    assert.ok(request, `missing request for frame ${frame}`);
    request.gate.resolve(frame);
    await flush();
  }
  return { cache, requests, released, decoded, finish };
}

test('changing gaze targets preserves downloads and prepares the latest target', async () => {
  const h = harness();
  h.cache.request(1);
  h.cache.request(2);
  await flush();
  assert.deepEqual(h.requests.map((item) => item.frame), [1, 2]);
  assert.ok(h.requests.every((item) => !item.signal.aborted));
  await h.finish(1);
  assert.equal(h.cache.peek(2), undefined);
  await h.finish(2);
  assert.equal(h.cache.peek(2)?.frame, 2);
  h.cache.request(1);
  await flush();
  assert.equal(h.cache.peek(1)?.frame, 1);
  assert.equal(h.requests.length, 2, 'completed bytes should be reused');
  h.cache.dispose();
});

test('queued gaze requests prioritize the newest target without exceeding concurrency', async () => {
  const h = harness({ maxFetches: 1 });
  h.cache.request(0);
  h.cache.request(1);
  h.cache.request(2);
  await flush();
  assert.deepEqual(h.requests.map((item) => item.frame), [0]);
  await h.finish(0);
  assert.deepEqual(h.requests.map((item) => item.frame), [0, 2]);
  await h.finish(2);
  assert.deepEqual(h.requests.map((item) => item.frame), [0, 2, 1]);
  h.cache.dispose();
});

test('repeated requests for the same frame share one download and decode', async () => {
  const h = harness();
  for (let i = 0; i < 50; i += 1) h.cache.request(3);
  await flush();
  assert.equal(h.requests.length, 1);
  await h.finish(3);
  for (let i = 0; i < 50; i += 1) h.cache.request(3);
  await flush();
  assert.equal(h.requests.length, 1);
  assert.deepEqual(h.decoded, [3]);
  h.cache.dispose();
});

test('decoded cache protects the visible frame and releases evicted images', async () => {
  const h = harness({ maxDecodedFrames: 2 });
  h.cache.request(0);
  await flush();
  await h.finish(0);
  h.cache.setVisible(0);
  h.cache.request(1);
  await flush();
  await h.finish(1);
  h.cache.request(2);
  await flush();
  await h.finish(2);
  assert.equal(h.cache.peek(0)?.frame, 0);
  assert.equal(h.cache.peek(2)?.frame, 2);
  assert.equal(h.cache.peek(1), undefined);
  assert.deepEqual(h.released, [1]);
  assert.equal(h.cache.stats().decoded, 2);
  h.cache.setVisible(2);
  h.cache.request(1);
  await flush();
  assert.equal(h.cache.peek(1)?.frame, 1);
  assert.equal(h.requests.filter((item) => item.frame === 1).length, 1);
  h.cache.dispose();
});

test('warming retains compressed frames without decoding the whole animation', async () => {
  let fetching = 0;
  let maximum = 0;
  const decoded: number[] = [];
  const cache = createGazeFrameCache({
    totalFrames: 12,
    prefetchRadius: 0,
    priorityFrames: [],
    maxFetches: 2,
    maxDecodedFrames: 2,
    fetchFrame: async (frame) => {
      fetching += 1;
      maximum = Math.max(maximum, fetching);
      await flush();
      fetching -= 1;
      return frame;
    },
    decodeFrame: async (frame) => { decoded.push(frame); return frame; },
    releaseFrame: () => {},
  });
  cache.request(0);
  cache.warm();
  for (let i = 0; i < 20 && cache.stats().loaded < 12; i += 1) await flush();
  assert.equal(cache.stats().loaded, 12);
  assert.equal(maximum, 2);
  assert.deepEqual(decoded, [0]);
  cache.dispose();
});

test('failed downloads retry once and leave other gaze frames usable', async () => {
  let attempts = 0;
  const cache = createGazeFrameCache({
    totalFrames: 2,
    prefetchRadius: 0,
    priorityFrames: [],
    fetchFrame: async (frame) => {
      attempts += 1;
      if (frame === 0) throw new Error('unavailable');
      return frame;
    },
    decodeFrame: async (frame) => frame,
    releaseFrame: () => {},
  });
  cache.request(0);
  for (let i = 0; i < 5; i += 1) await flush();
  assert.equal(attempts, 2);
  for (let i = 0; i < 20; i += 1) cache.request(0);
  await flush();
  assert.equal(attempts, 2);
  cache.request(1);
  await flush();
  assert.equal(cache.peek(1), 1);
  cache.dispose();
});

test('neighbor prefetch never exceeds the decode concurrency budget', async () => {
  const gates: Array<ReturnType<typeof deferred<number>>> = [];
  let active = 0;
  let maximum = 0;
  const cache = createGazeFrameCache({
    totalFrames: 8,
    prefetchRadius: 3,
    priorityFrames: [],
    maxDecodes: 2,
    fetchFrame: async (frame) => frame,
    decodeFrame: (frame) => {
      active += 1;
      maximum = Math.max(maximum, active);
      const gate = deferred<number>();
      gates.push(gate);
      return gate.promise.finally(() => { active -= 1; });
    },
    releaseFrame: () => {},
  });
  cache.request(3);
  await flush();
  assert.equal(active, 2);
  for (let index = 0; index < 7; index += 1) {
    gates[index].resolve(index);
    await flush();
    assert.ok(active <= 2);
  }
  assert.equal(maximum, 2);
  assert.equal(cache.stats().decoded, 7);
  cache.dispose();
});

test('successful LRU redecodes do not consume a later transient-error retry', async () => {
  let zeroDecodes = 0;
  const cache = createGazeFrameCache({
    totalFrames: 5,
    prefetchRadius: 0,
    priorityFrames: [],
    maxDecodedFrames: 2,
    fetchFrame: async (frame) => frame,
    decodeFrame: async (frame) => {
      if (frame === 0 && ++zeroDecodes === 3) throw new Error('temporary decode failure');
      return frame;
    },
    releaseFrame: () => {},
  });
  for (const frame of [0, 1, 2, 0, 3, 4, 0]) {
    cache.request(frame);
    await flush();
  }
  assert.equal(zeroDecodes, 4);
  assert.equal(cache.peek(0), 0);
  assert.equal(cache.stats().failed, 0);
  cache.dispose();
});

test('disposing aborts downloads and releases late decode results', async () => {
  const gate = deferred<{ frame: number }>();
  const released: number[] = [];
  const cache = createGazeFrameCache({
    totalFrames: 2,
    prefetchRadius: 0,
    priorityFrames: [],
    fetchFrame: async (frame) => frame,
    decodeFrame: () => gate.promise,
    releaseFrame: (image) => { released.push(image.frame); },
  });
  cache.request(0);
  await flush();
  cache.dispose();
  gate.resolve({ frame: 0 });
  await flush();
  assert.deepEqual(released, [0]);
  assert.equal(cache.stats().decoded, 0);

  const h = harness();
  h.cache.request(0);
  await flush();
  h.cache.dispose();
  assert.ok(h.requests[0].signal.aborted);
  h.requests[0].gate.resolve(0);
  await flush();
  assert.equal(h.cache.stats().loaded, 0);
});
