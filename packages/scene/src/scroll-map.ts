// 帧序列滚动叙事：把插帧工作台产出的分段预算（budget.json）映射为「滚动进度 → 帧索引」。
// 帧数线性映射：快段（多帧）每帧占的进度步长小 → 滚动视觉变慢；静止去重段 1 帧 → 瞬间滑过。

export interface SegmentBudget {
  start: number;
  end: number;
  ratio: number;
  dedup?: boolean;
  src_frames: number;
  out_frames: number;
  out_fps: number;
}

export interface FrameMapEntry {
  frame: number;
  seg: number;
  time: number;
  pFrom: number;
  pTo: number;
}

export interface SceneBudget {
  segments: SegmentBudget[];
  total_out_frames: number;
  map: FrameMapEntry[];
  webp_dir?: string;
}

/** 由 segments 重建索引表（后端已生成 map 时直接使用；此处用于自定义/校验）。 */
export function buildIndex(segments: SegmentBudget[]): FrameMapEntry[] {
  const total = segments.reduce((a, s) => a + s.out_frames, 0);
  const map: FrameMapEntry[] = [];
  segments.forEach((m, si) => {
    const segLen = Math.max(1e-6, m.end - m.start);
    for (let k = 0; k < m.out_frames; k += 1) {
      map.push({
        frame: map.length,
        seg: si,
        time: m.start + (k * segLen) / Math.max(1, m.out_frames),
        pFrom: map.length / Math.max(1, total),
        pTo: (map.length + 1) / Math.max(1, total),
      });
    }
  });
  return map;
}

/** 滚动进度 p（0–1）→ 帧序列条目（帧/段/时间）。帧数线性：每帧进度步长 = 1 / total_out_frames。 */
export function frameAtProgress(budget: SceneBudget, progress: number): FrameMapEntry {
  const p = Math.max(0, Math.min(0.9999999, progress));
  const map = budget.map ?? buildIndex(budget.segments);
  if (map.length === 0) {
    return { frame: 0, seg: 0, time: 0, pFrom: 0, pTo: 1 };
  }
  const idx = Math.min(map.length - 1, Math.floor(p * (budget.total_out_frames || map.length)));
  return map[idx] ?? map[map.length - 1];
}

/** 兼容字段：帧序列模式下「时间」= 该帧对应的素材时间。 */
export function timeAtFrame(entry: FrameMapEntry): number {
  return entry.time;
}

export { };
