/**
 * 桌面双平台滚动手感画像 —— 原则：跟手优先，JS 平滑只给「系统不平滑」的输入补位。
 *
 * 背景事实（详见 方案/桌面双平台滚动手感调研-macOS触控板vsWindows鼠标.html）：
 * - macOS 触控板/妙具鼠标：deltaMode=0 像素级小增量（0.5–5px/事件，60–120 事件/秒）+ 系统惯性，
 *   原生滚动本身就是「丝滑」的。再叠 JS lerp 会出现「手指没抬、内容继续滑」的脱指感
 *   （Lenis issue #397 的原始投诉；维护者承认 JS 无法可靠识别设备，建议加大 lerp 逼近原生）。
 * - macOS 第三方鼠标：系统默认仍对滚轮档位做惯性动画（NSScrollAnimationEnabled 默认开），
 *   故 mac 上任何输入都不需要 JS 平滑（二手来源，以实测为准）。
 * - Windows 精密触控板：像素级增量 + 系统惯性，与 mac 触控板同构 → 交还原生。
 * - Windows 鼠标：滚轮一档 = 离散事件（Chrome/Edge 报 33–120px/档，Firefox 报行模式），
 *   浏览器是否补间取决于 Chrome flag（口径不一）→ 由 JS 补一层 lerp 提供滑行。
 *
 * 识别手段：无标准 API，采用多信号启发式（deltaMode / 小数增量 / 斜向 / 频率 / 幅度），
 * 与 @mauricelam/trackormouse 同思路；证据不足时偏向 mouse（JS lerp 降级最优雅）。
 * Lenis 的 this.options 为公开可变对象、smoothWheel/lerp 每事件读取（1.3.26 源码证实），
 * 因此判定后可直接热改配置，无需重建实例。
 *
 * 人工 A/B：URL 参数 ?scrollLerp=0.2 / ?scrollSmooth=0 / ?scrollDebug=1。
 */

export type Platform = 'mac' | 'windows' | 'linux' | 'other';
export type InputKind = 'trackpad' | 'mouse';

export interface WheelSample {
  /** WheelEvent.deltaMode：0=像素 1=行 2=页 */
  deltaMode: number;
  deltaY: number;
  deltaX: number;
  /** performance.now() 口径，ms */
  time: number;
}

export interface ScrollSmoothConfig {
  smoothWheel: boolean;
  lerp: number;
}

export interface ScrollProfileInfo {
  platform: Platform;
  input: InputKind | 'override';
  config: ScrollSmoothConfig;
}

/** 交还原生：不接管 wheel，Lenis 仅同步/透传（onNativeScroll 路径，进度映射保持 1:1） */
const NATIVE: ScrollSmoothConfig = { smoothWheel: false, lerp: 1 };
/** 鼠标单层 lerp：0.1 ≈ 0.47s 95% 收敛（60fps），滑行与跟手的折中；要更跟手可调大 */
const MOUSE_SMOOTH: ScrollSmoothConfig = { smoothWheel: true, lerp: 0.1 };

/** 鼠标一档的最小像素增量：Chrome/Edge 在 Windows 实测 33–120px/档，取 24 作判定下限 */
export const MOUSE_TICK_MIN_PX = 24;
/** 触控板事件频率下限（事件/秒）：实测 60–120 vs 鼠标 3–8 */
export const TRACKPAD_MIN_EVENTS_PER_SEC = 30;
/** 判定所需样本数（触控板约 100ms 内即可攒够） */
export const PROFILE_SAMPLES = 12;
/** 判定窗口（ms）：鼠标约 3–8 档/秒，700ms 足够攒出幅度证据 */
export const PROFILE_WINDOW_MS = 700;

/** 最小结构：Lenis 实例（运行时热改 options 用） */
interface SmoothScrollInstance {
  options: { smoothWheel: boolean; lerp: number };
}

export function detectPlatform(ua: string = navigator.userAgent): Platform {
  if (/Mac|iPhone|iPad|iPod/.test(ua)) return 'mac';
  if (/Win/.test(ua)) return 'windows';
  if (/Linux|X11|CrOS/.test(ua)) return 'linux';
  return 'other';
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * 多信号分类（纯函数，可单测）。判定顺序即优先级：
 * 1. deltaMode 非像素（行/页模式）→ 鼠标（Firefox 等经典档位）
 * 2. 小数增量 → 触控板（高分辨率连续输入；系统加速度也会产出小数）
 * 3. 斜向增量（deltaX 与 deltaY 同时非零）→ 触控板（双指）；纯横向不计入（倾斜滚轮干扰）
 * 4. 频率 ≥ 30 事件/秒 → 触控板
 * 5. 垂直增量中位数 ≥ 24px → 鼠标（一档像素量级）
 * 6. 其余 → 触控板
 */
export function classifyWheel(samples: WheelSample[]): InputKind {
  const vertical = samples.filter((s) => s.deltaY !== 0);
  if (samples.some((s) => s.deltaMode !== 0)) return 'mouse';
  if (samples.some((s) => !Number.isInteger(s.deltaY) || !Number.isInteger(s.deltaX))) return 'trackpad';
  if (samples.some((s) => s.deltaX !== 0 && s.deltaY !== 0)) return 'trackpad';
  if (vertical.length === 0) return 'mouse';
  const spanMs = samples[samples.length - 1].time - samples[0].time;
  if (spanMs > 0 && (samples.length * 1000) / spanMs >= TRACKPAD_MIN_EVENTS_PER_SEC) return 'trackpad';
  return median(vertical.map((s) => Math.abs(s.deltaY))) >= MOUSE_TICK_MIN_PX ? 'mouse' : 'trackpad';
}

/** 平台 × 输入 → Lenis 平滑配置 */
export function scrollConfigFor(platform: Platform, input: InputKind): ScrollSmoothConfig {
  // mac：系统默认对触控板与第三方鼠标都提供惯性平滑 → 一律原生，JS 不叠第二层
  if (platform === 'mac') return NATIVE;
  // Windows/Linux 精密触控板：系统惯性 → 原生
  if (input === 'trackpad') return NATIVE;
  // Windows/Linux 鼠标：浏览器补间与否不可知 → JS 补单层 lerp
  return MOUSE_SMOOTH;
}

/** 解析人工 A/B 参数：?scrollLerp=0.2 / ?scrollSmooth=0 */
export function readScrollOverrides(search: string): ScrollSmoothConfig | null {
  const q = new URLSearchParams(search);
  const lerpRaw = q.get('scrollLerp');
  const smoothRaw = q.get('scrollSmooth');
  if (lerpRaw === null && smoothRaw === null) return null;
  const config: ScrollSmoothConfig = {
    smoothWheel: smoothRaw === null ? true : smoothRaw !== '0' && smoothRaw !== 'false',
    lerp: MOUSE_SMOOTH.lerp,
  };
  if (lerpRaw !== null) {
    const v = Number(lerpRaw);
    if (Number.isFinite(v)) config.lerp = Math.min(1, Math.max(0, v));
  }
  return config;
}

/** 纯采样器：攒够样本或窗口用尽时判定一次；mouse 后遇到强触控板证据可升级（外设切换）。 */
export function createWheelProfiler(opts: {
  onDecision: (input: InputKind, samples: WheelSample[]) => void;
  maxSamples?: number;
  windowMs?: number;
}): {
  add: (sample: WheelSample) => InputKind | null;
  readonly decided: InputKind | null;
} {
  const maxSamples = opts.maxSamples ?? PROFILE_SAMPLES;
  const windowMs = opts.windowMs ?? PROFILE_WINDOW_MS;
  const samples: WheelSample[] = [];
  let decided: InputKind | null = null;

  const decide = (): InputKind | null => {
    if (decided || samples.length === 0) return null;
    decided = classifyWheel(samples);
    opts.onDecision(decided, [...samples]);
    return decided;
  };

  return {
    add(sample: WheelSample): InputKind | null {
      if (decided === 'mouse' && looksLikeTrackpad(sample)) {
        // 外设切换或自由滚动滚轮：鼠标判定后遇到小数/斜向证据 → 升级为触控板
        samples.push(sample);
        decided = 'trackpad';
        opts.onDecision(decided, [...samples]);
        return decided;
      }
      if (decided) return decided;
      samples.push(sample);
      if (samples.length >= maxSamples) return decide();
      if (sample.time - samples[0].time >= windowMs) return decide();
      return null;
    },
    get decided() {
      return decided;
    },
  };
}

/** 单事件级别的强触控板证据：小数增量或斜向（双指） */
function looksLikeTrackpad(sample: WheelSample): boolean {
  if (sample.deltaMode !== 0) return false;
  if (!Number.isInteger(sample.deltaY) || !Number.isInteger(sample.deltaX)) return true;
  return sample.deltaX !== 0 && sample.deltaY !== 0;
}

function currentSearch(): string {
  return typeof location !== 'undefined' ? location.search : '';
}

/**
 * 把画像绑到 Lenis 实例：被动监听 wheel（只读，不 preventDefault），
 * 判定后热改 lenis.options（1.3.26 源码证实 options 公开可变且每事件读取）。
 * 同时在 <html> 上写 data-scroll-platform / data-scroll-input 供手感收集时肉眼核对，
 * 并派发 scrollprofile 事件。?scrollDebug=1 时打印判定明细。
 */
export function attachWheelProfiler(
  lenis: SmoothScrollInstance,
  opts: {
    platform?: Platform;
    onProfile?: (info: ScrollProfileInfo) => void;
    search?: string;
  } = {},
): () => void {
  const platform = opts.platform ?? detectPlatform();
  const search = opts.search ?? currentSearch();
  const debug = /[?&]scrollDebug=1\b/.test(search);
  const override = readScrollOverrides(search);

  const publish = (info: ScrollProfileInfo) => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.scrollPlatform = info.platform;
      document.documentElement.dataset.scrollInput = info.input;
      document.dispatchEvent(new CustomEvent<ScrollProfileInfo>('scrollprofile', { detail: info }));
    }
    if (debug) console.debug('[scroll-profile]', info);
    opts.onProfile?.(info);
  };

  if (override) {
    lenis.options.smoothWheel = override.smoothWheel;
    lenis.options.lerp = override.lerp;
    publish({ platform, input: 'override', config: override });
    return () => {};
  }

  const profiler = createWheelProfiler({
    onDecision: (input) => {
      const config = scrollConfigFor(platform, input);
      lenis.options.smoothWheel = config.smoothWheel;
      lenis.options.lerp = config.lerp;
      publish({ platform, input, config });
    },
  });

  const onWheel = (event: WheelEvent) => {
    profiler.add({
      deltaMode: event.deltaMode,
      deltaY: event.deltaY,
      deltaX: event.deltaX,
      time: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    });
  };

  addEventListener('wheel', onWheel, { passive: true });
  return () => removeEventListener('wheel', onWheel);
}

/** 创建自适应 Lenis 时传入的构造参数（与 LenisOptions 对应字段兼容） */
export interface AdaptiveLenisOptions {
  smoothWheel: boolean;
  lerp: number;
  syncTouch: boolean;
  autoRaf: boolean;
}

/**
 * 一步到位：按平台先验创建 Lenis 并挂上画像。
 * 先验取值 scrollConfigFor(platform, 'mouse')：mac=原生；Windows/linux=鼠标单层 lerp
 * （桌面用户多数用鼠标；触控板用户会在首次滑动约 100–700ms 内被改判为原生）。
 */
export function createAdaptiveLenis<T extends SmoothScrollInstance>(
  LenisCtor: new (options: AdaptiveLenisOptions) => T,
  opts: {
    onProfile?: (info: ScrollProfileInfo) => void;
    search?: string;
  } = {},
): { lenis: T; stop: () => void; platform: Platform } {
  const platform = detectPlatform();
  const prior = scrollConfigFor(platform, 'mouse');
  const lenis = new LenisCtor({
    ...prior,
    // A1：触屏永远走系统原生惯性；平滑只发生在桌面 wheel
    syncTouch: false,
    autoRaf: false,
  });
  const stop = attachWheelProfiler(lenis, {
    platform,
    onProfile: opts.onProfile,
    search: opts.search,
  });
  return { lenis, stop, platform };
}
