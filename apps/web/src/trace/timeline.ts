/**
 * 时间线模型（CP3 文档 2.1 / 2.2）：把 ProbeResult.decisions 摊成首尾相接的片段。
 * 纯函数，不依赖 React，也不改引擎数据。
 */

import type { Decision, DecisionPhase, Link, ProbeResult } from "@virtual-net/engine";
import { BASE_MS, MAX_TOTAL_MS } from "./durations";

export type SegmentKind = "dwell" | "travel" | "gap";

export type SegmentStyle = "normal" | "renew" | "stop" | "receive";

export interface Segment {
  /** 在 segments 里的下标 */
  index: number;
  /** 所属 decision 的 seq */
  seq: number;
  phase: DecisionPhase;
  kind: SegmentKind;
  /** dwell / gap：停在哪；travel：从哪出发 */
  deviceId: string;
  /** travel 专用：沿哪根连线 */
  linkId?: string;
  /** travel 专用：连线另一端的设备 */
  toDeviceId?: string;
  style: SegmentStyle;
  startMs: number;
  endMs: number;
}

/** 每条 decision 一个刻度，指向它的 dwell 起点 */
export interface Mark {
  seq: number;
  atMs: number;
}

export interface Timeline {
  /** 构建时的 topologyRevision，拓扑一变就对不上 */
  revision: number;
  totalMs: number;
  segments: Segment[];
  marks: Mark[];
  /** 引擎数据与拓扑对不上时的提示，不抛错 */
  warnings: string[];
}

/** 内部：还没做等比缩短的片段 */
interface RawSegment {
  seq: number;
  phase: DecisionPhase;
  kind: SegmentKind;
  deviceId: string;
  linkId?: string;
  toDeviceId?: string;
  style: SegmentStyle;
  ms: number;
}

/** 连线另一端的设备；找不到连线返回 null */
function otherEnd(
  links: readonly Link[] | undefined,
  linkId: string,
  fromDeviceId: string,
): string | null {
  if (!links) return null;
  const link = links.find((l) => l.id === linkId);
  if (!link) return null;
  if (link.a.deviceId === fromDeviceId) return link.b.deviceId;
  if (link.b.deviceId === fromDeviceId) return link.a.deviceId;
  // 连线两端都不是这台设备：数据不一致，交给调用方按 warning 处理
  return null;
}

/**
 * 把一次验证摊成时间线。
 * `links` 用来确定 travel 的对端；不传时退回「下一条 decision 的设备」。
 */
export function buildTimeline(
  probe: ProbeResult,
  revision: number,
  links?: readonly Link[],
): Timeline {
  const warnings: string[] = [];
  const raw: RawSegment[] = [];
  /** decision 的 seq → 它的 dwell 在 raw 里的下标 */
  const dwellIndex = new Map<number, number>();
  const decisions = probe.decisions;

  const pushDwell = (d: Decision, style: SegmentStyle, ms: number): void => {
    dwellIndex.set(d.seq, raw.length);
    raw.push({
      seq: d.seq,
      phase: d.phase,
      kind: "dwell",
      deviceId: d.deviceId,
      style,
      ms,
    });
  };

  const pushTravel = (d: Decision, next: Decision | undefined): void => {
    if (d.linkId === null) {
      warnings.push(
        `第 ${d.seq} 条 decision 的 action 是 ${d.action} 却没有 linkId，这一步不画移动`,
      );
      return;
    }
    const byLink = otherEnd(links, d.linkId, d.deviceId);
    let toDeviceId: string | undefined;
    if (byLink !== null) {
      toDeviceId = byLink;
      if (next && next.deviceId !== byLink) {
        warnings.push(
          `第 ${d.seq} 条 decision 沿连线 ${d.linkId} 到 ${byLink}，` +
            `但下一条 decision 在 ${next.deviceId}，以连线为准`,
        );
      }
    } else {
      if (links) {
        warnings.push(`连线 ${d.linkId} 不在拓扑里，按下一条 decision 的设备取对端`);
      }
      toDeviceId = next?.deviceId;
      if (toDeviceId === undefined) {
        warnings.push(`第 ${d.seq} 条 decision 沿连线 ${d.linkId} 出去，但拿不到对端设备`);
      }
    }
    raw.push({
      seq: d.seq,
      phase: d.phase,
      kind: "travel",
      deviceId: d.deviceId,
      linkId: d.linkId,
      toDeviceId,
      style: "normal",
      ms: BASE_MS.travel,
    });
  };

  for (let i = 0; i < decisions.length; i += 1) {
    const d = decisions[i];
    if (!d) continue;
    const next = decisions[i + 1];

    if (d.verdict === "stop") {
      pushDwell(d, "stop", BASE_MS.stop);
      break;
    }

    switch (d.action) {
      case "originate": {
        const renew = d.packetIn !== null;
        pushDwell(d, renew ? "renew" : "normal", renew ? BASE_MS.renew : BASE_MS.dwell);
        pushTravel(d, next);
        break;
      }
      case "forward":
      case "answer": {
        pushDwell(d, "normal", BASE_MS.dwell);
        pushTravel(d, next);
        break;
      }
      case "receive": {
        pushDwell(d, "receive", BASE_MS.receive);
        if (next && next.phase !== d.phase) {
          raw.push({
            seq: d.seq,
            phase: d.phase,
            kind: "gap",
            deviceId: d.deviceId,
            style: "normal",
            ms: BASE_MS.gap,
          });
        }
        break;
      }
      default: {
        warnings.push(`第 ${d.seq} 条 decision 的 action 无法识别，只画一次停留`);
        pushDwell(d, "normal", BASE_MS.dwell);
        break;
      }
    }
  }

  const rawTotal = raw.reduce((sum, s) => sum + s.ms, 0);
  const factor = rawTotal > MAX_TOTAL_MS ? MAX_TOTAL_MS / rawTotal : 1;

  const segments: Segment[] = [];
  let rawCursor = 0;
  for (const [index, s] of raw.entries()) {
    const startMs = Math.round(rawCursor * factor);
    rawCursor += s.ms;
    const endMs = Math.round(rawCursor * factor);
    segments.push({
      index,
      seq: s.seq,
      phase: s.phase,
      kind: s.kind,
      deviceId: s.deviceId,
      ...(s.linkId === undefined ? {} : { linkId: s.linkId }),
      ...(s.toDeviceId === undefined ? {} : { toDeviceId: s.toDeviceId }),
      style: s.style,
      startMs,
      endMs,
    });
  }

  const marks: Mark[] = [];
  for (const [seq, at] of dwellIndex) {
    const segment = segments[at];
    if (segment) marks.push({ seq, atMs: segment.startMs });
  }
  marks.sort((a, b) => a.atMs - b.atMs || a.seq - b.seq);

  const last = segments[segments.length - 1];
  return { revision, totalMs: last ? last.endMs : 0, segments, marks, warnings };
}

/** 时刻落在哪个片段上；`ms` 会被夹在 [0, totalMs] 内。空时间线返回 null */
export function segmentAt(timeline: Timeline, ms: number): Segment | null {
  const { segments } = timeline;
  const first = segments[0];
  if (!first) return null;
  if (ms <= 0) return first;
  const last = segments[segments.length - 1];
  if (last && ms >= timeline.totalMs) return last;
  for (const segment of segments) {
    if (ms < segment.endMs) return segment;
  }
  return last ?? null;
}

/** 某条 decision 的 dwell 起点；没有这条 seq 时返回 0 */
export function seekToSeq(timeline: Timeline, seq: number): number {
  return timeline.marks.find((m) => m.seq === seq)?.atMs ?? 0;
}

export interface Progress {
  /** 当前片段 */
  segment: Segment | null;
  /** 当前 decision 的 seq；空时间线为 null */
  seq: number | null;
  /** 已经开始过的 dwell 对应的 seq，按先后顺序 */
  visitedSeqs: number[];
  /** 已经到访过的设备，按先后顺序去重 */
  visitedDeviceIds: string[];
  /** 已经走过（含正在走）的连线，按先后顺序去重 */
  walkedLinkIds: string[];
}

/** 画布高亮要的派生量：到访过的设备、走过的线、走过的 seq */
export function progressAt(timeline: Timeline, ms: number): Progress {
  const segment = segmentAt(timeline, ms);
  const visitedSeqs: number[] = [];
  const visitedDeviceIds: string[] = [];
  const walkedLinkIds: string[] = [];
  const limit = segment ? segment.index : -1;
  for (const s of timeline.segments) {
    if (s.index > limit) break;
    if (s.kind === "dwell") {
      visitedSeqs.push(s.seq);
      if (!visitedDeviceIds.includes(s.deviceId)) visitedDeviceIds.push(s.deviceId);
    }
    if (s.kind === "travel" && s.linkId && !walkedLinkIds.includes(s.linkId)) {
      walkedLinkIds.push(s.linkId);
    }
  }
  return {
    segment,
    seq: segment ? segment.seq : null,
    visitedSeqs,
    visitedDeviceIds,
    walkedLinkIds,
  };
}

/** 每台设备被到访的 seq 列表，用于节点角标（如 `2 · 4`） */
export function seqsByDevice(timeline: Timeline): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const s of timeline.segments) {
    if (s.kind !== "dwell") continue;
    const list = out[s.deviceId] ?? [];
    if (!list.includes(s.seq)) list.push(s.seq);
    out[s.deviceId] = list;
  }
  return out;
}
