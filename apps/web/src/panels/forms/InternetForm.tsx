import type { InternetAccess, InternetAccessMode, InternetDevice } from "../../engine";
import { ACCESS_PRESETS } from "../../engine";
import { useTopologyStore } from "../../store";
import { Field } from "../Field";
import { ipValidator, maskValidator } from "../validators";

interface Props {
  device: InternetDevice;
  highlight: string | null;
}

const REGION_LABEL = { cn: "国内", overseas: "境外" } as const;

export function InternetForm({ device, highlight }: Props) {
  const updateDevice = useTopologyStore((s) => s.updateDevice);
  const access = device.config.access;

  const patch = (next: Partial<InternetAccess>) => {
    updateDevice(device.id, (d) =>
      d.type === "internet"
        ? { ...d, config: { ...d.config, access: { ...d.config.access, ...next } } }
        : d,
    );
  };

  return (
    <div className="form">
      <div
        className={`field${highlight === "access.mode" ? " field-highlight" : ""}`}
        data-field="access.mode"
      >
        <label className="field-label" htmlFor={`internet-mode-${device.id}`}>
          接入方式
        </label>
        <select
          id={`internet-mode-${device.id}`}
          className="field-input"
          value={access.mode ?? "dhcp"}
          onChange={(event) => patch({ mode: event.target.value as InternetAccessMode })}
        >
          <option value="dhcp">自动获取</option>
          <option value="pppoe">拨号</option>
        </select>
      </div>

      <div className="preset-buttons">
        {ACCESS_PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            className="btn"
            data-preset={preset.key}
            onClick={() => patch(preset.value)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <Field
        label="接入地址"
        field="access.ip"
        value={access.ip}
        highlight={highlight === "access.ip"}
        validate={ipValidator(true)}
        onCommit={(value) => patch({ ip: value.trim() })}
      />
      <Field
        label="子网掩码"
        field="access.mask"
        value={access.mask}
        highlight={highlight === "access.mask"}
        validate={maskValidator(true)}
        onCommit={(value) => patch({ mask: value.trim() })}
      />
      <Field
        label="池起始"
        field="access.poolStart"
        value={access.poolStart}
        highlight={highlight === "access.poolStart"}
        validate={ipValidator(true)}
        onCommit={(value) => patch({ poolStart: value.trim() })}
      />
      <Field
        label="池结束"
        field="access.poolEnd"
        value={access.poolEnd}
        highlight={highlight === "access.poolEnd"}
        validate={ipValidator(true)}
        onCommit={(value) => patch({ poolEnd: value.trim() })}
      />
      <Field
        label="下发 DNS"
        field="access.dns"
        value={access.dns}
        highlight={highlight === "access.dns"}
        validate={ipValidator(true)}
        onCommit={(value) => patch({ dns: value.trim() })}
      />

      <div className="field">
        <div className="field-label">目标</div>
        <table className="target-table">
          <thead>
            <tr>
              <th>域名</th>
              <th>IP</th>
              <th>位置</th>
            </tr>
          </thead>
          <tbody>
            {device.config.targets.map((target) => (
              <tr key={target.id}>
                <td>{target.domain}</td>
                <td>{target.ip}</td>
                <td>{REGION_LABEL[target.region]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
