import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { TrafficRouting, TrafficRule } from "../../engine";
import { Field, Toggle } from "../Field";
import { ProxyOptions } from "../ProxyOptions";
import { addressMatcherValidator, domainValidator, portValidator } from "./serviceValidators";
import "./services.css";

export function TrafficRoutingForm({
  sourceId,
  value,
  onChange,
}: {
  sourceId: string;
  value: TrafficRouting | undefined;
  onChange: (value: TrafficRouting) => void;
}) {
  const routing = value ?? { enabled: false, rules: [] };
  const patch = (index: number, change: Partial<TrafficRule>) =>
    onChange({
      ...routing,
      rules: routing.rules.map((r, i) => (i === index ? { ...r, ...change } : r)),
    });
  const move = (index: number, delta: number) => {
    const rules = [...routing.rules];
    const current = rules[index];
    const neighbor = rules[index + delta];
    if (!current || !neighbor) return;
    [rules[index], rules[index + delta]] = [neighbor, current];
    onChange({ ...routing, rules });
  };
  return (
    <section className="service-section" data-field="trafficRouting">
      <Toggle
        label="网站访问分流"
        field="trafficRouting.enabled"
        checked={routing.enabled}
        onChange={(enabled) => onChange({ ...routing, enabled })}
      />
      {routing.rules.map((rule, index) => (
        <div className="service-record traffic-rule" key={rule.id}>
          <div className="device-probe-actions">
            <Toggle
              label={`规则 ${index + 1}`}
              field={`routing-${rule.id}-enabled`}
              checked={rule.enabled}
              onChange={(enabled) => patch(index, { enabled })}
            />
            <button
              type="button"
              className="btn"
              title="上移规则"
              aria-label="上移规则"
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              <ArrowUp size={14} />
            </button>
            <button
              type="button"
              className="btn"
              title="下移规则"
              aria-label="下移规则"
              disabled={index === routing.rules.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDown size={14} />
            </button>
            <button
              type="button"
              className="btn"
              title="删除规则"
              aria-label="删除规则"
              onClick={() =>
                onChange({ ...routing, rules: routing.rules.filter((_, i) => i !== index) })
              }
            >
              <Trash2 size={14} />
            </button>
          </div>
          <Field
            label="规则名称"
            field={`routing-${rule.id}-name`}
            value={rule.name}
            onCommit={(name) => patch(index, { name })}
          />
          <label className="field">
            匹配类型
            <select
              className="field-input"
              value={rule.match}
              onChange={(e) =>
                patch(index, {
                  match: e.target.value as TrafficRule["match"],
                  target: e.target.value === "ip" ? "0.0.0.0/0" : "*",
                })
              }
            >
              <option value="domain">域名</option>
              <option value="ip">IP / 网段</option>
            </select>
          </label>
          <Field
            label="匹配目标"
            field={`routing-${rule.id}-target`}
            value={rule.target}
            validate={
              rule.match === "ip"
                ? (v) =>
                    !v.trim() || v.trim() === "*" ? "填写 IP 或网段" : addressMatcherValidator(v)
                : (v) => (v === "*" ? null : domainValidator(v, true))
            }
            onCommit={(target) => patch(index, { target: target.trim().toLowerCase() })}
          />
          <Field
            label="匹配端口（空为全部）"
            field={`routing-${rule.id}-port`}
            value={rule.port === null ? "" : String(rule.port)}
            validate={(v) => (v.trim() ? portValidator(v) : null)}
            onCommit={(v) => patch(index, { port: v.trim() ? Number(v) : null })}
          />
          <ProxyOptions
            sourceId={sourceId}
            value={rule.proxy}
            allowRules={false}
            onChange={(proxy) => patch(index, { proxy: proxy ?? null })}
          />
        </div>
      ))}
      <button
        type="button"
        className="btn"
        onClick={() =>
          onChange({
            ...routing,
            rules: [
              ...routing.rules,
              {
                id: crypto.randomUUID(),
                name: `规则 ${routing.rules.length + 1}`,
                enabled: true,
                match: "domain",
                target: "*",
                port: null,
                proxy: null,
              },
            ],
          })
        }
      >
        <Plus size={14} />
        添加分流规则
      </button>
    </section>
  );
}
