import { describe, expect, it, vi } from "vitest";
import { createDevice, createEmptyTopology, createLink } from "./defaults";
import { cleanGroups, duplicateDevices, setGroupMembers } from "./groups";
import { isHost } from "./topology";

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing fixture value");
  return value;
}

function fixture() {
  const t = createEmptyTopology();
  for (const type of ["pc", "proxy", "server"] as const)
    t.devices.push(createDevice(type, { x: 100 * t.devices.length, y: 100 }, t));
  const [pc, proxy, server] = t.devices;
  if (!pc || !proxy || !server || !isHost(pc)) throw Error("fixture");
  pc.config.addressMode = "static";
  pc.config.ip = "192.168.1.2";
  pc.config.trafficRouting = {
    enabled: true,
    rules: [
      {
        id: "rule",
        name: "via proxy",
        enabled: true,
        match: "domain",
        target: "example.com",
        port: null,
        proxy: { deviceId: proxy.id, protocol: "http", dnsMode: "client" },
      },
    ],
  };
  const l = createLink(
    { deviceId: pc.id, portId: required(pc.ports[0]).id },
    { deviceId: proxy.id, portId: required(proxy.ports[0]).id },
  );
  l.curve = { source: { x: 10, y: 20 }, target: { x: -20, y: 10 } };
  required(pc.ports[0]).linkId = l.id;
  required(proxy.ports[0]).linkId = l.id;
  t.links.push(l);
  t.groups = [{ id: "g", name: "Office", deviceIds: [pc.id, proxy.id] }];
  t.appearance = { devices: { [pc.id]: "#123456" }, links: { [l.id]: "#abcdef" } };
  return t;
}

describe("copy and groups", () => {
  it("avoids MAC collisions even when the random source repeats", () => {
    const t = fixture();
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const result = duplicateDevices(
        t,
        t.devices.map((d) => d.id),
      );
      const macs = result.topology.devices.flatMap((d) => d.ports.map((p) => p.mac));
      expect(new Set(macs).size).toBe(macs.length);
    } finally {
      random.mockRestore();
    }
  });
  it("copies independent identities, internal links, relative curves, proxy references and colors without changing the source", () => {
    const original = fixture();
    const snapshot = JSON.stringify(original);
    const result = duplicateDevices(
      original,
      original.devices.map((d) => d.id),
    );
    const t = result.topology;
    expect(JSON.stringify(original)).toBe(snapshot);
    expect(new Set(t.devices.map((d) => d.id)).size).toBe(6);
    const ports = t.devices.flatMap((d) => d.ports);
    expect(new Set(ports.map((p) => p.id)).size).toBe(ports.length);
    expect(new Set(ports.map((p) => p.mac)).size).toBe(ports.length);
    expect(ports.every((p) => /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(p.mac))).toBe(true);
    const copy = required(t.devices[3]);
    if (!isHost(copy)) throw Error("host");
    expect(copy.config.ip).toBe("192.168.1.2");
    expect(copy.config.trafficRouting?.rules[0]?.proxy?.deviceId).toBe(result.ids[1]);
    expect(copy.config.trafficRouting?.rules[0]?.id).not.toBe("rule");
    expect(t.links).toHaveLength(2);
    expect(t.links[1]?.curve).toEqual(original.links[0]?.curve);
    expect(copy.ports[0]?.linkId).toBe(t.links[1]?.id);
    expect(t.groups?.[1]?.deviceIds).toEqual(result.ids.slice(0, 2));
    expect(t.appearance?.devices?.[copy.id]).toBe("#123456");
    expect(t.appearance?.links?.[required(t.links[1]).id]).toBe("#abcdef");
  });
  it("does not copy external links or partial groups, preserves external proxy references", () => {
    const original = fixture();
    const t = duplicateDevices(original, [required(original.devices[0]).id]).topology;
    const d = required(t.devices[3]);
    expect(t.links).toHaveLength(1);
    expect(t.groups).toHaveLength(1);
    expect(d.ports.every((p) => p.linkId === null)).toBe(true);
    if (!isHost(d)) throw Error("host");
    expect(d.config.trafficRouting?.rules[0]?.proxy?.deviceId).toBe(original.devices[1]?.id);
  });
  it("regenerates service, access rule and internet target identities", () => {
    const t = fixture();
    const server = required(t.devices[2]);
    if (server.type !== "server") throw Error("server");
    server.config.services = [{ id: "service", name: "HTTP", port: 80, enabled: true }];
    server.accessPolicy = {
      enabled: true,
      defaultAction: "allow",
      stateful: true,
      rules: [
        {
          id: "access",
          name: "a",
          enabled: true,
          action: "allow",
          direction: "any",
          protocol: "any",
          source: "",
          destination: "",
          domain: "",
          port: null,
        },
      ],
    };
    t.devices.push(createDevice("internet", { x: 0, y: 0 }, t));
    const copied = duplicateDevices(
      t,
      t.devices.slice(2).map((d) => d.id),
    ).topology.devices.slice(4);
    const s = required(copied[0]);
    if (s.type !== "server") throw Error("server");
    expect(s.config.services[0]?.id).not.toBe("service");
    expect(s.accessPolicy?.rules[0]?.id).not.toBe("access");
    const net = required(copied[1]);
    const originalNet = required(t.devices[3]);
    if (net.type !== "internet" || originalNet.type !== "internet") throw Error("internet");
    expect(net.config.targets[0]?.id).not.toBe(originalNet.config.targets[0]?.id);
  });
  it("moves members between groups, deduplicates IDs and prunes deleted members", () => {
    const t = fixture();
    required(t.groups).push({ id: "g2", name: "B", deviceIds: [required(t.devices[2]).id] });
    const next = setGroupMembers(t, "g2", [
      required(t.devices[0]).id,
      required(t.devices[0]).id,
      "missing",
    ]);
    expect(next.groups?.[0]?.deviceIds).toEqual([required(t.devices[1]).id]);
    expect(next.groups?.[1]?.deviceIds).toEqual([required(t.devices[0]).id]);
    next.devices = [];
    expect(cleanGroups(next).groups).toEqual([]);
  });
});
