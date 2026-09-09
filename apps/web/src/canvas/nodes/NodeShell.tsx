import type { ReactNode } from "react";
import { DeviceIcon } from "../../icons";
import { useDisplayText } from "../../privacy/display";

interface Props {
  kind: string;
  name: string;
  address?: string;
  errorCount: number;
  width?: number;
  height?: number;
  children?: ReactNode;
}

export function NodeShell({ kind, name, address, errorCount, width, height, children }: Props) {
  const display = useDisplayText();
  return (
    <div
      className={`device-node device-node-${kind}`}
      data-device-name={display(name)}
      style={{ width, minHeight: height }}
    >
      {errorCount > 0 ? (
        <span className="device-node-badge" title="静态检查错误">
          {errorCount}
        </span>
      ) : null}
      <div className="device-node-name">
        <DeviceIcon type={kind} className="device-icon" />
        <span>{display(name)}</span>
      </div>
      {address !== undefined ? <div className="device-node-address">{display(address)}</div> : null}
      {children}
    </div>
  );
}
