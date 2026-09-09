import { Handle, Position } from "@xyflow/react";
import { useState } from "react";
import type { Port } from "../../engine";
import { useDisplayText } from "../../privacy/display";
import { useTopologyStore } from "../../store";
import { VlanBadge } from "../handles/VlanBadge";

interface Props {
  ports: Port[];
  side: "top" | "bottom" | "left" | "right";
  deviceId?: string;
  /** 显示 VLAN 小字（交换机 portN、路由器 lanN） */
  showVlan?: boolean;
  /** 端口名太多时省略文字，只留柄 */
  compact?: boolean;
}

export function PortHandles({ ports, side, showVlan, compact, deviceId }: Props) {
  const display = useDisplayText();
  const [menuPort, setMenuPort] = useState<string | null>(null);
  const position = {
    top: Position.Top,
    bottom: Position.Bottom,
    left: Position.Left,
    right: Position.Right,
  }[side];
  const vertical = side === "left" || side === "right";
  return (
    <>
      {ports.map((port, index) => {
        const left = `${((index + 0.5) / ports.length) * 100}%`;
        const placement = vertical ? { top: left } : { left };
        const title = `${port.name} · ${port.linkId ? "已连接" : "空闲"}${port.vlan ? ` · ${port.vlan.mode === "access" ? `VLAN ${port.vlan.pvid}` : `Trunk ${port.vlan.allowed.join(",")}`}` : ""}`;
        return (
          <div key={port.id}>
            <Handle
              id={port.id}
              type="target"
              position={position}
              style={placement}
              title={display(title)}
              className={port.linkId ? "port-connected" : ""}
              data-port-name={display(port.name)}
            />
            <Handle
              id={port.id}
              type="source"
              position={position}
              style={placement}
              title={display(title)}
              className={port.linkId ? "port-connected" : ""}
              onContextMenu={(event) => {
                if (deviceId) {
                  event.preventDefault();
                  event.stopPropagation();
                  setMenuPort(port.id);
                }
              }}
              data-port-name={display(port.name)}
            />
            <span
              className={`port-label port-label-${side}${compact ? " port-label-compact" : ""}`}
              style={placement}
            >
              {display(compact ? port.name.replace(/^port/, "") : port.name)}
            </span>
            {showVlan && (vertical || ports.length <= 24) ? (
              <VlanBadge port={port} side={side} left={left} />
            ) : null}
            {menuPort === port.id && deviceId ? (
              <select
                ref={(element) => element?.focus()}
                className="port-side-menu nodrag nopan"
                aria-label={`${display(port.name)} 显示方向`}
                value={port.displaySide ?? "auto"}
                style={placement}
                onBlur={() => setMenuPort(null)}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Escape") setMenuPort(null);
                }}
                onChange={(event) => {
                  useTopologyStore
                    .getState()
                    .setPortSide(
                      deviceId,
                      port.id,
                      event.target.value === "auto"
                        ? undefined
                        : (event.target.value as Port["displaySide"]),
                    );
                  setMenuPort(null);
                }}
              >
                <option value="auto">自动</option>
                <option value="top">上侧</option>
                <option value="bottom">下侧</option>
                <option value="left">左侧</option>
                <option value="right">右侧</option>
              </select>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
