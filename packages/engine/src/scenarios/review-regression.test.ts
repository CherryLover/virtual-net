import { describe, expect, it } from "vitest";
import { dnsQuery } from "../engine/sim/dnsQuery";
import { visitSite } from "../engine/sim/visitSite";
import type { AccessRule, ProxyDevice } from "../model/topology";
import {
  addDevice,
  connect,
  device,
  minimalTopology,
  PC1,
  R1,
  setStatic,
} from "../test-support/fixtures";

const target = "142.250.72.14";
function setup() {
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
const rule = (source: string): AccessRule => ({
  id: "deny-origin",
  name: "source check",
  enabled: true,
  action: "deny",
  direction: "out",
  protocol: "tcp",
  source,
  destination: target,
  domain: "",
  port: null,
});

describe("independent simulation review", () => {
  it("does not invent a TCP listener on a plain PC", () => {
    const topology = minimalTopology();
    const pc = addDevice(topology, "pc");
    setStatic(topology, pc.id, "192.168.1.30", "255.255.255.0", "192.168.1.1");
    connect(topology, pc.id, "eth0", R1, "lan2");
    expect(
      visitSite(topology, { sourceDeviceId: PC1, domain: "192.168.1.30", port: 65535 }).reasonCode,
    ).toBe("SERVICE_CLOSED");
  });
  it("evaluates the proxy's own source address for its outbound connection", () => {
    const { topology, proxy } = setup();
    proxy.accessPolicy = {
      enabled: true,
      stateful: true,
      defaultAction: "allow",
      rules: [rule("192.168.1.20")],
    };
    const options = {
      sourceDeviceId: PC1,
      domain: target,
      proxy: { deviceId: proxy.id, protocol: "http" as const, dnsMode: "proxy" as const },
    };
    expect(visitSite(topology, options).reasonCode).toBe("ACCESS_DENIED");
    proxy.accessPolicy.rules = [rule("192.168.1.10")];
    const result = visitSite(topology, options);
    expect(result.verdict).toBe("ok");
    const outgoing = result.connections?.find((c) => c.role === "proxy-target");
    expect(outgoing).toBeDefined();
    const steps = result.decisions.slice((outgoing?.startSeq ?? 1) - 1, outgoing?.endSeq);
    expect(
      steps.some((d) => d.deviceId === proxy.id && d.packetOut?.srcIp === "192.168.1.20"),
    ).toBe(true);
    expect(result.decisions.at(-1)?.deviceId).toBe(PC1);
  });
  it("DNS replies preserve the address originally queried on a multi-interface router", () => {
    const topology = minimalTopology();
    const router = device(topology, R1);
    if (router.type !== "router") throw new Error("router missing");
    router.config.vlans = [
      {
        id: 20,
        ip: "192.168.20.1",
        mask: "255.255.255.0",
        dhcp: {
          enabled: false,
          rangeStart: "192.168.20.100",
          rangeEnd: "192.168.20.199",
          leaseHours: 24,
        },
      },
    ];
    setStatic(topology, PC1, "192.168.1.10", "255.255.255.0", "192.168.1.1", "192.168.20.1");
    const result = dnsQuery(topology, { sourceDeviceId: PC1, domain: "www.google.com" });
    expect(result.verdict, result.reason ?? "").toBe("ok");
    expect(result.dns?.ip).toBe(target);
    expect(
      result.decisions.some(
        (d) =>
          d.deviceId === R1 &&
          d.action === "answer" &&
          d.packetOut?.srcIp === "192.168.20.1" &&
          d.packetOut.dstIp === "192.168.1.10",
      ),
    ).toBe(true);
  });
});
