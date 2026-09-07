import { useId } from "react";
import type { ProxyProtocol, VisitSiteOptions } from "../engine";
import { useTopologyStore } from "../store";

export type ProxySelection = VisitSiteOptions["proxy"];

export function ProxyOptions({
  sourceId,
  value,
  onChange,
  mode = "tcp",
  allowRules = mode === "tcp",
}: {
  sourceId: string;
  value: ProxySelection;
  onChange: (value: ProxySelection) => void;
  mode?: "tcp" | "udp";
  allowRules?: boolean;
}) {
  const devices = useTopologyStore((s) => s.topology.devices);
  const proxies = devices.filter(
    (d) =>
      d.type === "proxy" &&
      d.id !== sourceId &&
      (mode !== "udp" || d.config.proxy.protocol === "socks5"),
  );
  const id = useId();
  return (
    <div className="proxy-options">
      <div className="field">
        <label className="field-label" htmlFor={`${id}-proxy`}>
          {mode === "udp" ? "DNS 连接方式" : "连接方式"}
        </label>
        <select
          id={`${id}-proxy`}
          className="field-input"
          value={value?.deviceId ?? (value === undefined && allowRules ? "auto" : "")}
          onChange={(event) => {
            if (event.target.value === "auto") {
              onChange(undefined);
              return;
            }
            const proxy = proxies.find((d) => d.id === event.target.value);
            onChange(
              proxy?.type === "proxy"
                ? { deviceId: proxy.id, protocol: proxy.config.proxy.protocol, dnsMode: "proxy" }
                : null,
            );
          }}
        >
          {allowRules ? <option value="auto">遵循设备规则</option> : null}
          <option value="">直接连接</option>
          {value && !proxies.some((proxy) => proxy.id === value.deviceId) ? (
            <option value={value.deviceId} disabled>
              所选代理不可用
            </option>
          ) : null}
          {proxies.map((proxy) => (
            <option key={proxy.id} value={proxy.id}>
              {proxy.name}
              {mode === "udp" ? " · SOCKS5" : ""}
            </option>
          ))}
        </select>
      </div>
      {value ? (
        <>
          {mode === "tcp" ? (
            <div className="service-grid">
              <div className="field">
                <label className="field-label" htmlFor={`${id}-protocol`}>
                  请求协议
                </label>
                <select
                  id={`${id}-protocol`}
                  className="field-input"
                  value={value.protocol}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      protocol: event.target.value as ProxyProtocol,
                      dnsMode: event.target.value === "http" ? "proxy" : value.dnsMode,
                    })
                  }
                >
                  <option value="http">HTTP</option>
                  <option value="connect">HTTP CONNECT</option>
                  <option value="socks5">SOCKS5</option>
                </select>
              </div>
              <div className="field">
                <label className="field-label" htmlFor={`${id}-dns`}>
                  域名解析
                </label>
                <select
                  id={`${id}-dns`}
                  className="field-input"
                  value={value.dnsMode}
                  disabled={value.protocol === "http"}
                  onChange={(event) =>
                    onChange({ ...value, dnsMode: event.target.value as "client" | "proxy" })
                  }
                >
                  <option value="proxy">代理端</option>
                  <option value="client">客户端</option>
                </select>
              </div>
            </div>
          ) : null}
          <div className="service-grid">
            <div className="field">
              <label className="field-label" htmlFor={`${id}-user`}>
                模拟账号
              </label>
              <input
                id={`${id}-user`}
                className="field-input"
                autoComplete="off"
                value={value.username ?? ""}
                onChange={(event) => onChange({ ...value, username: event.target.value })}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor={`${id}-pass`}>
                模拟密码
              </label>
              <input
                id={`${id}-pass`}
                className="field-input"
                type="password"
                autoComplete="new-password"
                value={value.password ?? ""}
                onChange={(event) => onChange({ ...value, password: event.target.value })}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
