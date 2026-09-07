import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import type {
  AccessControlDevice,
  AccessPolicy,
  AccessRule,
  Device,
  DnsRecord,
  ProxyDevice,
  Runtime,
  ServerDevice,
} from "../../engine";
import { useTopologyStore } from "../../store";
import { Field, Toggle } from "../Field";
import { ipValidator } from "../validators";
import { PcForm } from "./PcForm";
import { addressMatcherValidator, domainValidator, portValidator } from "./serviceValidators";
import "./services.css";

function SelectField({
  label,
  value,
  options,
  onChange,
  field,
  highlight,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
  field?: string;
  highlight?: string | null;
}) {
  const id = useId();
  return (
    <div
      className={`field${field && highlight === field ? " field-highlight" : ""}`}
      data-field={field}
    >
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="field-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}

export function DnsRecords({
  records,
  onChange,
  fieldPrefix = "",
  highlight,
}: {
  records: DnsRecord[];
  onChange: (records: DnsRecord[]) => void;
  fieldPrefix?: string;
  highlight?: string | null;
}) {
  const [rowGeneration, setRowGeneration] = useState(0);
  return (
    <div className="service-records">
      {records.map((record, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: Rows cannot reorder; deletion changes the generation to clear shifted drafts. Editable domains must not be keys.
        <div className="service-record" key={`${rowGeneration}:${index}`}>
          <Field
            label="域名"
            field={`${fieldPrefix}records.${index}.domain`}
            highlight={highlight === `${fieldPrefix}records.${index}.domain`}
            value={record.domain}
            validate={(value) =>
              domainValidator(value) ??
              (records.some(
                (r, i) => i !== index && r.domain.toLowerCase() === value.trim().toLowerCase(),
              )
                ? "域名已存在"
                : null)
            }
            onCommit={(domain) =>
              onChange(records.map((r, i) => (i === index ? { ...r, domain: domain.trim() } : r)))
            }
          />
          <Field
            label="应答 IP"
            field={`${fieldPrefix}records.${index}.ip`}
            highlight={highlight === `${fieldPrefix}records.${index}.ip`}
            value={record.ip}
            validate={ipValidator(true)}
            onCommit={(ip) =>
              onChange(records.map((r, i) => (i === index ? { ...r, ip: ip.trim() } : r)))
            }
          />
          <button
            type="button"
            className="btn icon-btn"
            aria-label={`删除 DNS 记录 ${index + 1}`}
            title="删除记录"
            onClick={() => {
              setRowGeneration((generation) => generation + 1);
              onChange(records.filter((_, i) => i !== index));
            }}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn"
        onClick={() => {
          let index = records.length + 1;
          while (records.some((r) => r.domain === `service${index}.example`)) index++;
          onChange([...records, { domain: `service${index}.example`, ip: "192.0.2.10" }]);
        }}
      >
        <Plus size={15} />
        添加记录
      </button>
    </div>
  );
}

export function AccessPolicyForm({
  device,
  highlight,
}: {
  device: Device;
  highlight: string | null;
}) {
  const update = useTopologyStore((s) => s.updateDevice);
  const [openRules, setOpenRules] = useState<Set<string>>(() => new Set());
  const policy: AccessPolicy = device.accessPolicy ?? {
    enabled: false,
    defaultAction: "allow",
    stateful: true,
    rules: [],
  };
  const commit = (next: Partial<AccessPolicy>) =>
    update(device.id, (d) => ({ ...d, accessPolicy: { ...policy, ...next } }));
  const changeRule = (id: string, patch: Partial<AccessRule>) =>
    commit({ rules: policy.rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)) });
  const move = (index: number, delta: number) => {
    const rules = [...policy.rules];
    const at = rules[index];
    const other = rules[index + delta];
    if (!at || !other) return;
    rules[index] = other;
    rules[index + delta] = at;
    commit({ rules });
  };
  return (
    <section
      className={`service-section${highlight === "accessPolicy" ? " field-highlight" : ""}`}
      data-field="accessPolicy"
    >
      <h4>访问规则</h4>
      <Toggle
        label="启用访问规则"
        field="accessPolicy.enabled"
        highlight={highlight === "accessPolicy.enabled"}
        checked={policy.enabled}
        onChange={(enabled) => commit({ enabled })}
      />
      <fieldset disabled={!policy.enabled} className="service-fieldset">
        <SelectField
          label="无匹配规则时"
          field="accessPolicy.defaultAction"
          highlight={highlight}
          value={policy.defaultAction}
          options={[
            ["allow", "允许"],
            ["deny", "拒绝"],
          ]}
          onChange={(value) => commit({ defaultAction: value as AccessPolicy["defaultAction"] })}
        />
        <Toggle
          label="允许已建立连接返回"
          field="accessPolicy.stateful"
          highlight={highlight === "accessPolicy.stateful"}
          checked={policy.stateful}
          onChange={(stateful) => commit({ stateful })}
        />
        {policy.rules.map((rule, index) => (
          <details
            className="rule-item"
            key={rule.id}
            open={openRules.has(rule.id) || highlight?.includes(rule.id) || false}
            onToggle={(event) => {
              const opened = event.currentTarget.open;
              setOpenRules((before) => {
                if (before.has(rule.id) === opened) return before;
                const next = new Set(before);
                if (opened) next.add(rule.id);
                else next.delete(rule.id);
                return next;
              });
            }}
          >
            <summary>
              <span className="rule-order">{index + 1}</span>
              <span>{rule.name}</span>
              <span className={rule.action === "deny" ? "rule-deny" : "rule-allow"}>
                {!rule.enabled ? "已停用" : rule.action === "deny" ? "拒绝" : "允许"}
              </span>
            </summary>
            <div
              className={`rule-body${highlight === `accessPolicy.rules.${rule.id}` ? " field-highlight" : ""}`}
              data-field={`accessPolicy.rules.${rule.id}`}
            >
              <div className="service-actions">
                <button
                  type="button"
                  className="btn icon-btn"
                  disabled={index === 0}
                  aria-label={`上移规则 ${rule.name}`}
                  title="上移规则"
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp size={15} />
                </button>
                <button
                  type="button"
                  className="btn icon-btn"
                  disabled={index === policy.rules.length - 1}
                  aria-label={`下移规则 ${rule.name}`}
                  title="下移规则"
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown size={15} />
                </button>
                <button
                  type="button"
                  className="btn icon-btn"
                  aria-label={`删除规则 ${rule.name}`}
                  title="删除规则"
                  onClick={() => commit({ rules: policy.rules.filter((r) => r.id !== rule.id) })}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <Field
                label="规则名称"
                field="rule.name"
                value={rule.name}
                validate={(value) => (value.trim() ? null : "必填")}
                onCommit={(name) => changeRule(rule.id, { name: name.trim() })}
              />
              <Toggle
                label="启用规则"
                field="rule.enabled"
                checked={rule.enabled}
                onChange={(enabled) => changeRule(rule.id, { enabled })}
              />
              <div className="service-grid">
                <SelectField
                  label="动作"
                  value={rule.action}
                  options={[
                    ["allow", "允许"],
                    ["deny", "拒绝"],
                  ]}
                  onChange={(action) =>
                    changeRule(rule.id, { action: action as AccessRule["action"] })
                  }
                />
                <SelectField
                  label="方向"
                  value={rule.direction}
                  options={[
                    ["any", "所有方向"],
                    ["in", "入站"],
                    ["out", "出站"],
                    ["forward", "转发"],
                  ]}
                  onChange={(direction) =>
                    changeRule(rule.id, { direction: direction as AccessRule["direction"] })
                  }
                />
              </div>
              <SelectField
                label="协议"
                value={rule.protocol}
                options={[
                  ["any", "全部"],
                  ["tcp", "TCP"],
                  ["udp", "UDP"],
                  ["icmp", "ICMP"],
                ]}
                onChange={(protocol) =>
                  changeRule(rule.id, { protocol: protocol as AccessRule["protocol"] })
                }
              />
              <Field
                label="来源 IP / 网段"
                field="rule.source"
                value={rule.source}
                placeholder="任意"
                validate={addressMatcherValidator}
                onCommit={(source) => changeRule(rule.id, { source: source.trim() })}
              />
              <Field
                label="目标 IP / 网段"
                field="rule.destination"
                value={rule.destination}
                placeholder="任意"
                validate={addressMatcherValidator}
                onCommit={(destination) => changeRule(rule.id, { destination: destination.trim() })}
              />
              <Field
                label="目标域名"
                field="rule.domain"
                value={rule.domain}
                placeholder="任意"
                validate={(value) => (value.trim() ? domainValidator(value, true) : null)}
                onCommit={(domain) => changeRule(rule.id, { domain: domain.trim() })}
              />
              <Field
                label="目标端口"
                field="rule.port"
                value={rule.port === null ? "" : String(rule.port)}
                placeholder="任意"
                validate={(value) => (value.trim() ? portValidator(value) : null)}
                onCommit={(value) =>
                  changeRule(rule.id, { port: value.trim() ? Number(value) : null })
                }
              />
            </div>
          </details>
        ))}
        <button
          type="button"
          className="btn"
          onClick={() => {
            const id = crypto.randomUUID();
            commit({
              rules: [
                ...policy.rules,
                {
                  id,
                  name: `规则 ${policy.rules.length + 1}`,
                  enabled: true,
                  action: "deny",
                  direction: "any",
                  protocol: "any",
                  source: "",
                  destination: "",
                  domain: "",
                  port: null,
                },
              ],
            });
            setOpenRules((before) => new Set([...before, id]));
          }}
        >
          <Plus size={15} />
          添加规则
        </button>
      </fieldset>
    </section>
  );
}

export function ProxyForm({
  device,
  runtime,
  highlight,
}: {
  device: ProxyDevice;
  runtime: Runtime;
  highlight: string | null;
}) {
  const update = useTopologyStore((s) => s.updateDevice);
  const config = device.config.proxy;
  const commit = (patch: Partial<ProxyDevice["config"]["proxy"]>) =>
    update(device.id, (d) =>
      d.type === "proxy"
        ? { ...d, config: { ...d.config, proxy: { ...d.config.proxy, ...patch } } }
        : d,
    );
  return (
    <>
      <PcForm device={device} runtime={runtime} highlight={highlight} />
      <section
        className={`service-section${highlight === "proxy" ? " field-highlight" : ""}`}
        data-field="proxy"
      >
        <h4>代理入口</h4>
        <Toggle
          label="启用代理"
          field="proxy.enabled"
          highlight={highlight === "proxy.enabled"}
          checked={config.enabled}
          onChange={(enabled) => commit({ enabled })}
        />
        <SelectField
          label="代理协议"
          field="proxy.protocol"
          highlight={highlight}
          value={config.protocol}
          options={[
            ["http", "HTTP"],
            ["connect", "HTTP CONNECT"],
            ["socks5", "SOCKS5"],
          ]}
          onChange={(protocol) => commit({ protocol: protocol as typeof config.protocol })}
        />
        <Field
          label="监听端口"
          field="proxy.port"
          highlight={highlight === "proxy.port"}
          value={String(config.port)}
          validate={portValidator}
          onCommit={(value) => commit({ port: Number(value) })}
        />
        <SelectField
          label="身份验证"
          field="proxy.auth"
          highlight={highlight}
          value={config.auth}
          options={[
            ["none", "无认证"],
            ["password", "账号密码"],
          ]}
          onChange={(auth) => commit({ auth: auth as typeof config.auth })}
        />
        {config.auth === "password" ? (
          <>
            <Field
              label="模拟账号"
              field="proxy.username"
              highlight={highlight === "proxy.username"}
              value={config.username}
              onCommit={(username) => commit({ username })}
            />
            <Field
              label="模拟密码"
              field="proxy.password"
              highlight={highlight === "proxy.password"}
              value={config.password}
              onCommit={(password) => commit({ password })}
            />
          </>
        ) : null}
        {config.protocol === "socks5" ? (
          <div
            data-field="proxy.udp"
            className={highlight?.startsWith("proxy.udp") ? "field-highlight" : undefined}
          >
            <Toggle
              label="启用 UDP 中继"
              field="proxy.udp.enabled"
              checked={config.udp?.enabled ?? false}
              onChange={(enabled) => commit({ udp: { enabled, port: config.udp?.port ?? 1081 } })}
            />
            {config.udp?.enabled ? (
              <Field
                label="UDP 中继端口"
                field="proxy.udp.port"
                value={String(config.udp.port)}
                validate={portValidator}
                onCommit={(value) => commit({ udp: { enabled: true, port: Number(value) } })}
              />
            ) : null}
          </div>
        ) : null}
      </section>
    </>
  );
}

export function ServerForm({
  device,
  runtime,
  highlight,
}: {
  device: ServerDevice;
  runtime: Runtime;
  highlight: string | null;
}) {
  const update = useTopologyStore((s) => s.updateDevice);
  const commit = (patch: Partial<ServerDevice["config"]>) =>
    update(device.id, (d) =>
      d.type === "server" ? { ...d, config: { ...d.config, ...patch } } : d,
    );
  const services = device.config.services;
  const dns = device.config.dnsService;
  return (
    <>
      <PcForm device={device} runtime={runtime} highlight={highlight} />
      <section
        className={`service-section${highlight === "services" ? " field-highlight" : ""}`}
        data-field="services"
      >
        <h4>服务端口</h4>
        {services.map((service) => (
          <div className="service-record" key={service.id}>
            <Field
              label="服务名称"
              field={`services.${service.id}.name`}
              highlight={highlight === `services.${service.id}.name`}
              value={service.name}
              onCommit={(name) =>
                commit({
                  services: services.map((s) => (s.id === service.id ? { ...s, name } : s)),
                })
              }
            />
            <Field
              label="端口"
              field={`services.${service.id}.port`}
              highlight={highlight === `services.${service.id}.port`}
              value={String(service.port)}
              validate={(value) =>
                portValidator(value) ??
                (services.some((s) => s.id !== service.id && s.port === Number(value))
                  ? "端口已存在"
                  : null)
              }
              onCommit={(value) =>
                commit({
                  services: services.map((s) =>
                    s.id === service.id ? { ...s, port: Number(value) } : s,
                  ),
                })
              }
            />
            <Toggle
              label="启用服务"
              field={`services.${service.id}.enabled`}
              highlight={highlight === `services.${service.id}.enabled`}
              checked={service.enabled}
              onChange={(enabled) =>
                commit({
                  services: services.map((s) => (s.id === service.id ? { ...s, enabled } : s)),
                })
              }
            />
            <button
              type="button"
              className="btn icon-btn"
              aria-label={`删除服务 ${service.name}`}
              title="删除服务"
              onClick={() => commit({ services: services.filter((s) => s.id !== service.id) })}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn"
          onClick={() => {
            let port = 8080;
            while (services.some((s) => s.port === port)) port++;
            commit({
              services: [
                ...services,
                { id: crypto.randomUUID(), name: "服务", port, enabled: true },
              ],
            });
          }}
        >
          <Plus size={15} />
          添加服务
        </button>
      </section>
      <section
        className={`service-section${highlight === "dnsService" ? " field-highlight" : ""}`}
        data-field="dnsService"
      >
        <h4>DNS 服务</h4>
        <Toggle
          label="启用 DNS 服务"
          field="dnsService.enabled"
          highlight={highlight === "dnsService.enabled"}
          checked={dns.enabled}
          onChange={(enabled) => commit({ dnsService: { ...dns, enabled } })}
        />
        <Field
          label="上游 DNS"
          field="dnsService.upstream"
          highlight={highlight === "dnsService.upstream"}
          value={dns.upstream}
          validate={ipValidator(false)}
          onCommit={(upstream) => commit({ dnsService: { ...dns, upstream: upstream.trim() } })}
        />
        <DnsRecords
          fieldPrefix="dnsService."
          highlight={highlight}
          records={dns.records}
          onChange={(records) => commit({ dnsService: { ...dns, records } })}
        />
      </section>
    </>
  );
}

export function AccessControlForm({
  device,
  highlight,
}: {
  device: AccessControlDevice;
  highlight: string | null;
}) {
  const update = useTopologyStore((s) => s.updateDevice);
  const rewrite = device.config.dnsRewrite;
  const commit = (patch: Partial<typeof rewrite>) =>
    update(device.id, (d) =>
      d.type === "access-control"
        ? { ...d, config: { ...d.config, dnsRewrite: { ...d.config.dnsRewrite, ...patch } } }
        : d,
    );
  return (
    <section
      className={`service-section${highlight === "dnsRewrite" ? " field-highlight" : ""}`}
      data-field="dnsRewrite"
    >
      <h4>DNS 应答处理</h4>
      <Toggle
        label="启用应答改写"
        field="dnsRewrite.enabled"
        highlight={highlight === "dnsRewrite.enabled"}
        checked={rewrite.enabled}
        onChange={(enabled) => commit({ enabled })}
      />
      <DnsRecords
        fieldPrefix="dnsRewrite."
        highlight={highlight}
        records={rewrite.records}
        onChange={(records) => commit({ records })}
      />
    </section>
  );
}
