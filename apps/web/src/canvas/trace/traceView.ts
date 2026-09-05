/**
 * 由 `cursorMs` 派生画布上要画的东西（CP3 3.1、4.1）：
 * 到访过的节点与序号、走过的连线、当前停在哪、停在哪失败。
 * 只依赖时间线，不碰 React。
 */
import type { Segment, Timeline } from "../../trace/timeline";
import { segmentAt } from "../../trace/timeline";

/** 阶段色：ping 蓝、DNS 紫、连接绿。画布上的包与进度条共用 */
const PHASE_COLORS: Record<string, string> = {
  icmp: "#2563eb",
  dns: "#7c3aed",
  tcp: "#16a34a",
};

export function phaseColor(phase: string): string {
  return PHASE_COLORS[phase] ?? PHASE_COLORS.icmp ?? "#2563eb";
}

/** 当前片段；时间线为空或取不到时返回 null */
export function currentSegment(timeline: Timeline | null, cursorMs: number): Segment | null {
  if (!timeline || timeline.segments.length === 0) return null;
  return segmentAt(timeline, cursorMs) ?? null;
}

/** 当前片段序号，用作 selector：只有跨片段时组件才重渲染 */
export function segmentIndexAt(timeline: Timeline | null, cursorMs: number): number {
  return currentSegment(timeline, cursorMs)?.index ?? -1;
}

export interface DeviceVisit {
  seq: number;
  /** 正播到的那一次，角标里画实心 */
  active: boolean;
}

export interface TraceView {
  /** 到访过的设备 → 它的 decision 序号，如 路由器1 → [2, 4] */
  visits: Map<string, DeviceVisit[]>;
  walkedLinkIds: Set<string>;
  activeDeviceId: string | null;
  stoppedDeviceId: string | null;
  segment: Segment | null;
}

const EMPTY_VIEW: TraceView = {
  visits: new Map(),
  walkedLinkIds: new Set(),
  activeDeviceId: null,
  stoppedDeviceId: null,
  segment: null,
};

/** 播到 `index` 这一段为止，画布上该有的样子 */
export function traceView(timeline: Timeline | null, index: number): TraceView {
  if (!timeline || index < 0) return EMPTY_VIEW;
  const segment = timeline.segments[index] ?? null;
  const visits = new Map<string, DeviceVisit[]>();
  const walkedLinkIds = new Set<string>();
  let stoppedDeviceId: string | null = null;

  for (let i = 0; i <= index && i < timeline.segments.length; i += 1) {
    const item = timeline.segments[i];
    if (!item) continue;
    if (item.kind === "travel") {
      if (item.linkId) walkedLinkIds.add(item.linkId);
      continue;
    }
    const list = visits.get(item.deviceId) ?? [];
    if (!list.some((v) => v.seq === item.seq)) list.push({ seq: item.seq, active: false });
    visits.set(item.deviceId, list);
    if (item.style === "stop") stoppedDeviceId = item.deviceId;
  }

  const activeDeviceId = segment && segment.kind !== "travel" ? segment.deviceId : null;
  if (segment && activeDeviceId) {
    for (const visit of visits.get(activeDeviceId) ?? []) {
      visit.active = visit.seq === segment.seq;
    }
  }
  return { visits, walkedLinkIds, activeDeviceId, stoppedDeviceId, segment };
}
