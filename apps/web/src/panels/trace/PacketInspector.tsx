/** 包头查看（CP3 3.4）：进 / 出两列对照，变化的格子高亮 */
import { useEffect } from "react";
import type { PacketSummary } from "../../engine";
import { useTopologyStore, useTraceStore } from "../../store";
import { actionLabel, explain } from "../../trace/explain";
import type { PacketField } from "../../trace/packetDiff";
import { diffPacket, fieldValue } from "../../trace/packetDiff";
import { useTraceNames } from "../ProbeView";

interface Row {
  field: PacketField;
  label: string;
}

interface Section {
  title: string;
  rows: Row[];
}

const PROTO_LABEL: Record<string, string> = { icmp: "ICMP", tcp: "TCP", udp: "UDP" };
const ICMP_LABEL: Record<string, string> = { "echo-request": "请求", "echo-reply": "应答" };

function sectionsOf(packetIn: PacketSummary | null, packetOut: PacketSummary | null): Section[] {
  const sample = packetIn ?? packetOut;
  const l4: Row[] = [{ field: "proto", label: "协议" }];
  if (sample?.proto === "icmp") {
    l4.push({ field: "l4.icmpType", label: "类型" }, { field: "l4.icmpId", label: "id" });
  } else {
    l4.push({ field: "l4.srcPort", label: "源端口" }, { field: "l4.dstPort", label: "目的端口" });
  }
  const sections: Section[] = [
    {
      title: "二层",
      rows: [
        { field: "srcMac", label: "源 MAC" },
        { field: "dstMac", label: "目的 MAC" },
      ],
    },
    {
      title: "三层",
      rows: [
        { field: "srcIp", label: "源 IP" },
        { field: "dstIp", label: "目的 IP" },
        { field: "ttl", label: "TTL" },
      ],
    },
    { title: "四层", rows: l4 },
  ];
  // 两侧都没有 VLAN 标签时整区不显示
  if ((packetIn?.vlan ?? null) !== null || (packetOut?.vlan ?? null) !== null) {
    sections.push({ title: "VLAN", rows: [{ field: "vlan", label: "标签" }] });
  }
  return sections;
}

function format(field: PacketField, packet: PacketSummary | null): string {
  if (!packet) return "";
  const value = fieldValue(packet, field);
  if (value === undefined || value === null) return "—";
  if (field === "proto") return PROTO_LABEL[String(value)] ?? String(value);
  if (field === "l4.icmpType") return ICMP_LABEL[String(value)] ?? String(value);
  return String(value);
}

export function PacketInspector() {
  const seq = useTraceStore((s) => s.inspectorSeq);
  const timeline = useTraceStore((s) => s.timeline);
  const probe = useTopologyStore((s) => s.lastProbe);
  const names = useTraceNames();

  useEffect(() => {
    if (seq === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") useTraceStore.getState().closeInspector();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [seq]);

  if (seq === null || !probe) return null;
  const decision = probe.decisions.find((d) => d.seq === seq);
  if (!decision) return null;

  const { packetIn, packetOut } = decision;
  const changed = new Set(diffPacket(packetIn, packetOut));
  const sections = sectionsOf(packetIn, packetOut);
  const both = packetIn !== null && packetOut !== null;
  const renew = decision.action === "originate" && packetIn !== null;
  const { lines } = explain(decision, names, { dns: probe.dns });
  const seqs = timeline?.marks.map((m) => m.seq) ?? [];
  const at = seqs.indexOf(seq);

  return (
    <>
      <button
        type="button"
        className="pkt-backdrop"
        aria-label="关闭"
        onClick={() => useTraceStore.getState().closeInspector()}
      />
      <div className="pkt" role="dialog" aria-label="包头">
        <div className="pkt-head">
          <div className="pkt-title">
            第 {seq} 跳 · {names.device(decision.deviceId)} · {actionLabel(decision)}
          </div>
          <div className="pkt-nav">
            <button
              type="button"
              className="btn"
              disabled={at <= 0}
              onClick={() => useTraceStore.getState().stepInspector(-1)}
            >
              上一跳
            </button>
            <button
              type="button"
              className="btn"
              disabled={at < 0 || at >= seqs.length - 1}
              onClick={() => useTraceStore.getState().stepInspector(1)}
            >
              下一跳
            </button>
            <button
              type="button"
              className="pkt-close"
              aria-label="关闭"
              onClick={() => useTraceStore.getState().closeInspector()}
            >
              ✕
            </button>
          </div>
        </div>

        {renew ? <div className="pkt-renew">路由器以自己的地址重新发起查询</div> : null}

        <div className={`pkt-grid${both ? "" : " pkt-grid-single"}`}>
          <span className="pkt-col-label" />
          {packetIn ? <span className="pkt-col-label">进</span> : null}
          {packetOut ? <span className="pkt-col-label">出</span> : null}
          {sections.map((section) => (
            <div key={section.title} className="pkt-section" style={{ display: "contents" }}>
              <span className="pkt-section-title">{section.title}</span>
              <span className="pkt-section-title" />
              {both ? <span className="pkt-section-title" /> : null}
              {section.rows.map((row) => (
                <div key={row.field} style={{ display: "contents" }}>
                  <span className="pkt-label">{row.label}</span>
                  {packetIn ? (
                    <span
                      className={`pkt-value${changed.has(row.field) ? " pkt-changed" : ""}`}
                      data-field={row.field}
                      data-side="in"
                    >
                      {format(row.field, packetIn)}
                    </span>
                  ) : null}
                  {packetOut ? (
                    <span
                      className={`pkt-value${changed.has(row.field) ? " pkt-changed" : ""}`}
                      data-field={row.field}
                      data-side="out"
                    >
                      {format(row.field, packetOut)}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </div>

        {lines.length > 0 ? (
          <ul className="pkt-lines">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </>
  );
}
