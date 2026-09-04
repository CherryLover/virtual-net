import type { ReactNode } from "react";

interface Props {
  kind: "pc" | "router" | "internet";
  name: string;
  address?: string;
  errorCount: number;
  children?: ReactNode;
}

export function NodeShell({ kind, name, address, errorCount, children }: Props) {
  return (
    <div className={`device-node device-node-${kind}`} data-device-name={name}>
      {errorCount > 0 ? (
        <span className="device-node-badge" title="静态检查错误">
          {errorCount}
        </span>
      ) : null}
      <div className="device-node-name">{name}</div>
      {address !== undefined ? <div className="device-node-address">{address}</div> : null}
      {children}
    </div>
  );
}
