/** 画布上唯一的那个包（CP3 3.1）。位置每帧算一次，直接写 DOM，不走重渲染 */
import { useReactFlow } from "@xyflow/react";
import { useEffect, useRef } from "react";
import { useTopologyStore, useTraceStore } from "../../store";
import { packetPoint } from "./geometry";
import { currentSegment, phaseColor, segmentIndexAt } from "./traceView";

const warned = new Set<string>();

/** 4.3 兜底：decision 里的设备 / 连线在画布上找不到，撤掉标记并作废，不抛异常 */
function reportMissing(segment: { deviceId: string; linkId?: string | null }): void {
  const topology = useTopologyStore.getState().topology;
  const deviceGone = !topology.devices.some((d) => d.id === segment.deviceId);
  const linkGone = Boolean(segment.linkId) && !topology.links.some((l) => l.id === segment.linkId);
  if (!deviceGone && !linkGone) return; // 只是这一帧还没渲染出来，下一帧再说
  const key = `${segment.deviceId}/${segment.linkId ?? ""}`;
  if (!warned.has(key)) {
    warned.add(key);
    console.warn("[trace] 画布上找不到这一跳的设备或连线，动画已作废", segment);
  }
  useTraceStore.getState().markStale();
}

export function PacketMarker() {
  const ref = useRef<HTMLButtonElement>(null);
  const flow = useReactFlow();
  const timeline = useTraceStore((s) => s.timeline);
  const stale = useTraceStore((s) => s.stale);
  const index = useTraceStore((s) => segmentIndexAt(s.timeline, s.cursorMs));
  const live = timeline !== null && !stale;
  const segment = live && index >= 0 ? (timeline?.segments[index] ?? null) : null;

  useEffect(() => {
    if (!live) return;
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const el = ref.current;
      if (!el) return;
      const state = useTraceStore.getState();
      const now = currentSegment(state.timeline, state.cursorMs);
      if (!now) return;
      const point = packetPoint(flow, now, state.cursorMs);
      if (!point) {
        el.style.visibility = "hidden";
        reportMissing(now);
        return;
      }
      el.style.visibility = "visible";
      el.style.left = `${point.x}px`;
      el.style.top = `${point.y}px`;
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [live, flow]);

  if (!segment) return null;

  const className = [
    "trace-packet",
    segment.style === "stop" ? "trace-packet-stop" : "",
    segment.style === "renew" ? "trace-packet-renew" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      ref={ref}
      className={`${className} nopan nodrag`}
      style={{ background: segment.style === "stop" ? undefined : phaseColor(segment.phase) }}
      title={`第 ${segment.seq} 跳 · 查看包头`}
      onClick={() => useTraceStore.getState().openInspector(segment.seq)}
    >
      {segment.seq}
    </button>
  );
}
