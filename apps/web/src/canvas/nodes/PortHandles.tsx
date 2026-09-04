import { Handle, Position } from "@xyflow/react";
import type { Port } from "../../engine";

interface Props {
  ports: Port[];
  side: "top" | "bottom";
}

export function PortHandles({ ports, side }: Props) {
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
            <span className={`port-label port-label-${side}`} style={{ left }}>
              {port.name}
            </span>
          </div>
        );
      })}
    </>
  );
}
