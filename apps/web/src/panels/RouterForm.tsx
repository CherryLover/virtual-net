import type { RouterDevice, Runtime } from "../engine";
import { leaseOf } from "../engine";
import { useTopologyStore } from "../store";
import { Field, ReadonlyField, Toggle } from "./Field";
import { ipValidator, maskValidator, positiveNumberValidator } from "./validators";

interface Props {
  device: RouterDevice;
  runtime: Runtime;
  highlight: string | null;
}

function wanText(runtime: Runtime, device: RouterDevice): string {
  const lease = leaseOf(runtime, device.id, "wan");
  if (lease?.status === "ok") return `自动获取公网地址 · 已获取 ${lease.ip}`;
  if (lease?.status === "no-link") return "自动获取公网地址 · WAN 口没有连线";
  if (lease?.status === "pool-exhausted") return "自动获取公网地址 · 地址池已用完";
  return "自动获取公网地址 · 上游没有 DHCP 服务器";
}

export function RouterForm({ device, runtime, highlight }: Props) {
  const updateDevice = useTopologyStore((s) => s.updateDevice);
  const config = device.config;

  const patch = (updater: (c: RouterDevice["config"]) => RouterDevice["config"]) => {
    updateDevice(device.id, (d) => (d.type === "router" ? { ...d, config: updater(d.config) } : d));
  };

  return (
    <div className="form">
      <Field
        label="LAN IP"
        field="lan.ip"
        value={config.lan.ip}
        highlight={highlight === "lan.ip"}
        validate={ipValidator(true)}
        onCommit={(value) => patch((c) => ({ ...c, lan: { ...c.lan, ip: value.trim() } }))}
      />
      <Field
        label="LAN 子网掩码"
        field="lan.mask"
        value={config.lan.mask}
        highlight={highlight === "lan.mask"}
        validate={maskValidator(true)}
        onCommit={(value) => patch((c) => ({ ...c, lan: { ...c.lan, mask: value.trim() } }))}
      />

      <div className={`group${highlight === "dhcp" ? " field-highlight" : ""}`} data-field="dhcp">
        <Toggle
          label="DHCP"
          field="dhcp.enabled"
          checked={config.dhcp.enabled}
          onChange={(checked) => patch((c) => ({ ...c, dhcp: { ...c.dhcp, enabled: checked } }))}
        />
        <Field
          label="起始地址"
          field="dhcp.rangeStart"
          value={config.dhcp.rangeStart}
          disabled={!config.dhcp.enabled}
          validate={ipValidator(true)}
          onCommit={(value) =>
            patch((c) => ({ ...c, dhcp: { ...c.dhcp, rangeStart: value.trim() } }))
          }
        />
        <Field
          label="结束地址"
          field="dhcp.rangeEnd"
          value={config.dhcp.rangeEnd}
          disabled={!config.dhcp.enabled}
          validate={ipValidator(true)}
          onCommit={(value) =>
            patch((c) => ({ ...c, dhcp: { ...c.dhcp, rangeEnd: value.trim() } }))
          }
        />
        <Field
          label="租期（小时）"
          field="dhcp.leaseHours"
          value={String(config.dhcp.leaseHours)}
          disabled={!config.dhcp.enabled}
          validate={positiveNumberValidator}
          onCommit={(value) =>
            patch((c) => ({ ...c, dhcp: { ...c.dhcp, leaseHours: Number(value.trim()) } }))
          }
        />
      </div>

      <ReadonlyField
        label="WAN"
        field="wan"
        highlight={highlight === "wan"}
        value={wanText(runtime, device)}
      />

      <Toggle
        label="NAT"
        field="nat"
        checked={config.nat}
        highlight={highlight === "nat"}
        onChange={(checked) => patch((c) => ({ ...c, nat: checked }))}
      />
    </div>
  );
}
