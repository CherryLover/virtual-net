/**
 * CP3 动画状态（4.1）。独立于拓扑 store：
 * - `cursorMs` 每帧都变，放一起会让拓扑的订阅者跟着空转
 * - 动画状态不能进撤销栈，分开天然满足
 * 两个 store 的联动写在 `store/index.ts`，避免互相 import 成环。
 */
import { create } from "zustand";
import type { NameSnapshot } from "../trace/names";
import type { Timeline } from "../trace/timeline";
import { seekToSeq } from "../trace/timeline";

export type PlaybackSpeed = 0.5 | 1 | 2;

/**
 * 验证那一刻拍下的名字表：`{ devices, ports }`，deviceId / portId → 名字。
 * 设备被删掉之后逐跳列表和包头还要显示得出名字（CP3 4.2）。
 * 形状与 `trace/names.ts` 的 `NameSnapshot` 一致，`namesFromSnapshot` 可直接消费。
 */
export type TraceNameSnapshot = NameSnapshot;

/**
 * 一帧最多推进这么多毫秒。正常掉帧要照实补上，不然整趟会越播越长；
 * 真正的长间隔（标签页切走）由 `usePlayback` 在切回来时重置计时，这里只兜最后一道。
 */
const MAX_FRAME_MS = 1000;

/** 单步时判断「已经过了这个刻度」的容差 */
const EPS = 1;

interface TraceState {
  timeline: Timeline | null;
  /** 时间线对应的拓扑版本号。✕ 清掉 timeline 后仍保留，作废横幅还要用 */
  revision: number | null;
  cursorMs: number;
  playing: boolean;
  speed: PlaybackSpeed;
  stale: boolean;
  inspectorSeq: number | null;
  /** 建时间线那一刻的名字快照 */
  snapshot: TraceNameSnapshot | null;

  /** 一次新的验证：建时间线、从头自动播 */
  load: (timeline: Timeline, revision: number, snapshot: TraceNameSnapshot) => void;
  /** 没有结果了（新建、导入、撤销）：什么都不留 */
  reset: () => void;
  /** ✕：清掉画面，保留结果与作废判定 */
  clear: () => void;
  /** 拓扑改动 */
  markStale: () => void;

  tick: (dtMs: number) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setSpeed: (speed: PlaybackSpeed) => void;
  /** 拖进度条 / 点某个位置：停在那里，不自动续播 */
  seekMs: (ms: number) => void;
  /** 点逐跳行、跳数表行：跳到该条 decision 的停留起点并暂停 */
  seekSeq: (seq: number) => void;
  /** ⏮ ⏭：跳到上一 / 下一个刻度并暂停 */
  step: (delta: 1 | -1) => void;

  openInspector: (seq: number) => void;
  closeInspector: () => void;
  /** 包头模态框的上一跳 / 下一跳 */
  stepInspector: (delta: 1 | -1) => void;
}

export const useTraceStore = create<TraceState>((set, get) => ({
  timeline: null,
  revision: null,
  cursorMs: 0,
  playing: false,
  speed: 1,
  stale: false,
  inspectorSeq: null,
  snapshot: null,

  load: (timeline, revision, snapshot) =>
    set({
      timeline,
      revision,
      snapshot,
      cursorMs: 0,
      playing: timeline.totalMs > 0,
      stale: false,
      inspectorSeq: null,
    }),

  reset: () =>
    set({
      timeline: null,
      revision: null,
      snapshot: null,
      cursorMs: 0,
      playing: false,
      stale: false,
      inspectorSeq: null,
    }),

  clear: () => set({ timeline: null, cursorMs: 0, playing: false, inspectorSeq: null }),

  markStale: () => {
    if (get().revision === null) return;
    set({ stale: true, playing: false, inspectorSeq: null });
  },

  tick: (dtMs) => {
    const { timeline, playing, cursorMs, speed, stale } = get();
    if (!timeline || !playing || stale) return;
    const next = cursorMs + Math.min(dtMs, MAX_FRAME_MS) * speed;
    if (next >= timeline.totalMs) set({ cursorMs: timeline.totalMs, playing: false });
    else set({ cursorMs: next });
  },

  play: () => {
    const { timeline, stale } = get();
    if (!timeline || stale) return;
    // 播完之后再点 ▶：从头再来
    set({ playing: true, cursorMs: get().cursorMs >= timeline.totalMs ? 0 : get().cursorMs });
  },

  pause: () => set({ playing: false }),

  togglePlay: () => (get().playing ? get().pause() : get().play()),

  setSpeed: (speed) => set({ speed }),

  seekMs: (ms) => {
    const timeline = get().timeline;
    if (!timeline) return;
    set({ cursorMs: Math.max(0, Math.min(ms, timeline.totalMs)), playing: false });
  },

  seekSeq: (seq) => {
    const timeline = get().timeline;
    if (!timeline) return;
    set({ cursorMs: seekToSeq(timeline, seq), playing: false });
  },

  step: (delta) => {
    const { timeline, cursorMs } = get();
    if (!timeline) return;
    const marks = timeline.marks;
    const target =
      delta > 0
        ? marks.find((m) => m.atMs > cursorMs + EPS)
        : [...marks].reverse().find((m) => m.atMs < cursorMs - EPS);
    if (!target) return;
    set({ cursorMs: target.atMs, playing: false });
  },

  // 打开包头时把包挪到这一跳，画布和模态框说的是同一件事
  openInspector: (seq) => {
    const timeline = get().timeline;
    set({
      inspectorSeq: seq,
      playing: false,
      ...(timeline ? { cursorMs: seekToSeq(timeline, seq) } : {}),
    });
  },
  closeInspector: () => set({ inspectorSeq: null }),

  stepInspector: (delta) => {
    const { timeline, inspectorSeq } = get();
    if (!timeline || inspectorSeq === null) return;
    const seqs = timeline.marks.map((m) => m.seq);
    const at = seqs.indexOf(inspectorSeq);
    const next = seqs[at + delta];
    if (next === undefined) return;
    set({ inspectorSeq: next, cursorMs: seekToSeq(timeline, next) });
  },
}));

// 调试用：开发模式下把动画状态挂到 window（vitest 跑在 node 里，没有 window）
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__trace = useTraceStore;
}
