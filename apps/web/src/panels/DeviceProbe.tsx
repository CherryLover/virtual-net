import { useMemo, useState } from "react";
import type { Device, Runtime } from "../engine";
import { leaseOf, ping, visitSite } from "../engine";
import { useTopologyStore } from "../store";
import { ProbeView, useDeviceFocus, useDeviceName } from "./ProbeView";

const DEFAULT_DOMAIN = "www.google.com";
const PUBLIC_IP = "8.8.8.8";

interface Props {
  device: Device;
  runtime: Runtime;
}

/** 该设备的网关：电脑取静态网关或租约网关，路由器取 WAN 租约网关 */
function gatewayOf(device: Device, runtime: Runtime): string {
  if (device.type === "pc") {
    if (device.config.addressMode === "static") return device.config.gateway.trim();
    const lease = leaseOf(runtime, device.id, "eth0");
    return lease?.status === "ok" ? lease.gateway : "";
  }
  if (device.type === "router") {
    const lease = leaseOf(runtime, device.id, "wan");
    return lease?.status === "ok" ? lease.gateway : "";
  }
  return "";
}

export function DeviceProbe({ device, runtime }: Props) {
  const topology = useTopologyStore((s) => s.topology);
  const setProbe = useTopologyStore((s) => s.setProbe);
  const lastProbe = useTopologyStore((s) => s.lastProbe);
  const focus = useDeviceFocus();
  const nameOf = useDeviceName();

  const domains = useMemo(
    () =>
      topology.devices
        .flatMap((d) => (d.type === "internet" ? d.config.targets : []))
        .filter((t) => !t.dnsServer)
        .map((t) => t.domain),
    [topology.devices],
  );

  const [domain, setDomain] = useState("");
  const [targetIp, setTargetIp] = useState("");

  const chosenDomain =
    domain && domains.includes(domain)
      ? domain
      : domains.includes(DEFAULT_DOMAIN)
        ? DEFAULT_DOMAIN
        : (domains[0] ?? "");

  const gateway = gatewayOf(device, runtime);
  const result = lastProbe && lastProbe.path[0] === device.id ? lastProbe : null;

  const runPing = (ip: string) => {
    if (!ip) return;
    setProbe(ping(topology, { sourceDeviceId: device.id, targetIp: ip }));
  };

  const runVisit = () => {
    if (!chosenDomain) return;
    setProbe(visitSite(topology, { sourceDeviceId: device.id, domain: chosenDomain }));
  };

  return (
    <div className="device-probe">
      <div className="device-probe-title">验证</div>
      <div className="device-probe-actions">
        <button
          type="button"
          className="btn"
          disabled={!gateway}
          title={gateway ? `ping ${gateway}` : "没有网关"}
          onClick={() => runPing(gateway)}
        >
          ping 网关
        </button>
        <button type="button" className="btn" onClick={() => runPing(PUBLIC_IP)}>
          ping 外网
        </button>
      </div>

      {device.type === "pc" ? (
        <div className="device-probe-actions">
          <button type="button" className="btn" disabled={!chosenDomain} onClick={runVisit}>
            打开网站
          </button>
          <select
            className="field-input device-probe-select"
            aria-label="网站"
            value={chosenDomain}
            onChange={(event) => setDomain(event.target.value)}
          >
            {domains.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="device-probe-actions">
        <input
          className="field-input device-probe-input"
          aria-label="目标地址"
          placeholder="目标 IP"
          value={targetIp}
          onChange={(event) => setTargetIp(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") runPing(targetIp.trim());
          }}
        />
        <button
          type="button"
          className="btn"
          disabled={!targetIp.trim()}
          onClick={() => runPing(targetIp.trim())}
        >
          ping
        </button>
      </div>

      {result ? <ProbeView probe={result} nameOf={nameOf} focus={focus} /> : null}
    </div>
  );
}
