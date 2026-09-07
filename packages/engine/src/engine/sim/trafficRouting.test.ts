import { describe, expect, it } from "vitest";
import type { PcDevice, ProxyDevice, TrafficRule } from "../../model/topology";
import { parseTopology } from "../../serialization/parse";
import { addDevice, connect, minimalTopology, PC1, R1 } from "../../test-support/fixtures";
import { dnsQuery } from "./dnsQuery";
import { ping } from "./ping";
import { visitSite } from "./visitSite";

function scenario() {
  const topology = minimalTopology();
  const pc = topology.devices.find((d) => d.id === PC1) as PcDevice;
  const proxy = addDevice(topology, "proxy") as ProxyDevice;
  Object.assign(proxy.config, {
    addressMode: "static",
    ip: "192.168.1.20",
    mask: "255.255.255.0",
    gateway: "192.168.1.1",
    dns: "8.8.8.8",
  });
  Object.assign(proxy.config.proxy, { protocol: "socks5", enabled: true, auth: "none" });
  connect(topology, proxy.id, "eth0", R1, "lan2");
  const rule: TrafficRule = {
    id: "r1",
    name: "外部访问",
    enabled: true,
    match: "domain",
    target: "*.google.com",
    port: null,
    proxy: { deviceId: proxy.id, protocol: "socks5", dnsMode: "proxy" },
  };
  pc.config.trafficRouting = { enabled: true, rules: [rule] };
  const run = (extra = {}) =>
    visitSite(topology, { sourceDeviceId: PC1, domain: "www.google.com", ...extra });
  return { topology, pc, proxy, rule, run };
}
describe("CP5R 网站访问分流", () => {
  it("匹配规则不能悄悄更改目标端口", () => {
    const { rule, proxy, run } = scenario();
    if (!rule.proxy) throw new Error("missing proxy");
    rule.proxy.protocol = "http";
    rule.port = 443;
    proxy.config.proxy.protocol = "http";
    const result = run();
    expect(result.routingNote).toContain("外部访问");
    expect(result.decisions.some((d) => d.packetOut?.l4.dstPort === 443)).toBe(true);
  });
  it("按规则使用代理并展示命中名称", () => {
    const { run } = scenario();
    const result = run();
    expect(result.verdict).toBe("ok");
    expect(result.routingNote).toContain("外部访问");
    expect(result.connections?.some((c) => c.role === "client-proxy")).toBe(true);
  });
  it("首条优先、停用跳过、总开关关闭", () => {
    const { pc, run, rule } = scenario();
    const routing = pc.config.trafficRouting;
    if (!routing) throw new Error("missing routing");
    const direct = { ...rule, id: "direct", name: "优先直连", proxy: null };
    routing.rules.unshift(direct);
    expect(run().routingNote).toContain("优先直连");
    direct.enabled = false;
    expect(run().routingNote).toContain("外部访问");
    routing.enabled = false;
    expect(run().routingNote).toContain("默认直连");
  });
  it("显式直连与显式代理覆盖规则", () => {
    const { run, rule } = scenario();
    expect(run({ proxy: null }).routingNote).toBe("手动指定 · 直接连接");
    expect(run({ proxy: null }).connections?.some((c) => c.role === "client-proxy")).toBe(false);
    rule.enabled = false;
    expect(run({ proxy: rule.proxy }).connections?.some((c) => c.role === "client-proxy")).toBe(
      true,
    );
  });
  it("域名规范化、子域名不匹配根域", () => {
    const { run, rule } = scenario();
    rule.target = "*.GOOGLE.com.";
    expect(run().routingNote).toContain("外部访问");
    expect(run({ domain: "google.com" }).routingNote).toContain("默认直连");
  });
  it("端口匹配及 IP 规则不提前解析域名", () => {
    const { run, rule } = scenario();
    rule.port = 80;
    expect(run().routingNote).toContain("默认直连");
    expect(run({ port: 80 }).routingNote).toContain("外部访问");
    rule.port = null;
    rule.match = "ip";
    rule.target = "142.250.72.0/24";
    expect(run().routingNote).toContain("默认直连");
    expect(run({ domain: "142.250.72.14" }).routingNote).toContain("外部访问");
    expect(run({ domain: "8.8.8.8" }).routingNote).toContain("默认直连");
  });
  it.each(["missing", "disabled", "auth"])("代理 %s 失败不回退", (mode) => {
    const { run, rule, proxy } = scenario();
    if (!rule.proxy) throw new Error("missing proxy");
    if (mode === "missing") rule.proxy.deviceId = "deleted";
    if (mode === "disabled") proxy.config.proxy.enabled = false;
    if (mode === "auth")
      Object.assign(proxy.config.proxy, { auth: "password", username: "user", password: "secret" });
    expect(run().verdict).toBe("fail");
    expect(run().routingNote).toContain("外部访问");
    expect(run({ proxy: null }).verdict).toBe("ok");
  });
  it("独立 DNS 与 ping 不跟随网站规则", () => {
    const { topology, rule } = scenario();
    if (!rule.proxy) throw new Error("missing proxy");
    rule.proxy.deviceId = "deleted";
    expect(dnsQuery(topology, { sourceDeviceId: PC1, domain: "www.google.com" }).verdict).toBe(
      "ok",
    );
    expect(ping(topology, { sourceDeviceId: PC1, targetIp: "8.8.8.8" }).verdict).toBe("ok");
  });
  it("新配置往返保留，旧文件继续可读", () => {
    const { topology, pc } = scenario();
    const parsed = parseTopology(JSON.parse(JSON.stringify(topology)));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.topology.devices.find((d) => d.id === PC1)).toEqual(pc);
    delete pc.config.trafficRouting;
    expect(parseTopology(topology).ok).toBe(true);
  });
  it.each(["target", "port", "proxy", "id"])("拒绝非法 %s", (key) => {
    const { topology, rule, pc } = scenario();
    if (key === "target") {
      rule.match = "ip";
      rule.target = "192.168.0.0/99";
    }
    if (key === "port") rule.port = 0;
    if (key === "proxy") Object.assign(rule.proxy ?? {}, { protocol: "invalid" });
    if (key === "id") pc.config.trafficRouting?.rules.push({ ...rule });
    expect(parseTopology(topology).ok).toBe(false);
  });
});
