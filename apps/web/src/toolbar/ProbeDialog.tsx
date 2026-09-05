import { useMemo, useState } from "react";
import { leaseOf, ping, visitSite } from "../engine";
import { useTopologyStore } from "../store";
import "./probe-dialog.css";

interface Props {
  onClose: () => void;
}

export function ProbeDialog({ onClose }: Props) {
  const topology = useTopologyStore((s) => s.topology);
  const runtime = useTopologyStore((s) => s.runtime);
  const setProbe = useTopologyStore((s) => s.setProbe);
  const select = useTopologyStore((s) => s.select);

  const sources = useMemo(
    () => topology.devices.filter((d) => d.type === "pc" || d.type === "router"),
    [topology.devices],
  );
  const domains = useMemo(
    () =>
      topology.devices
        .flatMap((d) => (d.type === "internet" ? d.config.targets : []))
        .map((t) => t.domain),
    [topology.devices],
  );

  const suggestions = useMemo(() => {
    const list: { label: string; ip: string }[] = [];
    for (const device of topology.devices) {
      if (device.type === "pc") {
        const lease = leaseOf(runtime, device.id, "eth0");
        const ip = device.config.addressMode === "dhcp" ? lease?.ip : device.config.ip;
        if (ip) list.push({ label: `${device.name} ${ip}`, ip });
      }
      if (device.type === "router") {
        list.push({
          label: `${device.name} LAN ${device.config.lan.ip}`,
          ip: device.config.lan.ip,
        });
        for (const vlan of device.config.vlans ?? []) {
          if (vlan.ip)
            list.push({ label: `${device.name} VLAN ${vlan.id} ${vlan.ip}`, ip: vlan.ip });
        }
        const wan = leaseOf(runtime, device.id, "wan");
        if (wan?.ip) list.push({ label: `${device.name} WAN ${wan.ip}`, ip: wan.ip });
      }
      if (device.type === "modem" && device.config.mode === "route") {
        list.push({
          label: `${device.name} LAN ${device.config.lan.ip}`,
          ip: device.config.lan.ip,
        });
        const wan = leaseOf(runtime, device.id, "wan");
        if (wan?.ip) list.push({ label: `${device.name} WAN ${wan.ip}`, ip: wan.ip });
      }
      if (device.type === "internet") {
        for (const target of device.config.targets) {
          list.push({ label: `${target.domain} ${target.ip}`, ip: target.ip });
        }
      }
    }
    return list;
  }, [topology.devices, runtime]);

  const [kind, setKind] = useState<"ping" | "visitSite">("ping");
  const [source, setSource] = useState(sources[0]?.id ?? "");
  const [targetIp, setTargetIp] = useState("");
  const [domain, setDomain] = useState(domains[0] ?? "");

  const run = () => {
    if (!source) return;
    const result =
      kind === "ping"
        ? ping(topology, { sourceDeviceId: source, targetIp: targetIp.trim() })
        : visitSite(topology, { sourceDeviceId: source, domain });
    setProbe(result);
    select({ kind: "none" });
    onClose();
  };

  return (
    <>
      <button type="button" className="probe-backdrop" aria-label="关闭" onClick={onClose} />
      <div className="probe-dialog" role="dialog" aria-label="验证">
        <div className="field">
          <div className="field-label">类型</div>
          <div className="field-radios">
            <label>
              <input
                type="radio"
                name="probeKind"
                checked={kind === "ping"}
                onChange={() => setKind("ping")}
              />
              ping
            </label>
            <label>
              <input
                type="radio"
                name="probeKind"
                checked={kind === "visitSite"}
                onChange={() => setKind("visitSite")}
              />
              访问网站
            </label>
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="probe-source">
            起点
          </label>
          <select
            id="probe-source"
            className="field-input"
            value={source}
            onChange={(event) => setSource(event.target.value)}
          >
            {sources.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>
        </div>

        {kind === "ping" ? (
          <div className="field">
            <label className="field-label" htmlFor="probe-target">
              目标
            </label>
            <input
              id="probe-target"
              className="field-input"
              value={targetIp}
              onChange={(event) => setTargetIp(event.target.value)}
            />
            <div className="probe-suggestions">
              {suggestions.map((item) => (
                <button
                  key={`${item.label}-${item.ip}`}
                  type="button"
                  className="probe-suggestion"
                  onClick={() => setTargetIp(item.ip)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="field">
            <label className="field-label" htmlFor="probe-domain">
              目标
            </label>
            <select
              id="probe-domain"
              className="field-input"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
            >
              {domains.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        )}

        <button type="button" className="btn btn-primary probe-run" onClick={run}>
          运行
        </button>
      </div>
    </>
  );
}
