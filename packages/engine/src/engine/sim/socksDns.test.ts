import { describe, expect, it } from "vitest";
import type { AccessRule, ProxyDevice, ServerDevice } from "../../model/topology";
import { parseTopology } from "../../serialization/parse";
import {
  addDevice,
  connect,
  device,
  INET,
  minimalTopology,
  PC1,
  R1,
  setStatic,
  unplug,
} from "../../test-support/fixtures";
import { dnsQuery } from "./dnsQuery";
import { ping } from "./ping";
import { visitSite } from "./visitSite";

function scenario() {
  const topology = minimalTopology();
  const proxy = addDevice(topology, "proxy") as ProxyDevice;
  Object.assign(proxy.config, {
    addressMode: "static",
    ip: "192.168.1.20",
    mask: "255.255.255.0",
    gateway: "192.168.1.1",
    dns: "8.8.8.8",
  });
  Object.assign(proxy.config.proxy, { protocol: "socks5", udp: { enabled: true, port: 1081 } });
  connect(topology, proxy.id, "eth0", R1, "lan2");
  const options = {
    sourceDeviceId: PC1,
    domain: "www.google.com",
    server: "8.8.8.8",
    proxy: { deviceId: proxy.id },
  };
  return { topology, proxy, options };
}

function deny(values: Partial<AccessRule>): AccessRule {
  return {
    id: "deny",
    name: "测试阻断",
    enabled: true,
    action: "deny",
    direction: "any",
    protocol: "udp",
    source: "",
    destination: "",
    domain: "",
    port: null,
    ...values,
  };
}

describe("SOCKS5 UDP DNS", () => {
  it("控制和关联先完成，UDP 单向到中继，出口查询后再通过 UDP 返回", () => {
    const { topology, proxy, options } = scenario();
    const result = dnsQuery(topology, options);
    expect(result.verdict).toBe("ok");
    expect(result.dns?.ip).toBe("142.250.72.14");
    expect(result.connections?.map((c) => c.role)).toEqual([
      "client-proxy",
      "proxy-auth",
      "proxy-associate",
      "client-relay",
      "relay-dns",
      "relay-response",
    ]);
    const ingress = result.connections?.find((c) => c.role === "client-relay");
    expect(ingress).toBeDefined();
    const steps = result.decisions.filter(
      (d) => d.seq >= (ingress?.startSeq ?? 0) && d.seq <= (ingress?.endSeq ?? 0),
    );
    expect(steps.some((d) => d.action === "answer")).toBe(false);
    expect(steps.at(-1)?.deviceId).toBe(proxy.id);
    expect(steps.at(-1)?.packetIn?.l4.dstPort).toBe(1081);
    expect(result.decisions.at(-1)?.deviceId).toBe(PC1);
    expect(result.decisions.at(-1)?.packetIn?.proto).toBe("udp");
    expect(result.decisions.some((d) => d.phase === "dns" && d.basis.nat)).toBe(true);
    expect(result.connections?.every((c) => c.endSeq >= c.startSeq)).toBe(true);
  });

  it.each(["disabled", "protocol", "auth", "udp-off", "legacy", "bad-port"])(
    "%s 停止且不执行出口查询",
    (failure) => {
      const { topology, proxy, options } = scenario();
      if (failure === "disabled") proxy.config.proxy.enabled = false;
      if (failure === "protocol") proxy.config.proxy.protocol = "http";
      if (failure === "auth")
        Object.assign(proxy.config.proxy, { auth: "password", username: "demo", password: "demo" });
      if (failure === "udp-off") proxy.config.proxy.udp = { enabled: false, port: 1081 };
      if (failure === "legacy") delete proxy.config.proxy.udp;
      if (failure === "bad-port") proxy.config.proxy.udp = { enabled: true, port: 0 };
      const result = dnsQuery(topology, options);
      expect(result.verdict).toBe("fail");
      expect(result.stoppedAt).toBe(proxy.id);
      expect(result.connections?.some((c) => c.role === "relay-dns")).toBe(false);
      expect(result.decisions.some((d) => d.phase === "dns")).toBe(false);
    },
  );

  it.each(["in", "out"] as const)("分别拦截 UDP %s，精确定位规则", (direction) => {
    const { topology, proxy, options } = scenario();
    proxy.accessPolicy = {
      enabled: true,
      defaultAction: "allow",
      stateful: true,
      rules: [deny({ direction, port: direction === "in" ? 1081 : 53 })],
    };
    const result = dnsQuery(topology, options);
    expect(result.verdict).toBe("fail");
    expect(result.fixAt).toEqual({ deviceId: proxy.id, field: "accessPolicy.rules.deny" });
    expect(result.connections?.at(-1)?.role).toBe(
      direction === "in" ? "client-relay" : "relay-dns",
    );
  });

  it("出口成功但 UDP 返回被拦时，不把答案当作客户端查询成功", () => {
    const { topology, proxy, options } = scenario();
    proxy.accessPolicy = {
      enabled: true,
      defaultAction: "allow",
      stateful: false,
      rules: [deny({ direction: "out", port: 49163 })],
    };
    const result = dnsQuery(topology, options);
    expect(result.verdict).toBe("fail");
    expect(result.dns).toBeNull();
    expect(result.connections?.find((c) => c.role === "relay-dns")?.verdict).toBe("ok");
    expect(result.connections?.at(-1)?.role).toBe("relay-response");
  });

  it("内外层不混用目标端口和域名，不将代理客户端自己的 DNS 设定换成代理 DNS", () => {
    const { topology, proxy, options } = scenario();
    const pc = device(topology, PC1);
    pc.accessPolicy = {
      enabled: true,
      defaultAction: "allow",
      stateful: true,
      rules: [deny({ port: 53 }), deny({ id: "domain", domain: options.domain })],
    };
    expect(dnsQuery(topology, options).verdict).toBe("ok");
    expect(dnsQuery(topology, { ...options, proxy: undefined }).verdict).toBe("fail");
    pc.accessPolicy = undefined;
    setStatic(topology, PC1, "192.168.1.10", "255.255.255.0", "192.168.1.1", "");
    expect(dnsQuery(topology, { ...options, server: undefined }).reasonCode).toBe("NO_DNS");
    expect(proxy.config.dns).toBe("8.8.8.8");
  });

  it("内部 DNS 与认证凭据可用，TCP 和 UDP 可使用相同端口号", () => {
    const { topology, proxy, options } = scenario();
    const server = addDevice(topology, "server") as ServerDevice;
    Object.assign(server.config, {
      addressMode: "static",
      ip: "192.168.1.30",
      mask: "255.255.255.0",
      gateway: "192.168.1.1",
    });
    server.config.dnsService = {
      enabled: true,
      records: [{ domain: "mail.example", ip: "192.168.1.30" }],
      upstream: "",
    };
    connect(topology, server.id, "eth0", R1, "lan3");
    proxy.config.proxy.udp = { enabled: true, port: proxy.config.proxy.port };
    Object.assign(proxy.config.proxy, {
      auth: "password",
      username: "demo",
      password: "test-only",
    });
    const result = dnsQuery(topology, {
      ...options,
      server: server.config.ip,
      domain: "mail.example",
      proxy: { deviceId: proxy.id, username: "demo", password: "test-only" },
    });
    expect(result.verdict).toBe("ok");
    expect(result.dns?.ip).toBe(server.config.ip);
  });

  it("DNS 应答改写沿出口生效，NXDOMAIN 不产生中继成功返回", () => {
    const { topology, options } = scenario();
    unplug(topology, "l_2");
    const control = addDevice(topology, "access-control");
    if (control.type !== "access-control") throw new Error("类型错误");
    control.config.dnsRewrite = {
      enabled: true,
      records: [{ domain: options.domain, ip: "192.0.2.25" }],
    };
    connect(topology, R1, "wan", control.id, "port1");
    connect(topology, control.id, "port2", INET, "port1");
    expect(dnsQuery(topology, options).dns).toMatchObject({
      ip: "192.0.2.25",
      rewritten: true,
      rewrittenBy: [control.id],
    });
    const missing = dnsQuery(topology, { ...options, domain: "absent.example" });
    expect(missing.reasonCode).toBe("DNS_NXDOMAIN");
    expect(missing.connections?.at(-1)?.role).toBe("relay-dns");
  });

  it("配置 JSON 往返、旧文件及非法配置校验", () => {
    const { topology, proxy, options } = scenario();
    const parsed = parseTopology(JSON.parse(JSON.stringify(topology)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("导入失败");
    expect(dnsQuery(parsed.topology, options).verdict).toBe("ok");
    proxy.config.proxy.udp = { enabled: true, port: 65536 };
    expect(parseTopology(topology).ok).toBe(false);
    delete proxy.config.proxy.udp;
    expect(parseTopology(topology).ok).toBe(true);
    expect(dnsQuery(topology, options).reasonCode).toBe("PROXY_UDP_UNAVAILABLE");
  });

  it("重复查询无会话残留，直接查询、ping 和网站 SOCKS5 保持可用", () => {
    const { topology, proxy, options } = scenario();
    expect(dnsQuery(topology, options)).toEqual(dnsQuery(topology, options));
    expect(dnsQuery(topology, { ...options, proxy: undefined }).verdict).toBe("ok");
    expect(ping(topology, { sourceDeviceId: PC1, targetIp: "8.8.8.8" }).verdict).toBe("ok");
    expect(
      visitSite(topology, {
        sourceDeviceId: PC1,
        domain: options.domain,
        proxy: { deviceId: proxy.id, protocol: "socks5", dnsMode: "proxy" },
      }).verdict,
    ).toBe("ok");
  });

  it("外部代理的 UDP 入口和返回经过客户端 NAT，不使用 TCP 的映射", () => {
    const { topology, proxy, options } = scenario();
    const link = proxy.ports[0]?.linkId;
    if (!link) throw new Error("没有连线");
    unplug(topology, link);
    Object.assign(proxy.config, { ip: "203.0.113.200", gateway: "203.0.113.1" });
    unplug(topology, "l_2");
    const upstreamSwitch = addDevice(topology, "switch");
    connect(topology, proxy.id, "eth0", upstreamSwitch.id, "port1");
    connect(topology, R1, "wan", upstreamSwitch.id, "port2");
    connect(topology, INET, "port1", upstreamSwitch.id, "port3");
    const result = dnsQuery(topology, options);
    expect(
      result.verdict,
      JSON.stringify({ reason: result.reason, connections: result.connections }),
    ).toBe("ok");
    expect(
      result.decisions.some((d) => d.phase === "udp" && d.basis.nat?.direction === "out"),
    ).toBe(true);
    expect(result.decisions.some((d) => d.phase === "udp" && d.basis.nat?.direction === "in")).toBe(
      true,
    );
  });

  it.each([
    null,
    { enabled: "yes", port: 1081 },
    { enabled: true, port: 1.5 },
    { enabled: true, port: "1081" },
  ])("拒绝非法 UDP 配置 %j", (udp) => {
    const { topology, proxy } = scenario();
    Object.assign(proxy.config.proxy, { udp });
    expect(parseTopology(topology).ok).toBe(false);
  });
});
