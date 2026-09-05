/** 逐跳时间线列表（CP3 3.3）：跟着播放高亮，点行跳时间线，展开看依据 */
import { useEffect, useRef, useState } from "react";
import { segmentIndexAt } from "../../canvas/trace/traceView";
import type { Decision, ProbeResult } from "../../engine";
import { useTraceStore } from "../../store";
import { actionLabel, explain } from "../../trace/explain";
import type { TraceNames } from "../../trace/names";
import { phaseLabel } from "../../trace/phaseLabel";
import type { FocusFn } from "../ProbeView";

interface Props {
  probe: ProbeResult;
  names: TraceNames;
  focus: FocusFn;
  /** 拓扑改过之后列表还能读，但不再驱动画布 */
  stale: boolean;
}

interface RowProps extends Props {
  decision: Decision;
  current: boolean;
}

function HopRow({ decision, current, probe, names, focus, stale }: RowProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  const { title, lines } = explain(decision, names, { dns: probe.dns });

  useEffect(() => {
    if (current) ref.current?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const className = [
    "hop",
    decision.verdict === "stop" ? "hop-stop" : "",
    current ? "hop-current" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li ref={ref}>
      <div className="hop-row">
        <button
          type="button"
          className="hop-expand"
          aria-label={open ? "收起" : "展开"}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "▾" : "▸"}
        </button>
        <button
          type="button"
          className={className}
          disabled={stale}
          onClick={() => useTraceStore.getState().seekSeq(decision.seq)}
        >
          <span className="hop-seq">{decision.seq}</span>
          <span className="hop-device">{names.device(decision.deviceId)}</span>
          <span className="hop-action">{actionLabel(decision)}</span>
          <span className="hop-note">{title}</span>
        </button>
        <button
          type="button"
          className="hop-inspect"
          onClick={() => useTraceStore.getState().openInspector(decision.seq)}
        >
          包头
        </button>
        <button
          type="button"
          className="hop-locate"
          title="定位到设备"
          onClick={() => focus(decision.deviceId)}
        >
          ⊙
        </button>
      </div>
      {open ? (
        <ul className="hop-lines">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function HopList(props: Props) {
  const { probe } = props;
  const currentSeq = useTraceStore((s) => {
    const index = segmentIndexAt(s.timeline, s.cursorMs);
    return index >= 0 ? (s.timeline?.segments[index]?.seq ?? null) : null;
  });

  const groups: { phase: Decision["phase"]; decisions: Decision[] }[] = [];
  for (const decision of probe.decisions) {
    const last = groups[groups.length - 1];
    if (last && last.phase === decision.phase) last.decisions.push(decision);
    else groups.push({ phase: decision.phase, decisions: [decision] });
  }

  return (
    <>
      {groups.map((group) => (
        <div key={`${group.phase}-${group.decisions[0]?.seq}`} className="hop-group">
          {groups.length > 1 ? (
            <div className="hop-group-title">{phaseLabel(group.phase)}</div>
          ) : null}
          <ul className="hop-list">
            {group.decisions.map((decision) => (
              <HopRow
                key={decision.seq}
                {...props}
                decision={decision}
                current={!props.stale && currentSeq === decision.seq}
              />
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}
