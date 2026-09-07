import { useId } from "react";
import type { Runtime, Topology } from "../engine";
import { udpEchoInputError } from "../engine";
import { portValidator } from "./forms/serviceValidators";
import { ProxyOptions, type ProxySelection } from "./ProxyOptions";

export interface UdpEchoSelection {
  targetIp: string;
  port: string;
  payload: string;
  proxy?: ProxySelection;
}
export function defaultUdpSelection(
  topology: Topology,
  runtime: Runtime,
  sourceId: string,
): UdpEchoSelection {
  const server = topology.devices.find(
    (d) =>
      d.type === "server" &&
      d.id !== sourceId &&
      d.config.services.some((s) => s.protocol === "udp" && s.enabled),
  );
  const service =
    server?.type === "server"
      ? server.config.services.find((s) => s.protocol === "udp" && s.enabled)
      : undefined;
  return {
    targetIp: server
      ? (runtime.interfaces.find((i) => i.deviceId === server.id && i.name === "eth0")?.ip ?? "")
      : "",
    port: String(service?.port ?? 7),
    payload: "hello",
  };
}
export function udpSelectionError(value: UdpEchoSelection) {
  return (
    portValidator(value.port) ??
    udpEchoInputError(value.targetIp.trim(), Number(value.port), value.payload)
  );
}

export function UdpEchoOptions({
  sourceId,
  value,
  onChange,
}: {
  sourceId: string;
  value: UdpEchoSelection;
  onChange: (value: UdpEchoSelection) => void;
}) {
  const id = useId();
  const error = udpSelectionError(value);
  return (
    <div className="udp-echo-options">
      <div className="service-grid">
        <div className="field">
          <label className="field-label" htmlFor={`${id}-target`}>
            UDP 目标 IP
          </label>
          <input
            className="field-input"
            id={`${id}-target`}
            value={value.targetIp}
            onChange={(e) => onChange({ ...value, targetIp: e.target.value })}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-port`}>
            UDP 目标端口
          </label>
          <input
            className="field-input"
            id={`${id}-port`}
            type="number"
            min={1}
            max={65535}
            value={value.port}
            onChange={(e) => onChange({ ...value, port: e.target.value })}
          />
        </div>
      </div>
      <div className="field">
        <label className="field-label" htmlFor={`${id}-payload`}>
          测试内容
        </label>
        <input
          className="field-input"
          id={`${id}-payload`}
          value={value.payload}
          onChange={(e) => onChange({ ...value, payload: e.target.value })}
        />
      </div>
      {error ? (
        <div className="field-error" role="alert">
          {error}
        </div>
      ) : null}
      <ProxyOptions
        sourceId={sourceId}
        mode="udp"
        label="UDP 连接方式"
        value={value.proxy}
        onChange={(proxy) => onChange({ ...value, proxy })}
      />
    </div>
  );
}
