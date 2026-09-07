import { Plus, Trash2 } from "lucide-react";
import type {
  InternetAccess,
  InternetAccessMode,
  InternetDevice,
  InternetTarget,
} from "../../engine";
import { ACCESS_PRESETS } from "../../engine";
import { useTopologyStore } from "../../store";
import { Field, Toggle } from "../Field";
import { ipValidator, maskValidator } from "../validators";
import { domainValidator } from "./serviceValidators";

interface Props {
  device: InternetDevice;
  highlight: string | null;
}

export function InternetForm({ device, highlight }: Props) {
  const updateDevice = useTopologyStore((s) => s.updateDevice);
  const access = device.config.access;
  const targets = device.config.targets;
  const setTargets = (next: InternetTarget[]) =>
    updateDevice(device.id, (d) =>
      d.type === "internet" ? { ...d, config: { ...d.config, targets: next } } : d,
    );
  const updateTarget = (id: string, patch: Partial<InternetTarget>) =>
    setTargets(targets.map((target) => (target.id === id ? { ...target, ...patch } : target)));

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

      <section className="service-section" data-field="targets">
        <h4>目标服务</h4>
        {targets.map((target) => (
          <details className="rule-item" key={target.id}>
            <summary>
              <span>{target.domain}</span>
              <span>{target.reachable ? "在线" : "离线"}</span>
            </summary>
            <div className="rule-body">
              <Field
                label="域名"
                field={`targets.${target.id}.domain`}
                value={target.domain}
                validate={(value) =>
                  domainValidator(value) ??
                  (targets.some(
                    (t) =>
                      t.id !== target.id && t.domain.toLowerCase() === value.trim().toLowerCase(),
                  )
                    ? "域名已存在"
                    : null)
                }
                onCommit={(domain) => updateTarget(target.id, { domain: domain.trim() })}
              />
              <Field
                label="IP"
                field={`targets.${target.id}.ip`}
                value={target.ip}
                validate={ipValidator(true)}
                onCommit={(ip) => updateTarget(target.id, { ip: ip.trim() })}
              />
              <Toggle
                label="在线"
                field={`targets.${target.id}.reachable`}
                checked={target.reachable}
                onChange={(reachable) => updateTarget(target.id, { reachable })}
              />
              <Toggle
                label="提供 DNS 服务"
                field={`targets.${target.id}.dnsServer`}
                checked={target.dnsServer}
                onChange={(dnsServer) => updateTarget(target.id, { dnsServer })}
              />
              <button
                type="button"
                className="btn icon-btn"
                title="删除目标"
                aria-label={`删除目标 ${target.domain}`}
                onClick={() => setTargets(targets.filter((t) => t.id !== target.id))}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </details>
        ))}
        <button
          type="button"
          className="btn"
          onClick={() => {
            let index = targets.length + 1;
            while (targets.some((t) => t.domain === `service${index}.example`)) index++;
            setTargets([
              ...targets,
              {
                id: crypto.randomUUID(),
                domain: `service${index}.example`,
                ip: `192.0.2.${(index % 253) + 1}`,
                region: "overseas",
                reachable: true,
                dnsServer: false,
              },
            ]);
          }}
        >
          <Plus size={15} />
          添加目标
        </button>
      </section>
    </div>
  );
}
