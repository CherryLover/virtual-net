import { describe, expect, it } from "vitest";
import type { AccessRule } from "../../model/topology";
import { parseTopology } from "../../serialization/parse";
import {
  addDevice,
  connect,
  device,
  INET,
  minimalTopology,
  PC1,
  R1,
  routerOf,
  unplug,
} from "../../test-support/fixtures";
import { dnsQuery } from "./dnsQuery";
import { udpEcho, udpEchoInputError } from "./udpEcho";
import { visitSite } from "./visitSite";

function scenario() {
  const topology = minimalTopology();
  const server = addDevice(topology, "server");
  const proxy = addDevice(topology, "proxy");
  if (server.type !== "server" || proxy.type !== "proxy") throw new Error("bad fixture");
  Object.assign(server.config, {
    addressMode: "static",
    ip: "192.168.1.30",
    mask: "255.255.255.0",
    gateway: "192.168.1.1",
  });
  server.config.services = [
    { id: "echo", name: "UDP 回显", protocol: "udp", port: 7, enabled: true },
  ];
  Object.assign(proxy.config, {
    addressMode: "static",
    ip: "192.168.1.20",
    mask: "255.255.255.0",
    gateway: "192.168.1.1",
  });
  Object.assign(proxy.config.proxy, {
    enabled: true,
    protocol: "socks5",
    auth: "none",
    udp: { enabled: true, port: 1081 },
  });
  connect(topology, server.id, "eth0", R1, "lan3");
  connect(topology, proxy.id, "eth0", R1, "lan2");
  const options = {
    sourceDeviceId: PC1,
    targetIp: server.config.ip,
    port: 7,
    payload: "hello 网络",
    proxy: { deviceId: proxy.id },
  };
  return { topology, server, proxy, options };
}
function deny(patch: Partial<AccessRule>): AccessRule {
  return {
    id: "deny",
    name: "拦截测试",
    enabled: true,
    action: "deny",
    direction: "any",
    protocol: "udp",
    source: "",
    destination: "",
    domain: "",
    port: null,
    ...patch,
  };
}
describe("CP5E UDP 回显", () => {
  it.each([false, true])("直连/代理 %s 完整返回原文", (proxied) => {
    const { topology, options } = scenario();
    const result = udpEcho(topology, { ...options, proxy: proxied ? options.proxy : null });
    expect(result.verdict, result.reason ?? "").toBe("ok");
    expect(result.udpEcho?.received).toBe(options.payload);
    expect(result.dns).toBeNull();
    expect(result.decisions.at(-1)?.deviceId).toBe(PC1);
    if (proxied)
      expect(result.connections?.map((c) => c.role)).toEqual([
        "client-proxy",
        "proxy-auth",
        "proxy-associate",
        "client-relay",
        "relay-target",
        "relay-response",
      ]);
  });
  it("TCP 与 UDP 相同端口独立，旧服务仍是 TCP", () => {
    const { topology, server, options } = scenario();
    expect(
      visitSite(topology, { sourceDeviceId: PC1, domain: options.targetIp, port: 7 }).reasonCode,
    ).toBe("SERVICE_CLOSED");
    server.config.services.push({ id: "tcp", name: "TCP", port: 7, enabled: true });
    expect(parseTopology(topology).ok).toBe(true);
    expect(
      visitSite(topology, { sourceDeviceId: PC1, domain: options.targetIp, port: 7 }).verdict,
    ).toBe("ok");
    server.config.services = server.config.services.filter((s) => s.id !== "echo");
    expect(udpEcho(topology, options).reasonCode).toBe("SERVICE_CLOSED");
  });
  it("本机直连回环给出明确限制，不伪装成网络 ARP 故障", () => {
    const { topology, options, server } = scenario();
    const result = udpEcho(topology, { ...options, sourceDeviceId: server.id, proxy: null });
    expect(result.reasonCode).toBe("INVALID_PROBE_INPUT");
    expect(result.reason).toContain("本机回环");
    expect(result.udpEcho?.received).toBeNull();
  });
  it("服务器可以经另一台代理访问自己的回显服务", () => {
    const { topology, options, server } = scenario();
    const result = udpEcho(topology, { ...options, sourceDeviceId: server.id });
    expect(result.verdict, result.reason ?? "").toBe("ok");
    expect(result.udpEcho?.received).toBe(options.payload);
  });
  it("未开放端口或停服不产生回显", () => {
    const { topology, server, options } = scenario();
    expect(udpEcho(topology, { ...options, port: 9 }).reasonCode).toBe("SERVICE_CLOSED");
    server.config.services = [];
    const result = udpEcho(topology, options);
    expect(result.udpEcho?.received).toBeNull();
    expect(result.fixAt).toEqual({ deviceId: server.id, field: "services" });
    expect(result.connections?.at(-1)?.role).toBe("relay-target");
  });
  it.each(["disabled", "protocol", "auth", "udp", "missing"])("代理 %s 失败不会直连", (mode) => {
    const { topology, proxy, options } = scenario();
    if (mode === "disabled") proxy.config.proxy.enabled = false;
    if (mode === "protocol") proxy.config.proxy.protocol = "http";
    if (mode === "auth")
      Object.assign(proxy.config.proxy, { auth: "password", username: "user", password: "pass" });
    if (mode === "udp") proxy.config.proxy.udp = undefined;
    if (mode === "missing") options.proxy.deviceId = "deleted";
    expect(udpEcho(topology, options).verdict).toBe("fail");
    expect(udpEcho(topology, options).udpEcho?.received).toBeNull();
    expect(udpEcho(topology, { ...options, proxy: null }).verdict).toBe("ok");
  });
  it("认证正确才能继续转发", () => {
    const { topology, proxy, options } = scenario();
    Object.assign(proxy.config.proxy, { auth: "password", username: "user", password: "pass" });
    expect(
      udpEcho(topology, {
        ...options,
        proxy: { ...options.proxy, username: "user", password: "pass" },
      }).verdict,
    ).toBe("ok");
  });
  it.each(["entry", "exit", "target-return", "client-return"])(
    "%s 拦截定位且后续不执行",
    (stage) => {
      const { topology, proxy, server, options } = scenario();
      const pc = device(topology, PC1);
      const owner =
        stage === "entry" || stage === "client-return" ? pc : stage === "exit" ? proxy : server;
      const rule = deny(
        stage === "entry"
          ? { direction: "out", port: 1081 }
          : stage === "exit"
            ? { direction: "out", port: 7 }
            : stage === "target-return"
              ? { direction: "out", destination: proxy.config.ip }
              : { direction: "in", source: proxy.config.ip },
      );
      owner.accessPolicy = {
        enabled: true,
        defaultAction: "allow",
        stateful: false,
        rules: [rule],
      };
      const result = udpEcho(topology, options);
      expect(result.reasonCode).toBe("ACCESS_DENIED");
      expect(result.stoppedAt).toBe(owner.id);
      expect(result.udpEcho?.received).toBeNull();
      expect(result.connections?.at(-1)?.role).toBe(
        stage === "entry"
          ? "client-relay"
          : stage === "client-return"
            ? "relay-response"
            : "relay-target",
      );
      if (stage === "client-return")
        expect(result.connections?.find((c) => c.role === "relay-target")?.verdict).toBe("ok");
    },
  );
  it("外层不拿目标端口检查，网站分流不改变 UDP", () => {
    const { topology, options } = scenario();
    const pc = device(topology, PC1);
    pc.accessPolicy = {
      enabled: true,
      defaultAction: "allow",
      stateful: true,
      rules: [deny({ port: 7 })],
    };
    expect(udpEcho(topology, options).verdict).toBe("ok");
    expect(udpEcho(topology, { ...options, proxy: null }).reasonCode).toBe("ACCESS_DENIED");
    pc.accessPolicy = undefined;
    if (pc.type !== "pc") throw new Error("bad pc");
    pc.config.trafficRouting = {
      enabled: true,
      rules: [
        {
          id: "r",
          name: "unused",
          enabled: true,
          match: "ip",
          target: "0.0.0.0/0",
          port: null,
          proxy: { deviceId: "deleted", protocol: "socks5", dnsMode: "proxy" },
        },
      ],
    };
    expect(udpEcho(topology, { ...options, proxy: null }).verdict).toBe("ok");
  });
  it.each([false, true])("跨网段 %s 的 UDP 出口与 NAT 返回", (proxied) => {
    const { topology, server, options } = scenario();
    const serverLink = server.ports[0]?.linkId;
    if (!serverLink) throw new Error("missing link");
    unplug(topology, serverLink);
    unplug(topology, "l_2");
    const upstream = addDevice(topology, "switch");
    connect(topology, R1, "wan", upstream.id, "port1");
    connect(topology, INET, "port1", upstream.id, "port2");
    connect(topology, server.id, "eth0", upstream.id, "port3");
    Object.assign(server.config, { ip: "203.0.113.200", gateway: "203.0.113.1" });
    const request = {
      ...options,
      targetIp: server.config.ip,
      proxy: proxied ? options.proxy : null,
    };
    const result = udpEcho(topology, request);
    expect(result.verdict, result.reason ?? "").toBe("ok");
    expect(result.decisions.some((d) => d.basis.nat?.direction === "out")).toBe(true);
    expect(result.decisions.some((d) => d.basis.nat?.direction === "in")).toBe(true);
    routerOf(topology, R1).config.nat = false;
    expect(udpEcho(topology, request).verdict).toBe("fail");
  });
  it.each([
    { targetIp: "domain.example" },
    { port: 0 },
    { port: 53 },
    { port: 65536 },
    { port: 1.5 },
    { payload: "" },
    { payload: "a".repeat(1025) },
    { payload: "中".repeat(342) },
  ])("非法输入 %j 不建立代理连接", (patch) => {
    const { topology, options } = scenario();
    const result = udpEcho(topology, { ...options, ...patch });
    expect(result.reasonCode).toBe("INVALID_PROBE_INPUT");
    expect(result.connections).toBeUndefined();
    expect(result.udpEcho?.received).toBeNull();
  });
  it("UTF-8 边界及最大有效内容", () => {
    const { topology, options } = scenario();
    expect(udpEchoInputError(options.targetIp, 7, `${"中".repeat(341)}a`)).toBeNull();
    expect(udpEchoInputError(options.targetIp, 7, "\u{1f600}".repeat(256))).toBeNull();
    const payload = "a".repeat(1024);
    expect(udpEcho(topology, { ...options, payload }).udpEcho?.received).toBe(payload);
  });
  it("保存往返与同协议冲突、UDP 53、非法协议检查", () => {
    const { topology, server } = scenario();
    const parsed = parseTopology(JSON.stringify(topology));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.topology).toEqual(topology);
    const service = server.config.services[0];
    if (!service) throw new Error("missing service");
    server.config.services.push({ ...service, id: "duplicate" });
    expect(parseTopology(topology).ok).toBe(false);
    server.config.services.pop();
    service.port = 53;
    expect(parseTopology(topology).ok).toBe(false);
    service.port = 7;
    Object.assign(service, { protocol: "invalid" });
    expect(parseTopology(topology).ok).toBe(false);
    delete service.protocol;
    expect(parseTopology(topology).ok).toBe(true);
  });
  it("DNS 仍使用 DNS 服务，不由 UDP 回显假冒", () => {
    const { topology, options, server } = scenario();
    server.config.dnsService = {
      enabled: true,
      upstream: "",
      records: [{ domain: "internal.example", ip: server.config.ip }],
    };
    expect(
      dnsQuery(topology, {
        sourceDeviceId: PC1,
        domain: "internal.example",
        server: server.config.ip,
        proxy: options.proxy,
      }).dns?.ip,
    ).toBe(server.config.ip);
    server.config.dnsService.enabled = false;
    expect(
      dnsQuery(topology, {
        sourceDeviceId: PC1,
        domain: "internal.example",
        server: server.config.ip,
        proxy: options.proxy,
      }).verdict,
    ).toBe("fail");
  });
});
