export interface GazeCacheStats {
  loaded: number;
  decoded: number;
  fetching: number;
  failed: number;
  total: number;
}

export interface GazeFrameCacheOptions<Encoded, Decoded> {
  totalFrames: number;
  fetchFrame: (frame: number, signal: AbortSignal) => Promise<Encoded>;
  decodeFrame: (frame: number, encoded: Encoded) => Promise<Decoded>;
  releaseFrame: (decoded: Decoded) => void;
  onReady?: (frame: number) => void;
  onProgress?: (stats: GazeCacheStats) => void;
  priorityFrames?: number[];
  prefetchRadius?: number;
  maxFetches?: number;
  maxDecodes?: number;
  maxDecodedFrames?: number;
}

/** Keep downloads independent of the visible image and bound decoded memory. */
export function createGazeFrameCache<Encoded, Decoded>(
  options: GazeFrameCacheOptions<Encoded, Decoded>,
) {
  const total = Math.max(1, Math.round(options.totalFrames));
  const radius = Math.max(0, options.prefetchRadius ?? 4);
  const maxFetches = Math.max(1, options.maxFetches ?? 4);
  const maxDecodes = Math.max(1, options.maxDecodes ?? 2);
  const maxDecoded = Math.max(2, options.maxDecodedFrames ?? 24);
  const normalize = (frame: number) => Math.max(0, Math.min(total - 1, Math.round(frame) || 0));
  const anchors = new Set((options.priorityFrames ?? []).map(normalize));
  const encoded = new Map<number, Encoded>();
  const decoded = new Map<number, Decoded>();
  const fetchQueue = new Set<number>();
  const decodeQueue = new Set<number>();
  const controllers = new Map<number, AbortController>();
  const decoding = new Set<number>();
  const fetchAttempts = new Map<number, number>();
  const decodeAttempts = new Map<number, number>();
  const failed = new Set<number>();
  let target = -1;
  let visible = -1;
  let disposed = false;

  const stats = (): GazeCacheStats => ({
    loaded: encoded.size,
    decoded: decoded.size,
    fetching: controllers.size,
    failed: failed.size,
    total,
  });
  const notify = () => { if (!disposed) options.onProgress?.(stats()); };
  const wanted = (frame: number) =>
    target >= 0 && (Math.abs(frame - target) <= radius || anchors.has(frame));
  const priority = (frame: number) => {
    if (frame === target) return 0;
    if (target >= 0 && Math.abs(frame - target) <= radius) return 1;
    return anchors.has(frame) ? 2 : 3;
  };
  const takeNext = (queue: Set<number>) => {
    let next: number | undefined;
    for (const frame of queue) {
      if (next === undefined || priority(frame) < priority(next)
        || (priority(frame) === priority(next) && Math.abs(frame - target) < Math.abs(next - target))) {
        next = frame;
      }
    }
    if (next !== undefined) queue.delete(next);
    return next;
  };

  const trimDecoded = () => {
    while (decoded.size > maxDecoded) {
      const victim = [...decoded.keys()].find((frame) => frame !== visible && frame !== target);
      if (victim === undefined) break;
      const image = decoded.get(victim)!;
      decoded.delete(victim);
      options.releaseFrame(image);
    }
  };

  const queueFrame = (frame: number) => {
    if (failed.has(frame)) return;
    if (encoded.has(frame)) {
      if (wanted(frame) && !decoded.has(frame) && !decoding.has(frame)) decodeQueue.add(frame);
    } else if (!controllers.has(frame)) fetchQueue.add(frame);
  };

  const pumpDecodes = () => {
    if (disposed) return;
    while (decoding.size < maxDecodes && decodeQueue.size) {
      const frame = takeNext(decodeQueue)!;
      if (!wanted(frame) || decoded.has(frame) || decoding.has(frame) || failed.has(frame)) continue;
      const data = encoded.get(frame);
      if (!encoded.has(frame)) continue;
      decoding.add(frame);
      decodeAttempts.set(frame, (decodeAttempts.get(frame) ?? 0) + 1);
      void Promise.resolve()
        .then(() => options.decodeFrame(frame, data!))
        .then((image) => {
          if (disposed) { options.releaseFrame(image); return; }
          decoded.set(frame, image);
          trimDecoded();
          if (decoded.has(frame)) options.onReady?.(frame);
        })
        .catch(() => {
          if (disposed) return;
          if ((decodeAttempts.get(frame) ?? 0) < 2) decodeQueue.add(frame);
          else failed.add(frame);
        })
        .finally(() => {
          decoding.delete(frame);
          notify();
          pumpDecodes();
        });
    }
  };

  const pumpFetches = () => {
    if (disposed) return;
    while (controllers.size < maxFetches && fetchQueue.size) {
      const frame = takeNext(fetchQueue)!;
      if (encoded.has(frame) || controllers.has(frame) || failed.has(frame)) continue;
      const controller = new AbortController();
      controllers.set(frame, controller);
      fetchAttempts.set(frame, (fetchAttempts.get(frame) ?? 0) + 1);
      void Promise.resolve()
        .then(() => options.fetchFrame(frame, controller.signal))
        .then((data) => {
          if (disposed) return;
          encoded.set(frame, data);
          queueFrame(frame);
          pumpDecodes();
        })
        .catch(() => {
          if (disposed) return;
          if ((fetchAttempts.get(frame) ?? 0) < 2) fetchQueue.add(frame);
          else failed.add(frame);
        })
        .finally(() => {
          controllers.delete(frame);
          notify();
          pumpFetches();
        });
    }
  };

  return {
    request(frame: number) {
      if (disposed) return;
      target = normalize(frame);
      for (const queued of decodeQueue) if (!wanted(queued)) decodeQueue.delete(queued);
      queueFrame(target);
      for (let offset = 1; offset <= radius; offset += 1) {
        if (target - offset >= 0) queueFrame(target - offset);
        if (target + offset < total) queueFrame(target + offset);
      }
      for (const anchor of anchors) queueFrame(anchor);
      pumpDecodes();
      pumpFetches();
    },
    peek(frame: number): Decoded | undefined {
      const safeFrame = normalize(frame);
      const image = decoded.get(safeFrame);
      if (decoded.has(safeFrame)) {
        decoded.delete(safeFrame);
        decoded.set(safeFrame, image!);
      }
      return image;
    },
    setVisible(frame: number) {
      if (disposed) return;
      visible = normalize(frame);
      trimDecoded();
    },
    warm() {
      if (disposed) return;
      for (let frame = 0; frame < total; frame += 1) queueFrame(frame);
      pumpFetches();
    },
    stats,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const controller of controllers.values()) controller.abort();
      for (const image of decoded.values()) options.releaseFrame(image);
      controllers.clear();
      fetchQueue.clear();
      decodeQueue.clear();
      encoded.clear();
      decoded.clear();
    },
  };
}
