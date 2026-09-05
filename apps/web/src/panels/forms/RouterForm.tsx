import type {
  DhcpConfig,
  RouterDevice,
  RouterVlan,
  RouterWanMode,
  Runtime,
  Topology,
} from "../../engine";
import { addRouterVlan, removeRouterVlan } from "../../engine";
import { useTopologyStore } from "../../store";
import { Field, ReadonlyField, Toggle } from "../Field";
import { ipValidator, maskValidator, positiveNumberValidator } from "../validators";
import { PortVlanTable } from "./PortVlanTable";
import { wanStatusText } from "./wanStatus";

interface Props {
  device: RouterDevice;
  runtime: Runtime;
  highlight: string | null;
  highlightPortId: string | null;
}

const WAN_MODES: { value: RouterWanMode; label: string }[] = [
  { value: "dhcp", label: "自动获取" },
  { value: "pppoe", label: "拨号" },
  { value: "static", label: "手动" },
];

export function RouterForm({ device, runtime, highlight, highlightPortId }: Props) {
  const updateDevice = useTopologyStore((s) => s.updateDevice);
  const runOp = useTopologyStore((s) => s.runOp);
  const config = device.config;
  const vlans = config.vlans ?? [];
  const pppoe = config.wan.pppoe ?? { username: "", password: "" };
  const staticWan = config.wan.static ?? { ip: "", mask: "", gateway: "", dns: "" };

  const patch = (updater: (c: RouterDevice["config"]) => RouterDevice["config"]) => {
    updateDevice(device.id, (d) => (d.type === "router" ? { ...d, config: updater(d.config) } : d));
  };

  const patchVlan = (id: number, updater: (v: RouterVlan) => RouterVlan) => {
    patch((c) => ({
      ...c,
      vlans: (c.vlans ?? []).map((v) => (v.id === id ? updater(v) : v)),
    }));
  };

  return (
    <div className="form">
      <div
        className={`field${highlight === "wan.mode" ? " field-highlight" : ""}`}
        data-field="wan.mode"
      >
        <label className="field-label" htmlFor={`router-wan-${device.id}`}>
          WAN 模式
        </label>
        <select
          id={`router-wan-${device.id}`}
          className="field-input"
          value={config.wan.mode}
          onChange={(event) =>
            patch((c) => ({ ...c, wan: { ...c.wan, mode: event.target.value as RouterWanMode } }))
          }
        >
          {WAN_MODES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      {config.wan.mode === "pppoe" ? (
        <>
          <Field
            label="账号"
            field="wan.pppoe.username"
            value={pppoe.username}
            validate={(value) => (value.trim() ? null : "必填")}
            onCommit={(value) =>
              patch((c) => ({
                ...c,
                wan: { ...c.wan, pppoe: { ...pppoe, username: value.trim() } },
              }))
            }
          />
          <Field
            label="密码"
            field="wan.pppoe.password"
            value={pppoe.password}
            onCommit={(value) =>
              patch((c) => ({ ...c, wan: { ...c.wan, pppoe: { ...pppoe, password: value } } }))
            }
          />
        </>
      ) : null}

      {config.wan.mode === "static" ? (
        <>
          <Field
            label="WAN IP"
            field="wan.static.ip"
            value={staticWan.ip}
            validate={ipValidator(true)}
            onCommit={(value) =>
              patch((c) => ({
                ...c,
                wan: { ...c.wan, static: { ...staticWan, ip: value.trim() } },
              }))
            }
          />
          <Field
            label="WAN 子网掩码"
            field="wan.static.mask"
            value={staticWan.mask}
            validate={maskValidator(true)}
            onCommit={(value) =>
              patch((c) => ({
                ...c,
                wan: { ...c.wan, static: { ...staticWan, mask: value.trim() } },
              }))
            }
          />
          <Field
            label="WAN 网关"
            field="wan.static.gateway"
            value={staticWan.gateway}
            validate={ipValidator(true)}
            onCommit={(value) =>
              patch((c) => ({
                ...c,
                wan: { ...c.wan, static: { ...staticWan, gateway: value.trim() } },
              }))
            }
          />
          <Field
            label="WAN DNS"
            field="wan.static.dns"
            value={staticWan.dns}
            validate={ipValidator(true)}
            onCommit={(value) =>
              patch((c) => ({
                ...c,
                wan: { ...c.wan, static: { ...staticWan, dns: value.trim() } },
              }))
            }
          />
        </>
      ) : null}

      <ReadonlyField
        label="WAN 状态"
        field="wan"
        highlight={highlight === "wan"}
        value={wanStatusText(runtime, device)}
      />

      <div className="field" data-field="vlans">
        <div className="port-table-head">
          <div className="field-label">VLAN</div>
          <button
            type="button"
            className="btn"
            onClick={() => runOp((draft) => addVlanTo(draft, device.id))}
          >
            添加 VLAN
          </button>
        </div>

        <VlanRow
          label="VLAN 1"
          highlight={highlight}
          fieldPrefix=""
          ip={config.lan.ip}
          mask={config.lan.mask}
          dhcp={config.dhcp}
          onIp={(value) => patch((c) => ({ ...c, lan: { ...c.lan, ip: value } }))}
          onMask={(value) => patch((c) => ({ ...c, lan: { ...c.lan, mask: value } }))}
          onDhcp={(next) => patch((c) => ({ ...c, dhcp: next }))}
        />

        {vlans.map((vlan) => (
          <VlanRow
            key={vlan.id}
            label={`VLAN ${vlan.id}`}
            highlight={highlight}
            fieldPrefix={`vlans.${vlan.id}.`}
            id={vlan.id}
            validateId={(value) => vlanIdError(value, vlan.id, vlans)}
            onIdCommit={(value) =>
              patch((c) => ({
                ...c,
                vlans: (c.vlans ?? []).map((v) =>
                  v.id === vlan.id ? renumber(v, Number(value.trim())) : v,
                ),
              }))
            }
            ip={vlan.ip}
            mask={vlan.mask}
            dhcp={vlan.dhcp}
            onIp={(value) => patchVlan(vlan.id, (v) => ({ ...v, ip: value }))}
            onMask={(value) => patchVlan(vlan.id, (v) => ({ ...v, mask: value }))}
            onDhcp={(next) => patchVlan(vlan.id, (v) => ({ ...v, dhcp: next }))}
            onRemove={() => runOp((draft) => removeVlanFrom(draft, device.id, vlan.id))}
          />
        ))}
      </div>

      <div className="field" data-field="lanPorts">
        <div className="field-label">LAN 口</div>
        <PortVlanTable device={device} highlightPortId={highlightPortId} />
      </div>

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

function routerIn(draft: Topology, deviceId: string): RouterDevice | null {
  const device = draft.devices.find((d) => d.id === deviceId);
  return device?.type === "router" ? device : null;
}

function addVlanTo(draft: Topology, deviceId: string) {
  const router = routerIn(draft, deviceId);
  if (!router) return { ok: false as const, message: "不是路由器" };
  return addRouterVlan(router);
}

function removeVlanFrom(draft: Topology, deviceId: string, id: number) {
  const router = routerIn(draft, deviceId);
  if (!router) return { ok: false as const, message: "不是路由器" };
  return removeRouterVlan(router, id);
}

/** VLAN 号：2–4094 的整数，不能和已有的重号 */
function vlanIdError(text: string, current: number, all: RouterVlan[]): string | null {
  const value = text.trim();
  if (!value) return "必填";
  if (!/^\d+$/.test(value)) return "只能填数字";
  const id = Number(value);
  if (id < 2 || id > 4094) return "只能是 2–4094";
  if (id !== current && all.some((v) => v.id === id)) return `VLAN ${id} 已存在`;
  return null;
}

/** 与引擎 `nextRouterVlan` 同一套默认值：`192.168.{id}.1/24`，池 `.100`–`.199` */
function defaultVlan(id: number): RouterVlan {
  const seg = id % 256;
  return {
    id,
    ip: `192.168.${seg}.1`,
    mask: "255.255.255.0",
    dhcp: {
      enabled: true,
      rangeStart: `192.168.${seg}.100`,
      rangeEnd: `192.168.${seg}.199`,
      leaseHours: 24,
    },
  };
}

/** 改 VLAN 号：网段还是这个号的默认值就跟着走，用户改过的原样保留 */
function renumber(vlan: RouterVlan, id: number): RouterVlan {
  const before = defaultVlan(vlan.id);
  const untouched =
    vlan.ip === before.ip &&
    vlan.mask === before.mask &&
    vlan.dhcp.rangeStart === before.dhcp.rangeStart &&
    vlan.dhcp.rangeEnd === before.dhcp.rangeEnd;
  if (!untouched) return { ...vlan, id };
  const after = defaultVlan(id);
  return {
    ...after,
    dhcp: { ...after.dhcp, enabled: vlan.dhcp.enabled, leaseHours: vlan.dhcp.leaseHours },
  };
}

interface VlanRowProps {
  label: string;
  highlight: string | null;
  fieldPrefix: string;
  /** 可改号的 VLAN 行传这三个，VLAN 1 不传 */
  id?: number;
  validateId?: (value: string) => string | null;
  onIdCommit?: (value: string) => void;
  ip: string;
  mask: string;
  dhcp: DhcpConfig;
  onIp: (value: string) => void;
  onMask: (value: string) => void;
  onDhcp: (dhcp: DhcpConfig) => void;
  onRemove?: () => void;
}

function VlanRow({
  label,
  highlight,
  fieldPrefix,
  id,
  validateId,
  onIdCommit,
  ip,
  mask,
  dhcp,
  onIp,
  onMask,
  onDhcp,
  onRemove,
}: VlanRowProps) {
  const ipField = fieldPrefix ? `${fieldPrefix}ip` : "lan.ip";
  const maskField = fieldPrefix ? `${fieldPrefix}mask` : "lan.mask";
  const dhcpField = fieldPrefix ? `${fieldPrefix}dhcp` : "dhcp";
  const hit = highlight === ipField || highlight === maskField || highlight === dhcpField;
  return (
    <div className={`group${hit ? " field-highlight" : ""}`} data-vlan={label}>
      <div className="port-table-head">
        <div className="field-label">{label}</div>
        {onRemove ? (
          <button type="button" className="btn" onClick={onRemove}>
            删除
          </button>
        ) : null}
      </div>
      {id !== undefined && validateId && onIdCommit ? (
        <Field
          label="VLAN 号"
          field={`${fieldPrefix}id`}
          value={String(id)}
          validate={validateId}
          onCommit={onIdCommit}
        />
      ) : null}
      <Field
        label="IP"
        field={ipField}
        value={ip}
        validate={ipValidator(true)}
        onCommit={(value) => onIp(value.trim())}
      />
      <Field
        label="子网掩码"
        field={maskField}
        value={mask}
        validate={maskValidator(true)}
        onCommit={(value) => onMask(value.trim())}
      />
      <Toggle
        label="DHCP"
        field={`${dhcpField}.enabled`}
        checked={dhcp.enabled}
        onChange={(checked) => onDhcp({ ...dhcp, enabled: checked })}
      />
      <Field
        label="起始地址"
        field={`${dhcpField}.rangeStart`}
        value={dhcp.rangeStart}
        disabled={!dhcp.enabled}
        validate={ipValidator(true)}
        onCommit={(value) => onDhcp({ ...dhcp, rangeStart: value.trim() })}
      />
      <Field
        label="结束地址"
        field={`${dhcpField}.rangeEnd`}
        value={dhcp.rangeEnd}
        disabled={!dhcp.enabled}
        validate={ipValidator(true)}
        onCommit={(value) => onDhcp({ ...dhcp, rangeEnd: value.trim() })}
      />
      <Field
        label="租期（小时）"
        field={`${dhcpField}.leaseHours`}
        value={String(dhcp.leaseHours)}
        disabled={!dhcp.enabled}
        validate={positiveNumberValidator}
        onCommit={(value) => onDhcp({ ...dhcp, leaseHours: Number(value.trim()) })}
      />
    </div>
  );
}
