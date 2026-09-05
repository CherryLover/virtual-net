import { Handle, Position } from "@xyflow/react";
import type { Port } from "../../engine";
import { VlanBadge } from "../handles/VlanBadge";

interface Props {
  ports: Port[];
  side: "top" | "bottom";
  /** 显示 VLAN 小字（交换机 portN、路由器 lanN） */
  showVlan?: boolean;
  /** 端口名太多时省略文字，只留柄 */
  compact?: boolean;
}

export function PortHandles({ ports, side, showVlan, compact }: Props) {
  const position = side === "top" ? Position.Top : Position.Bottom;
  return (
    <>
      {ports.map((port, index) => {
        const left = `${((index + 0.5) / ports.length) * 100}%`;
        return (
          <div key={port.id}>
            <Handle
              id={port.id}
              type="target"
              position={position}
              style={{ left }}
              data-port-name={port.name}
            />
            <Handle
              id={port.id}
              type="source"
              position={position}
              style={{ left }}
              data-port-name={port.name}
            />
            <span
              className={`port-label port-label-${side}${compact ? " port-label-compact" : ""}`}
              style={{ left }}
            >
              {port.name}
            </span>
            {showVlan ? <VlanBadge port={port} side={side} left={left} /> : null}
          </div>
        );
      })}
    </>
  );
}
