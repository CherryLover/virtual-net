import { useMemo, useState } from "react";
import type { Device, Runtime } from "../engine";
import { leaseOf } from "../engine";
import { useTopologyStore } from "../store";
import { DnsOptions, type DnsSelection, dnsServerError } from "./DnsOptions";
import { portValidator } from "./forms/serviceValidators";
import { ProxyOptions, type ProxySelection } from "./ProxyOptions";

const DEFAULT_DOMAIN = "www.google.com";
const PUBLIC_IP = "8.8.8.8";

interface Props {
  device: Device;
  runtime: Runtime;
}

/** 该设备的网关：电脑取静态网关或租约网关，路由器取 WAN 租约网关 */
function gatewayOf(device: Device, runtime: Runtime): string {
  if (device.type === "pc" || device.type === "server" || device.type === "proxy") {
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
  const runProbe = useTopologyStore((s) => s.runProbe);

  const domains = useMemo(
    () =>
      Array.from(
        new Set(
          topology.devices.flatMap((d) =>
            d.type === "internet"
              ? d.config.targets.filter((t) => !t.dnsServer).map((t) => t.domain)
              : d.type === "server"
                ? d.config.dnsService.records.map((r) => r.domain)
                : [],
          ),
        ),
      ),
    [topology.devices],
  );

  const [domain, setDomain] = useState<string | null>(null);
  const [targetIp, setTargetIp] = useState("");
  const [proxy, setProxy] = useState<ProxySelection>();
  const [port, setPort] = useState("443");
  const [dns, setDns] = useState<DnsSelection>({ server: "" });
  const portError = portValidator(port);
  const publicIp =
    topology.devices
      .flatMap((d) => (d.type === "internet" ? d.config.targets : []))
      .find((t) => t.dnsServer)?.ip ?? PUBLIC_IP;

  const chosenDomain =
    domain !== null
      ? domain.trim()
      : domains.includes(DEFAULT_DOMAIN)
        ? DEFAULT_DOMAIN
        : (domains[0] ?? "");

  const gateway = gatewayOf(device, runtime);

  const runPing = (ip: string) => {
    if (!ip) return;
    runProbe({ kind: "ping", sourceDeviceId: device.id, targetIp: ip });
  };

  const runTrace = (ip: string) => {
    if (!ip) return;
    runProbe({ kind: "traceroute", sourceDeviceId: device.id, targetIp: ip });
  };

  const runVisit = () => {
    if (!chosenDomain || portError) return;
    runProbe({
      kind: "visitSite",
      sourceDeviceId: device.id,
      domain: chosenDomain,
      port: Number(port),
      proxy,
    });
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
        <button type="button" className="btn" onClick={() => runPing(publicIp)}>
          ping 外网
        </button>
        <button type="button" className="btn" onClick={() => runTrace(publicIp)}>
          traceroute 外网
        </button>
      </div>

      {device.type === "pc" || device.type === "server" || device.type === "proxy" ? (
        <>
          <ProxyOptions
            sourceId={device.id}
            value={proxy}
            onChange={(next) => {
              if (next?.deviceId !== proxy?.deviceId || next?.protocol !== proxy?.protocol)
                setPort(next?.protocol === "http" ? "80" : "443");
              setProxy(next);
            }}
          />
          <div className="field">
            <label className="field-label" htmlFor={`quick-port-${device.id}`}>
              目标端口
            </label>
            <input
              id={`quick-port-${device.id}`}
              className={`field-input${portError ? " field-input-error" : ""}`}
              aria-invalid={Boolean(portError)}
              aria-describedby={portError ? `quick-port-error-${device.id}` : undefined}
              type="number"
              min={1}
              max={65535}
              value={port}
              onChange={(event) => setPort(event.target.value)}
            />
            {portError ? (
              <div id={`quick-port-error-${device.id}`} role="alert" className="field-error">
                {portError}
              </div>
            ) : null}
          </div>
          <div className="device-probe-actions">
            <button
              type="button"
              className="btn"
              disabled={!chosenDomain || Boolean(portError)}
              onClick={runVisit}
            >
              打开网站
            </button>
            <input
              className="field-input device-probe-select"
              aria-label="网站"
              value={domain ?? chosenDomain}
              list={`quick-domains-${device.id}`}
              onChange={(event) => setDomain(event.target.value)}
            />
            <datalist id={`quick-domains-${device.id}`}>
              {domains.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </div>
          <DnsOptions sourceId={device.id} value={dns} onChange={setDns} />
          <div className="device-probe-actions">
            <button
              type="button"
              className="btn"
              disabled={!chosenDomain || Boolean(dnsServerError(dns.server))}
              onClick={() =>
                runProbe({
                  kind: "dnsQuery",
                  sourceDeviceId: device.id,
                  domain: chosenDomain,
                  server: dns.server.trim() || undefined,
                  proxy: dns.proxy,
                })
              }
            >
              DNS 查询
            </button>
          </div>
        </>
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
    </div>
  );
}
