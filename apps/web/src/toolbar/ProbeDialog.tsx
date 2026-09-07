import { Play, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { isHost } from "../engine";
import { DnsOptions, type DnsSelection, dnsServerError } from "../panels/DnsOptions";
import { portValidator } from "../panels/forms/serviceValidators";
import { ProxyOptions, type ProxySelection } from "../panels/ProxyOptions";
import {
  defaultUdpSelection,
  UdpEchoOptions,
  type UdpEchoSelection,
  udpSelectionError,
} from "../panels/UdpEchoOptions";
import { type ProbeRequest, useTopologyStore } from "../store";
import { useLayoutStore } from "../store/layout";
import "./probe-dialog.css";

export function ProbeDialog({ onClose }: { onClose: () => void }) {
  const topology = useTopologyStore((s) => s.topology);
  const runProbe = useTopologyStore((s) => s.runProbe);
  const runtime = useTopologyStore((s) => s.runtime);
  const selection = useTopologyStore((s) => s.selection);
  const sources = topology.devices.filter((d) => isHost(d) || d.type === "router");
  const [kind, setKind] = useState<ProbeRequest["kind"]>("ping");
  const [source, setSource] = useState(
    selection.kind === "device" && sources.some((d) => d.id === selection.id)
      ? selection.id
      : (sources[0]?.id ?? ""),
  );
  const knownTargets = topology.devices.flatMap((d) =>
    d.type === "internet" ? d.config.targets : [],
  );
  const [target, setTarget] = useState(knownTargets.find((t) => t.dnsServer)?.ip ?? "8.8.8.8");
  const [domain, setDomain] = useState(knownTargets.find((t) => !t.dnsServer)?.domain ?? "");
  const [port, setPort] = useState("443");
  const [proxy, setProxy] = useState<ProxySelection>();
  const [dns, setDns] = useState<DnsSelection>({ server: "" });
  const [udp, setUdp] = useState<UdpEchoSelection>(() =>
    defaultUdpSelection(topology, runtime, source),
  );
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const domainMode = kind === "visitSite" || kind === "dnsQuery";
  const portError = kind === "visitSite" ? portValidator(port) : null;
  const dnsError = kind === "dnsQuery" ? dnsServerError(dns.server) : null;
  const udpError = kind === "udpEcho" ? udpSelectionError(udp) : null;
  const eligible = sources.filter((d) => !(domainMode || kind === "udpEcho") || isHost(d));
  const currentSource = eligible.some((d) => d.id === source) ? source : (eligible[0]?.id ?? "");
  const targets = topology.devices.flatMap((d) => (d.type === "internet" ? d.config.targets : []));
  const domains = Array.from(
    new Set([
      ...targets.map((t) => t.domain),
      ...topology.devices.flatMap((d) =>
        d.type === "server" ? d.config.dnsService.records.map((r) => r.domain) : [],
      ),
    ]),
  );
  const ips = Array.from(
    new Set([...targets.map((t) => t.ip), ...runtime.interfaces.map((i) => i.ip).filter(Boolean)]),
  );
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLElement>("button")?.focus();
    return () => before?.focus();
  }, []);
  const run = () => {
    if (!currentSource) {
      setError("请先添加可发起验证的设备");
      return;
    }
    if (kind !== "udpEcho" && !String(domainMode ? domain : target).trim()) {
      setError("请填写目标");
      return;
    }
    if (portError) {
      root.current?.querySelector<HTMLInputElement>(`[id="${id}-port"]`)?.focus();
      return;
    }
    if (dnsError || udpError) return;
    try {
      runProbe(
        kind === "udpEcho"
          ? {
              kind,
              sourceDeviceId: currentSource,
              targetIp: udp.targetIp.trim(),
              port: Number(udp.port),
              payload: udp.payload,
              proxy: udp.proxy,
            }
          : domainMode
            ? {
                kind,
                sourceDeviceId: currentSource,
                domain: domain.trim(),
                port: Number(port),
                server: kind === "dnsQuery" ? dns.server.trim() || undefined : undefined,
                proxy:
                  kind === "dnsQuery"
                    ? dns.proxy?.deviceId === currentSource
                      ? undefined
                      : dns.proxy
                    : proxy?.deviceId === currentSource
                      ? undefined
                      : proxy,
              }
            : { kind, sourceDeviceId: currentSource, targetIp: target.trim() },
      );
      useTopologyStore.getState().select({ kind: "none" });
      useLayoutStore.getState().openInspector();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "验证失败");
    }
  };
  return (
    <>
      <button type="button" className="probe-backdrop" aria-label="关闭验证" onClick={onClose} />
      <div
        ref={root}
        className="probe-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="网络验证"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
          if (event.key !== "Tab") return;
          const controls = Array.from(
            root.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled), input:not(:disabled), select:not(:disabled)",
            ) ?? [],
          );
          const first = controls[0];
          const last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          }
          if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <div className="probe-dialog-heading">
          <h2>网络验证</h2>
          <button
            type="button"
            className="btn icon-btn"
            aria-label="关闭"
            title="关闭"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
        <fieldset className="probe-modes" aria-label="验证类型">
          {(
            [
              ["ping", "连通性"],
              ["traceroute", "路径"],
              ["visitSite", "访问服务"],
              ["dnsQuery", "DNS 查询"],
              ["udpEcho", "UDP 回显"],
            ] as const
          ).map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-pressed={kind === value}
              onClick={() => {
                setKind(value);
                setError("");
              }}
            >
              {label}
            </button>
          ))}
        </fieldset>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-source`}>
            起点
          </label>
          <select
            id={`${id}-source`}
            className="field-input"
            value={currentSource}
            onChange={(event) => setSource(event.target.value)}
          >
            {eligible.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        {kind !== "udpEcho" ? (
          <div className="field">
            <label className="field-label" htmlFor={`${id}-target`}>
              {kind === "dnsQuery" ? "查询域名" : domainMode ? "目标域名或 IP" : "目标 IP"}
            </label>
            <input
              id={`${id}-target`}
              className="field-input"
              list={`${id}-targets`}
              value={domainMode ? domain : target}
              onChange={(event) =>
                domainMode ? setDomain(event.target.value) : setTarget(event.target.value)
              }
            />
            <datalist id={`${id}-targets`}>
              {(domainMode ? domains : ips).map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </div>
        ) : (
          <UdpEchoOptions sourceId={currentSource} value={udp} onChange={setUdp} />
        )}
        {kind === "visitSite" ? (
          <>
            <div className="field">
              <label className="field-label" htmlFor={`${id}-port`}>
                目标端口
              </label>
              <input
                id={`${id}-port`}
                className={`field-input${portError ? " field-input-error" : ""}`}
                aria-invalid={Boolean(portError)}
                aria-describedby={portError ? `${id}-port-error` : undefined}
                type="number"
                min="1"
                max="65535"
                value={port}
                onChange={(event) => setPort(event.target.value)}
              />
              {portError ? (
                <div id={`${id}-port-error`} role="alert" className="field-error">
                  {portError}
                </div>
              ) : null}
            </div>
            <ProxyOptions
              sourceId={currentSource}
              value={proxy?.deviceId === currentSource ? undefined : proxy}
              onChange={(next) => {
                if (next?.deviceId !== proxy?.deviceId || next?.protocol !== proxy?.protocol)
                  setPort(next?.protocol === "http" ? "80" : "443");
                setProxy(next);
              }}
            />
          </>
        ) : null}
        {error ? (
          <p role="alert" className="field-error">
            {error}
          </p>
        ) : null}
        {kind === "dnsQuery" ? (
          <DnsOptions
            sourceId={currentSource}
            value={{ ...dns, proxy: dns.proxy?.deviceId === currentSource ? undefined : dns.proxy }}
            onChange={setDns}
          />
        ) : null}
        <button
          type="button"
          className="btn btn-primary probe-run"
          disabled={Boolean(portError || dnsError || udpError)}
          onClick={run}
        >
          <Play size={15} />
          运行验证
        </button>
      </div>
    </>
  );
}
