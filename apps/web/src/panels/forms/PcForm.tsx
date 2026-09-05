import type { PcDevice, Runtime } from "../../engine";
import { leaseOf } from "../../engine";
import { useTopologyStore } from "../../store";
import { Field } from "../Field";
import { ipValidator, maskValidator } from "../validators";

interface Props {
  device: PcDevice;
  runtime: Runtime;
  highlight: string | null;
}

function leaseText(runtime: Runtime, device: PcDevice, serverName: (id: string) => string): string {
  const lease = leaseOf(runtime, device.id, "eth0");
  if (!lease) return "未获取到地址";
  if (lease.status === "ok") {
    const from = lease.serverDeviceId ? `（来自 ${serverName(lease.serverDeviceId)}）` : "";
    return `已获取 ${lease.ip} / ${lease.mask}，网关 ${lease.gateway}，DNS ${lease.dns}${from}`;
  }
  if (lease.status === "no-link") return "获取失败：eth0 没有连线";
  if (lease.status === "pool-exhausted") return "获取失败：地址池已用完";
  return "获取失败：所在网段没有 DHCP 服务器";
}

export function PcForm({ device, runtime, highlight }: Props) {
  const updateDevice = useTopologyStore((s) => s.updateDevice);
  const devices = useTopologyStore((s) => s.topology.devices);
  const serverName = (id: string) => devices.find((d) => d.id === id)?.name ?? id;
  const dhcp = device.config.addressMode === "dhcp";

  const setConfig = (patch: Partial<PcDevice["config"]>) => {
    updateDevice(device.id, (d) =>
      d.type === "pc" ? { ...d, config: { ...d.config, ...patch } } : d,
    );
  };

  return (
    <div className="form">
      <div
        className={`field${highlight === "addressMode" ? " field-highlight" : ""}`}
        data-field="addressMode"
      >
        <div className="field-label">地址模式</div>
        <div className="field-radios">
          <label>
            <input
              type="radio"
              name="addressMode"
              checked={dhcp}
              onChange={() => setConfig({ addressMode: "dhcp" })}
            />
            自动获取
          </label>
          <label>
            <input
              type="radio"
              name="addressMode"
              checked={!dhcp}
              onChange={() => setConfig({ addressMode: "static" })}
            />
            手动
          </label>
        </div>
      </div>

      <Field
        label="IP"
        field="ip"
        value={device.config.ip}
        disabled={dhcp}
        highlight={highlight === "ip"}
        validate={ipValidator(true)}
        onCommit={(value) => setConfig({ ip: value.trim() })}
      />
      <Field
        label="子网掩码"
        field="mask"
        value={device.config.mask}
        disabled={dhcp}
        highlight={highlight === "mask"}
        validate={maskValidator(true)}
        onCommit={(value) => setConfig({ mask: value.trim() })}
      />
      <Field
        label="网关"
        field="gateway"
        value={device.config.gateway}
        disabled={dhcp}
        highlight={highlight === "gateway"}
        validate={ipValidator(false)}
        onCommit={(value) => setConfig({ gateway: value.trim() })}
      />
      <Field
        label="DNS"
        field="dns"
        value={device.config.dns}
        disabled={dhcp}
        highlight={highlight === "dns"}
        validate={ipValidator(false)}
        onCommit={(value) => setConfig({ dns: value.trim() })}
      />

      {dhcp ? <div className="lease-line">{leaseText(runtime, device, serverName)}</div> : null}
    </div>
  );
}
