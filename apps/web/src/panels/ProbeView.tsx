import { useReactFlow } from "@xyflow/react";
import { useCallback, useMemo } from "react";
import type { ProbeResult } from "../engine";
import { useTopologyStore, useTraceStore } from "../store";
import type { TraceNames } from "../trace/names";
import { createNames, namesFromSnapshot, RAW_NAMES } from "../trace/names";
import { HopList } from "./trace/HopList";
import { HopTable } from "./trace/HopTable";
import { StaleBanner } from "./trace/StaleBanner";

export type FocusFn = (deviceId: string, field?: string, portId?: string) => void;

/** 选中某台设备、居中画布、可选高亮字段或端口表某一行 */
export function useDeviceFocus(): FocusFn {
  const select = useTopologyStore((s) => s.select);
  const { setCenter, getNode } = useReactFlow();
  return useCallback(
    (deviceId: string, field?: string, portId?: string) => {
      select({ kind: "device", id: deviceId }, field ?? null, portId ?? null);
      const node = getNode(deviceId);
      if (node) {
        void setCenter(node.position.x + 70, node.position.y + 28, { zoom: 1, duration: 200 });
      }
    },
    [select, setCenter, getNode],
  );
}

/**
 * 名字查询。先查当前拓扑，查不到再回落到建时间线那一刻的快照，
 * 这样设备被删掉之后逐跳列表也还显示得出名字（CP3 4.2）。
 */
export function useTraceNames(): TraceNames {
  const topology = useTopologyStore((s) => s.topology);
  const snapshot = useTraceStore((s) => s.snapshot);
  return useMemo(() => {
    const live = createNames(topology);
    const before = snapshot ? namesFromSnapshot(snapshot) : RAW_NAMES;
    return {
      device: (id) => {
        const name = live.device(id);
        return name === id ? before.device(id) : name;
      },
      port: (id) => {
        const name = live.port(id);
        return name === id ? before.port(id) : name;
      },
    };
  }, [topology, snapshot]);
}

/** 设备名查询：拓扑里找不到时退回快照，再找不到退回 id */
export function useDeviceName(): (id: string) => string {
  return useTraceNames().device;
}

interface ProbeViewProps {
  probe: ProbeResult;
  focus: FocusFn;
}

/** 一次验证的结果：结论、原因、路径、定位、跳数表、逐跳时间线 */
export function ProbeView({ probe, focus }: ProbeViewProps) {
  const names = useTraceNames();
  const stale = useTraceStore((s) => s.stale);
  const seek = useTraceStore((s) => s.seekSeq);
  const connectionLabels: Record<string, string> = {
    direct: "直接连接",
    "client-proxy": "连接代理",
    "proxy-auth": "代理身份验证",
    "client-dns": "客户端解析",
    "proxy-dns": "代理端解析",
    "proxy-target": "代理连接目标",
    "proxy-response": "返回客户端",
    "proxy-associate": "建立 UDP 关联",
    "client-relay": "发送到 UDP 中继",
    "relay-dns": "中继查询 DNS",
    "relay-response": "UDP 返回客户端",
  };

  return (
    <div className={`probe${stale ? " probe-stale" : ""}`}>
      <StaleBanner />
      <div className={`probe-summary probe-${probe.verdict}`}>{probe.summary}</div>
      {probe.routingNote ? <div className="lease-line">{probe.routingNote}</div> : null}
      {probe.reason ? <div className="probe-reason">{probe.reason}</div> : null}
      {probe.dns ? (
        <div className="probe-dns">
          DNS {probe.dns.server} 解析 {probe.dns.domain} → {probe.dns.ip}
          {probe.dns.rewritten ? (
            <div>
              已改写 · 原始 {probe.dns.originalIp ?? "无记录"} ·{" "}
              {probe.dns.rewrittenBy?.map(names.device).join(" → ")}
            </div>
          ) : null}
        </div>
      ) : null}
      {!probe.connections?.some((connection) => connection.role === "client-proxy") ? (
        <div className="probe-path">{probe.path.map(names.device).join(" → ")}</div>
      ) : null}
      {probe.connections?.length ? (
        <ol className="connection-list" aria-label="连接过程">
          {probe.connections.map((connection) => (
            <li key={connection.id} className={`connection-${connection.verdict}`}>
              <button
                type="button"
                className="btn connection-step"
                disabled={stale}
                onClick={() => seek(connection.startSeq)}
              >
                <span>{connectionLabels[connection.role] ?? connection.role}</span>
                <span className="connection-verdict">
                  {connection.verdict === "ok" ? "通过" : "失败"}
                </span>
              </button>
              <small>
                {names.device(connection.sourceDeviceId)} → {names.device(connection.target)}
              </small>
            </li>
          ))}
        </ol>
      ) : null}
      {probe.fixAt || probe.stoppedAt ? (
        <button
          type="button"
          className="probe-locate"
          onClick={() => {
            const fix = probe.fixAt;
            if (fix) focus(fix.deviceId, fix.field, fix.portId);
            else if (probe.stoppedAt) focus(probe.stoppedAt);
          }}
        >
          定位
        </button>
      ) : null}
      {probe.hops ? <HopTable hops={probe.hops} names={names} stale={stale} /> : null}
      <HopList probe={probe} names={names} focus={focus} stale={stale} />
    </div>
  );
}
