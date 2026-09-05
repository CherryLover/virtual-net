import type { ModemDevice, ModemWanMode, Runtime } from "../../engine";
import { useTopologyStore } from "../../store";
import { Field, ReadonlyField, Toggle } from "../Field";
import { ipValidator, maskValidator, positiveNumberValidator } from "../validators";
import { wanStatusText } from "./wanStatus";

interface Props {
  device: ModemDevice;
  runtime: Runtime;
  highlight: string | null;
}

const WAN_MODES: { value: ModemWanMode; label: string }[] = [
  { value: "auto", label: "跟随上游" },
  { value: "dhcp", label: "自动获取" },
  { value: "pppoe", label: "拨号" },
];

export function ModemForm({ device, runtime, highlight }: Props) {
  const updateDevice = useTopologyStore((s) => s.updateDevice);
  const config = device.config;

  const patch = (updater: (c: ModemDevice["config"]) => ModemDevice["config"]) => {
    updateDevice(device.id, (d) => (d.type === "modem" ? { ...d, config: updater(d.config) } : d));
  };

  const pppoe = config.wan.pppoe ?? { username: "", password: "" };

  return (
    <div className="form">
      <div className={`field${highlight === "mode" ? " field-highlight" : ""}`} data-field="mode">
        <div className="field-label">模式</div>
        <div className="segmented">
          <button
            type="button"
            className={`segment${config.mode === "bridge" ? " segment-on" : ""}`}
            onClick={() => patch((c) => ({ ...c, mode: "bridge" }))}
          >
            桥接
          </button>
          <button
            type="button"
            className={`segment${config.mode === "route" ? " segment-on" : ""}`}
            onClick={() => patch((c) => ({ ...c, mode: "route" }))}
          >
            路由
          </button>
        </div>
      </div>

      {config.mode === "route" ? (
        <>
          <div
            className={`field${highlight === "wan.mode" ? " field-highlight" : ""}`}
            data-field="wan.mode"
          >
            <label className="field-label" htmlFor={`modem-wan-${device.id}`}>
              WAN 接入
            </label>
            <select
              id={`modem-wan-${device.id}`}
              className="field-input"
              value={config.wan.mode}
              onChange={(event) =>
                patch((c) => ({
                  ...c,
                  wan: { ...c.wan, mode: event.target.value as ModemWanMode },
                }))
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
                  patch((c) => ({
                    ...c,
                    wan: { ...c.wan, pppoe: { ...pppoe, password: value } },
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

          <div
            className={`group${highlight === "dhcp" ? " field-highlight" : ""}`}
            data-field="dhcp"
          >
            <Toggle
              label="DHCP"
              field="dhcp.enabled"
              checked={config.dhcp.enabled}
              onChange={(checked) =>
                patch((c) => ({ ...c, dhcp: { ...c.dhcp, enabled: checked } }))
              }
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
        </>
      ) : null}
    </div>
  );
}
