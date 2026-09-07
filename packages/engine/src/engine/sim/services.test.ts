import { describe, expect, it } from "vitest";
import type { AccessPolicy, AccessRule, ProxyDevice, ServerDevice } from "../../model/topology";
import { parseTopology } from "../../serialization/parse";
import {
  addDevice,
  connect,
  device,
  minimalTopology,
  PC1,
  R1,
  setStatic,
  unplug,
} from "../../test-support/fixtures";
import { buildRuntime } from "../runtime";
import { dnsQuery } from "./dnsQuery";
import { makePacket } from "./frame";
import { ping } from "./ping";
import { PolicySessions } from "./policy";
import { visitSite } from "./visitSite";

const domain = "www.google.com";
const targetIp = "142.250.72.14";
function required<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) throw new Error("测试数据缺失");
  return value;
}
const rule = (values: Partial<AccessRule> = {}): AccessRule => ({
  id: "r1",
  name: "规则",
  enabled: true,
  action: "deny",
  direction: "any",
  protocol: "any",
  source: "",
  destination: "",
  domain: "",
  port: null,
  ...values,
});
const policy = (rules: AccessRule[], values: Partial<AccessPolicy> = {}): AccessPolicy => ({
  enabled: true,
  defaultAction: "allow",
  stateful: true,
  rules,
  ...values,
});
function withProxy() {
  const topology = minimalTopology();
  const proxy = addDevice(topology, "proxy") as ProxyDevice;
  proxy.config = {
    ...proxy.config,
    addressMode: "static",
    ip: "192.168.1.20",
    mask: "255.255.255.0",
    gateway: "192.168.1.1",
    dns: "8.8.8.8",
  };
  connect(topology, proxy.id, "eth0", R1, "lan2");
  return { topology, proxy };
}
function withControl() {
  const topology = minimalTopology();
  unplug(topology, "l_2");
  const control = addDevice(topology, "access-control");
  connect(topology, R1, "wan", control.id, "port1");
  connect(topology, control.id, "port2", "d_inet", "port1");
  return { topology, control };
}
function withServer() {
  const topology = minimalTopology();
  const server = addDevice(topology, "server") as ServerDevice;
  server.config = {
    ...server.config,
    addressMode: "static",
    ip: "192.168.1.30",
    mask: "255.255.255.0",
    gateway: "192.168.1.1",
    dns: "8.8.8.8",
  };
  server.config.dnsService = {
    enabled: true,
    records: [{ domain: "service.example", ip: "192.168.1.30" }],
    upstream: "8.8.8.8",
  };
  connect(topology, server.id, "eth0", R1, "lan2");
  setStatic(topology, PC1, "192.168.1.10", "255.255.255.0", "192.168.1.1", server.config.ip);
  return { topology, server };
}
describe("CP4 通用访问控制", () => {
  it("默认拒绝下返回连接需stateful允许，路由NAT与透明节点都检查", () => {
    const { topology, control } = withControl();
    const outward = rule({
      action: "allow",
      protocol: "tcp",
      destination: targetIp,
      direction: "forward",
    });
    control.accessPolicy = policy([outward], { defaultAction: "deny" });
    device(topology, R1).accessPolicy = policy([{ ...outward }], { defaultAction: "deny" });
    const options = { sourceDeviceId: PC1, domain: targetIp };
    expect(visitSite(topology, options).verdict).toBe("ok");
    control.accessPolicy.stateful = false;
    expect(visitSite(topology, options).stoppedAt).toBe(control.id);
    control.accessPolicy.stateful = true;
    required(device(topology, R1).accessPolicy).stateful = false;
    expect(visitSite(topology, options).stoppedAt).toBe(R1);
  });
  it("未经过的DNS改写节点不影响查询", () => {
    const topology = minimalTopology();
    const spare = addDevice(topology, "access-control");
    if (spare.type !== "access-control") throw new Error("类型错误");
    spare.config.dnsRewrite = { enabled: true, records: [{ domain, ip: "192.0.2.99" }] };
    const result = dnsQuery(topology, { sourceDeviceId: PC1, domain });
    expect(result.verdict).toBe("ok");
    expect(result.dns?.ip).toBe(targetIp);
    expect(result.dns?.rewritten).toBeUndefined();
    expect(result.path).not.toContain(spare.id);
  });
  it("实际路径透明控制节点拒绝，且不是全局开关", () => {
    const { topology, control } = withControl();
    control.accessPolicy = policy([rule({ protocol: "tcp", destination: targetIp })]);
    const result = visitSite(topology, { sourceDeviceId: PC1, domain });
    expect(result.reasonCode).toBe("ACCESS_DENIED");
    expect(result.stoppedAt).toBe(control.id);
    expect(result.decisions.find((d) => d.verdict === "stop")?.basis.policy?.ruleId).toBe("r1");
    expect(ping(topology, { sourceDeviceId: PC1, targetIp }).verdict).toBe("ok");
    const spare = addDevice(topology, "access-control");
    spare.accessPolicy = policy([], { defaultAction: "deny" });
    control.accessPolicy.enabled = false;
    expect(visitSite(topology, { sourceDeviceId: PC1, domain }).verdict).toBe("ok");
  });
  it("首条匹配、CIDR、端口和禁用规则", () => {
    const { topology, control } = withControl();
    const deny = rule({ destination: "142.250.0.0/16", protocol: "tcp", port: 443 });
    control.accessPolicy = policy([
      rule({ id: "allow", action: "allow", destination: targetIp }),
      deny,
    ]);
    expect(visitSite(topology, { sourceDeviceId: PC1, domain }).verdict).toBe("ok");
    control.accessPolicy.rules.reverse();
    expect(visitSite(topology, { sourceDeviceId: PC1, domain }).reasonCode).toBe("ACCESS_DENIED");
    deny.enabled = false;
    expect(visitSite(topology, { sourceDeviceId: PC1, domain }).verdict).toBe("ok");
  });
  it("多个实际路径设备逐台检查", () => {
    const { topology, control } = withControl();
    device(topology, R1).accessPolicy = policy([rule({ protocol: "tcp", action: "allow" })]);
    control.accessPolicy = policy([rule({ protocol: "tcp" })]);
    const result = visitSite(topology, { sourceDeviceId: PC1, domain });
    expect(result.stoppedAt).toBe(control.id);
    expect(
      result.decisions.some((d) => d.deviceId === R1 && d.basis.policy?.action === "allow"),
    ).toBe(true);
  });
  it("主机 in/out 与路由 forward，共用已建立返回状态", () => {
    const { topology, proxy } = withProxy();
    const client = device(topology, PC1);
    client.accessPolicy = policy([rule({ action: "allow", direction: "out" })], {
      defaultAction: "deny",
    });
    const request = { sourceDeviceId: PC1, domain: proxy.config.ip, port: 8080 };
    expect(visitSite(topology, request).verdict).toBe("ok");
    client.accessPolicy.stateful = false;
    expect(visitSite(topology, request).reasonCode).toBe("ACCESS_DENIED");
    client.accessPolicy.enabled = false;
    proxy.accessPolicy = policy([rule({ direction: "in", protocol: "tcp" })]);
    expect(visitSite(topology, request).stoppedAt).toBe(proxy.id);
  });
  it("不可见的 HTTPS 域名不能匹配，DNS 域名可以", () => {
    const { topology, control } = withControl();
    control.accessPolicy = policy([rule({ domain: "*.google.com", protocol: "tcp" })]);
    expect(visitSite(topology, { sourceDeviceId: PC1, domain }).verdict).toBe("ok");
    expect(visitSite(topology, { sourceDeviceId: PC1, domain, port: 80 }).reasonCode).toBe(
      "ACCESS_DENIED",
    );
    required(control.accessPolicy.rules[0]).protocol = "udp";
    expect(visitSite(topology, { sourceDeviceId: PC1, domain }).reasonCode).toBe("ACCESS_DENIED");
  });
  it("应答改写只作用于实际返回路径，可以连接另一目标", () => {
    const { topology, control } = withControl();
    if (control.type !== "access-control") throw new Error("类型错误");
    control.config.dnsRewrite = { enabled: true, records: [{ domain, ip: "110.242.68.66" }] };
    const result = visitSite(topology, { sourceDeviceId: PC1, domain });
    expect(result.verdict).toBe("ok");
    expect(result.dns?.ip).toBe("110.242.68.66");
    expect(result.dns?.originalIp).toBe(targetIp);
    expect(result.dns?.rewrittenBy).toEqual([control.id]);
    expect(
      result.decisions.some(
        (d) => d.deviceId === control.id && d.basis.dns?.answer === "110.242.68.66",
      ),
    ).toBe(true);
    required(control.config.dnsRewrite.records[0]).ip = "192.0.2.99";
    expect(visitSite(topology, { sourceDeviceId: PC1, domain }).verdict).toBe("fail");
  });
  it("移动设备和更改区域名称不改变结果", () => {
    const { topology, control } = withControl();
    control.accessPolicy = policy([rule({ protocol: "tcp" })]);
    const before = visitSite(topology, { sourceDeviceId: PC1, domain });
    control.position = { x: 9000, y: -2000 };
    control.zone = "任意区域";
    expect(visitSite(topology, { sourceDeviceId: PC1, domain })).toEqual(before);
  });
});

describe("服务器与 DNS 服务", () => {
  it("独立 DNS 查询只解析并保留路径，不产生 TCP 连接", () => {
    const { topology, server } = withServer();
    const result = dnsQuery(topology, { sourceDeviceId: PC1, domain: "service.example" });
    expect(result.kind).toBe("dnsQuery");
    expect(result.verdict).toBe("ok");
    expect(result.dns?.ip).toBe(server.config.ip);
    expect(result.decisions.every((d) => d.phase === "dns")).toBe(true);
    expect(dnsQuery(topology, { sourceDeviceId: PC1, domain, server: "8.8.8.8" }).verdict).toBe(
      "ok",
    );
  });
  it("服务监听端口、启停、ping 不依赖 TCP 服务", () => {
    const { topology, server } = withServer();
    expect(visitSite(topology, { sourceDeviceId: PC1, domain: "service.example" }).verdict).toBe(
      "ok",
    );
    expect(
      visitSite(topology, { sourceDeviceId: PC1, domain: "service.example", port: 80 }).reasonCode,
    ).toBe("SERVICE_CLOSED");
    required(server.config.services[0]).enabled = false;
    expect(visitSite(topology, { sourceDeviceId: PC1, domain: "service.example" }).reasonCode).toBe(
      "SERVICE_CLOSED",
    );
    expect(ping(topology, { sourceDeviceId: PC1, targetIp: server.config.ip }).verdict).toBe("ok");
  });
  it("DNS 自己回答和向上游转发分别走实际路径", () => {
    const { topology, server } = withServer();
    expect(visitSite(topology, { sourceDeviceId: PC1, domain }).verdict).toBe("ok");
    server.config.dnsService.upstream = "";
    expect(visitSite(topology, { sourceDeviceId: PC1, domain }).reasonCode).toBe("DNS_NXDOMAIN");
    server.config.dnsService.enabled = false;
    expect(visitSite(topology, { sourceDeviceId: PC1, domain }).reasonCode).toBe("DNS_NOT_SERVER");
  });
  it("代理和服务器支持自动获取地址及作为起点", () => {
    const { topology, proxy } = withProxy();
    proxy.config.addressMode = "dhcp";
    expect(buildRuntime(topology).leaseOf(proxy.id, "eth0")?.status).toBe("ok");
    expect(visitSite(topology, { sourceDeviceId: proxy.id, domain }).verdict).toBe("ok");
    const server = addDevice(topology, "server");
    connect(topology, server.id, "eth0", R1, "lan3");
    expect(ping(topology, { sourceDeviceId: server.id, targetIp }).verdict).toBe("ok");
  });
});

describe("CP5 显式应用代理", () => {
  it.each(["connect", "socks5"] as const)("%s 仅代理端解析请求暴露目标域名", (protocol) => {
    const { topology, proxy } = withProxy();
    proxy.config.proxy.protocol = protocol;
    device(topology, PC1).accessPolicy = policy([
      rule({ protocol: "tcp", domain, destination: proxy.config.ip }),
    ]);
    const options = {
      sourceDeviceId: PC1,
      domain,
      proxy: { deviceId: proxy.id, protocol, dnsMode: "proxy" as const },
    };
    expect(visitSite(topology, options).reasonCode).toBe("ACCESS_DENIED");
    expect(
      visitSite(topology, { ...options, proxy: { ...options.proxy, dnsMode: "client" } }).verdict,
    ).toBe("ok");
  });
  it("代理 DNS 不可用可定位到解析连接，入口仍然成功", () => {
    const { topology, proxy } = withProxy();
    proxy.config.dns = "";
    const result = visitSite(topology, {
      sourceDeviceId: PC1,
      domain,
      proxy: { deviceId: proxy.id, protocol: "http", dnsMode: "proxy" },
    });
    expect(result.reasonCode).toBe("NO_DNS");
    expect(result.stoppedAt).toBe(proxy.id);
    expect(result.connections?.[0]?.verdict).toBe("ok");
    expect(result.connections?.at(-1)?.role).toBe("proxy-dns");
  });
  it.each(["http", "connect", "socks5"] as const)(
    "%s 两个实际连接、目标解析与最终返回",
    (protocol) => {
      const { topology, proxy } = withProxy();
      proxy.config.proxy.protocol = protocol;
      const result = visitSite(topology, {
        sourceDeviceId: PC1,
        domain,
        proxy: { deviceId: proxy.id, protocol, dnsMode: "proxy" },
      });
      expect(result.verdict, result.reason ?? "").toBe("ok");
      expect(result.connections?.map((c) => c.role)).toEqual([
        "client-proxy",
        "proxy-auth",
        "proxy-dns",
        "proxy-target",
        "proxy-response",
      ]);
      for (const connection of result.connections ?? []) {
        if (connection.role === "proxy-auth") continue;
        const decisions = result.decisions.slice(connection.startSeq - 1, connection.endSeq);
        expect(decisions.length).toBeGreaterThan(1);
        expect(decisions.some((d) => d.linkId)).toBe(true);
      }
      const last = result.decisions.at(-1);
      expect(last?.deviceId).toBe(PC1);
      expect(last?.action).toBe("receive");
      expect(result.decisions.map((d) => d.seq)).toEqual(result.decisions.map((_, i) => i + 1));
    },
  );
  it("入口已断开时不能凭代理存在就成功", () => {
    const { topology, proxy } = withProxy();
    unplug(topology, required(required(proxy.ports[0]).linkId));
    expect(
      visitSite(topology, {
        sourceDeviceId: PC1,
        domain,
        proxy: { deviceId: proxy.id, protocol: "http", dnsMode: "proxy" },
      }).verdict,
    ).toBe("fail");
  });
  it("停服、协议与认证分别定位，不会失败后直连", () => {
    const { topology, proxy } = withProxy();
    const options = {
      sourceDeviceId: PC1,
      domain,
      proxy: { deviceId: proxy.id, protocol: "http" as const, dnsMode: "proxy" as const },
    };
    proxy.config.proxy.enabled = false;
    expect(visitSite(topology, options).reasonCode).toBe("SERVICE_CLOSED");
    proxy.config.proxy.enabled = true;
    proxy.config.proxy.protocol = "socks5";
    expect(visitSite(topology, options).reasonCode).toBe("PROXY_PROTOCOL_MISMATCH");
    proxy.config.proxy.protocol = "http";
    proxy.config.proxy.auth = "password";
    proxy.config.proxy.username = "demo";
    proxy.config.proxy.password = "test";
    const failed = visitSite(topology, options);
    expect(failed.reasonCode).toBe("PROXY_AUTH_FAILED");
    expect(failed.connections?.some((c) => c.role === "direct" || c.role === "proxy-target")).toBe(
      false,
    );
    expect(
      visitSite(topology, {
        ...options,
        proxy: { ...options.proxy, username: "demo", password: "test" },
      }).verdict,
    ).toBe("ok");
  });
  it("客户端 DNS 不通而代理 DNS 可用；普通 ping 始终直接", () => {
    const { topology, proxy } = withProxy();
    proxy.config.proxy.protocol = "socks5";
    setStatic(topology, PC1, "192.168.1.10", "255.255.255.0", "192.168.1.1", "");
    const options = {
      sourceDeviceId: PC1,
      domain,
      proxy: { deviceId: proxy.id, protocol: "socks5" as const, dnsMode: "proxy" as const },
    };
    expect(visitSite(topology, options).verdict).toBe("ok");
    expect(
      visitSite(topology, { ...options, proxy: { ...options.proxy, dnsMode: "client" } })
        .reasonCode,
    ).toBe("NO_DNS");
    const result = ping(topology, { sourceDeviceId: PC1, targetIp });
    expect(result.path).not.toContain(proxy.id);
  });
  it("代理出口规则使用代理地址，并能单独拒绝", () => {
    const { topology, proxy } = withProxy();
    proxy.accessPolicy = policy([
      rule({ direction: "out", destination: targetIp, protocol: "tcp" }),
    ]);
    const result = visitSite(topology, {
      sourceDeviceId: PC1,
      domain,
      proxy: { deviceId: proxy.id, protocol: "http", dnsMode: "proxy" },
    });
    expect(result.reasonCode).toBe("ACCESS_DENIED");
    expect(result.stoppedAt).toBe(proxy.id);
    expect(result.connections?.at(-1)?.role).toBe("proxy-target");
    expect(result.connections?.[0]?.verdict).toBe("ok");
  });
});

describe("新增模型的导入导出", () => {
  it("目标域名与标识唯一，但多个域名允许共用IP", () => {
    const topology = minimalTopology();
    const internet = device(topology, "d_inet");
    if (internet.type !== "internet") throw new Error("类型错误");
    const original = required(internet.config.targets[0]);
    const added = { ...original, id: "shared", domain: "shared.example" };
    internet.config.targets.push(added);
    expect(parseTopology(topology).ok).toBe(true);
    added.domain = original.domain.toUpperCase();
    expect(parseTopology(topology).ok).toBe(false);
    added.domain = "shared.example";
    added.id = original.id;
    expect(parseTopology(topology).ok).toBe(false);
    added.id = "shared";
    added.domain = "https://invalid.example";
    expect(parseTopology(topology).ok).toBe(false);
  });
  it("拒绝重复服务标识/端口、重复DNS域名和非法规则域名", () => {
    const { topology, server } = withServer();
    server.config.services.push({ ...required(server.config.services[0]) });
    expect(parseTopology(topology).ok).toBe(false);
    required(server.config.services[1]).id = "other";
    expect(parseTopology(topology).ok).toBe(false);
    required(server.config.services[1]).port = 80;
    expect(parseTopology(topology).ok).toBe(true);
    server.config.dnsService.records.push({ domain: "SERVICE.EXAMPLE.", ip: "192.168.1.31" });
    expect(parseTopology(topology).ok).toBe(false);
    server.config.dnsService.records.pop();
    required(server.config.dnsService.records[0]).domain = "*.example";
    expect(parseTopology(topology).ok).toBe(false);
    required(server.config.dnsService.records[0]).domain = "service.example";
    server.accessPolicy = policy([rule({ domain: "https://bad.example/path" })]);
    expect(parseTopology(topology).ok).toBe(false);
    required(server.accessPolicy.rules[0]).domain = "*.example";
    expect(parseTopology(topology).ok).toBe(true);
    server.accessPolicy.rules.push({ ...required(server.accessPolicy.rules[0]) });
    expect(parseTopology(topology).ok).toBe(false);
  });
  it("保留区域、规则、服务和模拟凭据，严格拒绝坏字段", () => {
    const { topology, proxy } = withProxy();
    proxy.zone = "服务区";
    proxy.accessPolicy = policy([rule({ destination: "192.168.1.0/24", domain: "*.example" })]);
    addDevice(topology, "server");
    addDevice(topology, "access-control");
    const parsed = parseTopology(JSON.stringify(topology));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.topology).toEqual(topology);
    proxy.config.proxy.port = 0;
    expect(parseTopology(topology).ok).toBe(false);
    proxy.config.proxy.port = 8080;
    required(proxy.accessPolicy.rules[0]).destination = "bad/99";
    expect(parseTopology(topology).ok).toBe(false);
  });
});

describe("首批范围最终审计", () => {
  it("规则名称留快照并精确定位，空名与默认拒绝都有可读原因", () => {
    const { topology, control } = withControl();
    const selected = rule({ name: "限制目标访问", protocol: "tcp", id: "opaque-rule-id" });
    control.accessPolicy = policy([selected]);
    const options = { sourceDeviceId: PC1, domain: targetIp };
    const result = visitSite(topology, options);
    expect(result.reason).toContain("限制目标访问");
    expect(result.reason).not.toContain("opaque-rule-id");
    expect(result.fixAt?.field).toBe("accessPolicy.rules.opaque-rule-id");
    const basis = required(result.decisions.find((d) => d.verdict === "stop")?.basis.policy);
    expect(basis.ruleId).toBe("opaque-rule-id");
    expect(basis.ruleName).toBe("限制目标访问");
    selected.name = "";
    expect(basis.ruleName).toBe("限制目标访问");
    expect(visitSite(topology, options).reason).toContain("第 1 条规则");
    control.accessPolicy.rules = [];
    control.accessPolicy.defaultAction = "deny";
    const denied = visitSite(topology, options);
    expect(denied.reason).toContain("默认拒绝");
    expect(denied.fixAt?.field).toBe("accessPolicy.defaultAction");
  });
  it("返回连接仅匹配已允许的同一地址与端口组合", () => {
    const sessions = new PolicySessions();
    const rules = policy(
      [
        rule({
          direction: "out",
          action: "allow",
          protocol: "tcp",
          destination: targetIp,
          port: 443,
        }),
      ],
      { defaultAction: "deny" },
    );
    const sent = makePacket({
      srcMac: "",
      dstMac: "",
      srcIp: "192.168.1.10",
      dstIp: targetIp,
      proto: "tcp",
      l4: { srcPort: 49152, dstPort: 443 },
    });
    expect(sessions.evaluate(PC1, rules, sent, "out", "", false)?.action).toBe("allow");
    const response = {
      ...sent,
      srcIp: targetIp,
      dstIp: sent.srcIp,
      l4: { srcPort: 443, dstPort: 49152 },
    };
    expect(sessions.evaluate(PC1, rules, response, "in", "", true)?.stateful).toBe(true);
    expect(
      sessions.evaluate(PC1, rules, { ...response, srcIp: "192.0.2.9" }, "in", "", true)?.action,
    ).toBe("deny");
    expect(
      sessions.evaluate(
        PC1,
        rules,
        { ...response, l4: { srcPort: 80, dstPort: 49152 } },
        "in",
        "",
        true,
      )?.action,
    ).toBe("deny");
    expect(sessions.evaluate(PC1, rules, response, "in", "", false)?.action).toBe("deny");
  });
  it("DNS服务自身答案与途经设备改写按实际顺序分别留下依据", () => {
    const { topology, server } = withServer();
    unplug(topology, required(required(server.ports[0]).linkId));
    const control = addDevice(topology, "access-control");
    if (control.type !== "access-control") throw new Error("类型错误");
    connect(topology, server.id, "eth0", control.id, "port1");
    connect(topology, control.id, "port2", R1, "lan2");
    control.config.dnsRewrite = {
      enabled: true,
      records: [{ domain: "service.example", ip: "192.168.1.31" }],
    };
    const result = dnsQuery(topology, { sourceDeviceId: PC1, domain: "service.example" });
    expect(result.verdict).toBe("ok");
    expect(result.dns?.originalIp).toBe(server.config.ip);
    expect(result.dns?.ip).toBe("192.168.1.31");
    expect(result.dns?.rewrittenBy).toEqual([control.id]);
    const answer = required(
      result.decisions.find(
        (d) => d.deviceId === server.id && d.basis.dns?.answer === server.config.ip,
      ),
    );
    const rewrite = required(
      result.decisions.find(
        (d) => d.deviceId === control.id && d.basis.dns?.answer === "192.168.1.31",
      ),
    );
    expect(answer.seq).toBeLessThan(rewrite.seq);
  });
  it.each(["connect", "socks5"] as const)(
    "%s 客户端先解析再发送代理请求，失败不建立入口连接",
    (protocol) => {
      const { topology, proxy } = withProxy();
      proxy.config.proxy.protocol = protocol;
      const options = {
        sourceDeviceId: PC1,
        domain,
        proxy: { deviceId: proxy.id, protocol, dnsMode: "client" as const },
      };
      const result = visitSite(topology, options);
      expect(result.verdict).toBe("ok");
      expect(result.connections?.map((c) => c.role)).toEqual([
        "client-dns",
        "client-proxy",
        "proxy-auth",
        "proxy-target",
        "proxy-response",
      ]);
      setStatic(topology, PC1, "192.168.1.10", "255.255.255.0", "192.168.1.1", "");
      const failed = visitSite(topology, options);
      expect(failed.reasonCode).toBe("NO_DNS");
      expect(failed.connections?.map((c) => c.role)).toEqual(["client-dns"]);
    },
  );
  it("真正串联两台控制设备逐台独立执行，无关第三台不生效", () => {
    const { topology, control } = withControl();
    const oldLink = required(required(control.ports[1]).linkId);
    unplug(topology, oldLink);
    const second = addDevice(topology, "access-control");
    connect(topology, control.id, "port2", second.id, "port1");
    connect(topology, second.id, "port2", "d_inet", "port1");
    const spare = addDevice(topology, "access-control");
    spare.accessPolicy = policy([], { defaultAction: "deny" });
    const options = { sourceDeviceId: PC1, domain };
    expect(visitSite(topology, options).verdict).toBe("ok");
    second.accessPolicy = policy([rule({ protocol: "tcp" })]);
    expect(visitSite(topology, options).stoppedAt).toBe(second.id);
    control.accessPolicy = policy([rule({ protocol: "tcp" })]);
    expect(visitSite(topology, options).stoppedAt).toBe(control.id);
    control.accessPolicy.enabled = false;
    second.accessPolicy.enabled = false;
    expect(visitSite(topology, options).verdict).toBe("ok");
  });
  it("路径DNS改写可以访问本地服务器且仍检查真实监听端口", () => {
    const { topology, control } = withControl();
    if (control.type !== "access-control") throw new Error("类型错误");
    const server = addDevice(topology, "server") as ServerDevice;
    Object.assign(server.config, {
      addressMode: "static",
      ip: "192.168.1.30",
      mask: "255.255.255.0",
      gateway: "192.168.1.1",
    });
    connect(topology, server.id, "eth0", R1, "lan2");
    control.config.dnsRewrite = { enabled: true, records: [{ domain, ip: server.config.ip }] };
    const result = visitSite(topology, { sourceDeviceId: PC1, domain });
    expect(result.verdict).toBe("ok");
    expect(result.dns?.originalIp).toBe(targetIp);
    expect(result.dns?.ip).toBe(server.config.ip);
    const connection = required(result.connections?.find((c) => c.role === "direct"));
    const decisions = result.decisions.slice(connection.startSeq - 1, connection.endSeq);
    expect(decisions.some((d) => d.deviceId === server.id && d.action === "answer")).toBe(true);
    expect(decisions.some((d) => d.deviceId === "d_inet")).toBe(false);
    required(server.config.services[0]).enabled = false;
    expect(visitSite(topology, { sourceDeviceId: PC1, domain }).reasonCode).toBe("SERVICE_CLOSED");
  });
  it("入口和出口经过不同控制设备，目标IP不会泄漏到入口连接", () => {
    const { topology, proxy } = withProxy();
    unplug(topology, required(required(device(topology, PC1).ports[0]).linkId));
    const entry = addDevice(topology, "access-control");
    connect(topology, PC1, "eth0", entry.id, "port1");
    connect(topology, entry.id, "port2", R1, "lan1");
    unplug(topology, "l_2");
    const exit = addDevice(topology, "access-control");
    connect(topology, R1, "wan", exit.id, "port1");
    connect(topology, exit.id, "port2", "d_inet", "port1");
    entry.accessPolicy = policy([rule({ destination: targetIp, protocol: "tcp" })]);
    const options = {
      sourceDeviceId: PC1,
      domain,
      proxy: { deviceId: proxy.id, protocol: "http" as const, dnsMode: "proxy" as const },
    };
    const result = visitSite(topology, options);
    expect(result.verdict).toBe("ok");
    const entryConnection = required(result.connections?.find((c) => c.role === "client-proxy"));
    expect(
      result.decisions
        .slice(entryConnection.startSeq - 1, entryConnection.endSeq)
        .some((d) => d.deviceId === entry.id),
    ).toBe(true);
    exit.accessPolicy = policy([rule({ destination: targetIp, protocol: "tcp" })]);
    const rejected = visitSite(topology, options);
    expect(rejected.stoppedAt).toBe(exit.id);
    expect(rejected.connections?.at(-1)?.role).toBe("proxy-target");
  });
  it.each(["http", "connect", "socks5"] as const)(
    "%s 模拟凭据导出导入后仍可验证，错误密码仍然拒绝",
    (protocol) => {
      const { topology, proxy } = withProxy();
      Object.assign(proxy.config.proxy, {
        protocol,
        auth: "password",
        username: "demo-user",
        password: "simulation-only",
      });
      const options = {
        sourceDeviceId: PC1,
        domain,
        proxy: {
          deviceId: proxy.id,
          protocol,
          dnsMode: "proxy" as const,
          username: "demo-user",
          password: "simulation-only",
        },
      };
      const expected = visitSite(topology, options);
      expect(expected.verdict).toBe("ok");
      const parsed = parseTopology(JSON.stringify(topology));
      if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
      expect(visitSite(parsed.topology, options)).toEqual(expected);
      const wrong = visitSite(parsed.topology, {
        ...options,
        proxy: { ...options.proxy, password: "wrong" },
      });
      expect(wrong.reasonCode).toBe("PROXY_AUTH_FAILED");
      expect(wrong.connections?.at(-1)?.role).toBe("proxy-auth");
    },
  );
});
