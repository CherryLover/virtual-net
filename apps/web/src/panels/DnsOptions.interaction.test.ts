// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { servicesTopology } from "../engine/serviceSample";
import { useTopologyStore } from "../store";
import { ProbeDialog } from "../toolbar/ProbeDialog";
import { DeviceProbe } from "./DeviceProbe";
import { ProxyForm } from "./forms/ServiceForms";

let root: Root;
let container: HTMLDivElement;
let sourceId: string;
let proxyId: string;

function field<T extends HTMLElement>(name: string): T {
  const label = Array.from(container.querySelectorAll("label")).find(
    (l) => l.textContent?.trim() === name,
  );
  const element = label
    ? document.getElementById(label.htmlFor)
    : container.querySelector(`[aria-label="${name}"]`);
  if (!element) throw new Error(`Missing field: ${name}`);
  return element as T;
}
function button(name: string): HTMLButtonElement {
  const element = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === name,
  );
  if (!element) throw new Error(`Missing button: ${name}`);
  return element;
}
async function fill(name: string, value: string) {
  const input = field<HTMLInputElement>(name);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    input.focus();
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function select(name: string, value: string) {
  await act(async () => {
    const input = field<HTMLSelectElement>(name);
    input.value = value;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
function NodeProbe() {
  const state = useTopologyStore();
  const device = state.topology.devices.find((d) => d.id === sourceId);
  if (!device) throw new Error("missing source");
  return createElement(DeviceProbe, { device, runtime: state.runtime });
}
function ProxyConfig() {
  const state = useTopologyStore();
  const device = state.topology.devices.find((d) => d.id === proxyId);
  if (device?.type !== "proxy") throw new Error("missing proxy");
  return createElement(ProxyForm, { device, runtime: state.runtime, highlight: "proxy.udp" });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const topology = servicesTopology();
  const pc = topology.devices.find((d) => d.type === "pc");
  const proxy = topology.devices.find((d) => d.type === "proxy");
  if (!pc || !proxy) throw new Error("missing fixture");
  sourceId = pc.id;
  proxyId = proxy.id;
  proxy.config.proxy.udp = { enabled: true, port: 1081 };
  useTopologyStore.getState().replaceTopology(topology);
  useTopologyStore.setState({ past: [], future: [] });
  useTopologyStore.getState().select({ kind: "device", id: sourceId });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("DNS proxy controls", () => {
  it("node DNS uses its own connection and server, independent of invalid website port", async () => {
    await act(async () => root.render(createElement(NodeProbe)));
    await fill("目标端口", "0");
    await fill("网站", "service.example");
    await fill("DNS 服务器", "192.168.1.30");
    await select("DNS 连接方式", proxyId);
    expect(button("DNS 查询").disabled).toBe(false);
    await act(async () => button("DNS 查询").click());
    const state = useTopologyStore.getState();
    expect(state.lastProbe?.verdict).toBe("ok");
    expect(state.lastProbe?.connections?.at(-1)?.role).toBe("relay-response");
    expect(state.lastProbeRequest?.server).toBe("192.168.1.30");
    expect(state.lastProbeRequest?.proxy?.deviceId).toBe(proxyId);
    await select("DNS 连接方式", "");
    await act(async () => button("DNS 查询").click());
    expect(useTopologyStore.getState().lastProbe?.connections).toBeUndefined();
  });

  it("dialog validates server, runs SOCKS5 DNS and retains options for repeat validation", async () => {
    const close = vi.fn();
    await act(async () => root.render(createElement(ProbeDialog, { onClose: close })));
    await act(async () => button("DNS 查询").click());
    await fill("查询域名", "service.example");
    await fill("DNS 服务器", "bad-ip");
    expect(button("运行验证").disabled).toBe(true);
    await fill("DNS 服务器", "192.168.1.30");
    await select("DNS 连接方式", proxyId);
    await act(async () => button("运行验证").click());
    expect(close).toHaveBeenCalledOnce();
    expect(useTopologyStore.getState().lastProbe?.verdict).toBe("ok");
    const request = useTopologyStore.getState().lastProbeRequest;
    expect(request?.proxy?.deviceId).toBe(proxyId);
    expect(request).not.toBeNull();
    if (request)
      await act(async () => {
        useTopologyStore.getState().runProbe(request);
      });
    expect(useTopologyStore.getState().lastProbe?.connections?.at(-1)?.role).toBe("relay-response");
  });

  it("configuration toggles UDP, validates port and keeps edits undoable", async () => {
    await act(async () => root.render(createElement(ProxyConfig)));
    await fill("UDP 中继端口", "65536");
    await act(async () => field<HTMLInputElement>("UDP 中继端口").blur());
    const proxy = () => useTopologyStore.getState().topology.devices.find((d) => d.id === proxyId);
    expect(proxy()).toMatchObject({ config: { proxy: { udp: { port: 1081 } } } });
    await fill("UDP 中继端口", "2053");
    await act(async () => field<HTMLInputElement>("UDP 中继端口").blur());
    expect(proxy()).toMatchObject({ config: { proxy: { udp: { port: 2053 } } } });
    await act(async () => useTopologyStore.getState().undo());
    expect(proxy()).toMatchObject({ config: { proxy: { udp: { port: 1081 } } } });
    await act(async () => field<HTMLInputElement>("启用 UDP 中继").click());
    expect(proxy()).toMatchObject({ config: { proxy: { udp: { enabled: false } } } });
  });

  it("a changed proxy protocol is not silently displayed as direct connection", async () => {
    await act(async () => root.render(createElement(NodeProbe)));
    await select("DNS 连接方式", proxyId);
    await act(async () =>
      useTopologyStore
        .getState()
        .updateDevice(proxyId, (d) =>
          d.type === "proxy"
            ? { ...d, config: { ...d.config, proxy: { ...d.config.proxy, protocol: "http" } } }
            : d,
        ),
    );
    expect(field<HTMLSelectElement>("DNS 连接方式").selectedOptions[0]?.textContent).toBe(
      "所选代理不可用",
    );
    await act(async () => button("DNS 查询").click());
    expect(useTopologyStore.getState().lastProbe?.reasonCode).toBe("PROXY_PROTOCOL_MISMATCH");
  });
});
