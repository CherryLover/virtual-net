import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRuntime, visitSite } from "../engine";
import { servicesTopology } from "../engine/serviceSample";
import { useTopologyStore } from "../store";
import { ProbeDialog } from "../toolbar/ProbeDialog";
import { DeviceProbe } from "./DeviceProbe";
import { ProbeView } from "./ProbeView";

vi.mock("../store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../store")>();
  return {
    ...actual,
    useTopologyStore: Object.assign(
      (selector: (state: ReturnType<typeof actual.useTopologyStore.getState>) => unknown) =>
        selector(actual.useTopologyStore.getState()),
      { getState: actual.useTopologyStore.getState, setState: actual.useTopologyStore.setState },
    ),
  };
});
const originalState = useTopologyStore.getState();

function fixture() {
  const topology = servicesTopology();
  const pc = topology.devices.find((d) => d.type === "pc");
  const proxy = topology.devices.find((d) => d.type === "proxy");
  if (!pc || !proxy) throw new Error("示例设备缺失");
  const runtime = buildRuntime(topology);
  const result = visitSite(topology, {
    sourceDeviceId: pc.id,
    domain: "app.example",
    proxy: { deviceId: proxy.id, protocol: "socks5", dnsMode: "proxy" },
  });
  useTopologyStore.setState({
    ...useTopologyStore.getState(),
    topology,
    runtime,
    lastProbe: result,
  });
  return { pc, proxy, result, runtime };
}

afterEach(() => useTopologyStore.setState(originalState, true));

describe("verification presentation", () => {
  it("quick controls do not duplicate the result rendered by the surrounding results panel", () => {
    const { pc, runtime } = fixture();
    const html = renderToStaticMarkup(createElement(DeviceProbe, { device: pc, runtime }));
    expect(html).not.toContain("probe-summary");
    expect(html).toContain('value="service.example"');
    expect(html).toContain('value="app.example"');
  });
  it("presents proxy legs instead of an ambiguous flattened path", () => {
    const { result } = fixture();
    const html = renderToStaticMarkup(
      createElement(ProbeView, { probe: result, focus: () => undefined }),
    );
    expect(html).not.toContain('class="probe-path"');
    expect(html).toContain('aria-label="连接过程"');
    expect(html.match(/class="btn connection-step"/g)).toHaveLength(
      result.connections?.length ?? 0,
    );
    expect(html).toContain("代理身份验证");
    expect(html).toContain("返回客户端");
  });
  it("dialog uses the current network targets and includes internal DNS records", () => {
    fixture();
    const html = renderToStaticMarkup(createElement(ProbeDialog, { onClose: () => undefined }));
    expect(html).toContain('value="192.0.2.53"');
    expect(html).not.toContain('value="8.8.8.8"');
    expect(html).toContain('class="probe-modes"');
  });
});
