import { describe, expect, it } from "vitest";
import { createDevice, emptyTopology, sampleTopology } from "../engine";
import { servicesTopology } from "../engine/serviceSample";
import { checkImport, IMPORT_LIMITS } from "./check";

const file = (value: unknown) => {
  const text = JSON.stringify(value);
  return { size: new TextEncoder().encode(text).length, text: async () => text };
};
describe("import inspection", () => {
  it("accepts ordinary JSON without trusting filename or MIME", async () => {
    const topology = sampleTopology();
    const result = await checkImport(file(topology));
    expect(result.topology).toEqual(topology);
    expect(result.steps.every((step) => ["通过", "有提醒"].includes(step.status))).toBe(true);
  });
  it.each([
    [{ size: 0, text: async () => "" }, 0],
    [{ size: 3, text: async () => "   " }, 0],
    [
      {
        size: 1,
        text: async () => {
          throw Error();
        },
      },
      0,
    ],
    [{ size: IMPORT_LIMITS.bytes + 1, text: async () => "{}" }, 0],
    [{ size: 1, text: async () => "<html>" }, 1],
    [file({ ...emptyTopology(), version: 0 }), 1],
    [file({ ...emptyTopology(), version: 999 }), 1],
    [file({ kind: "learning-backup", ...emptyTopology() }), 1],
    [file({ ...emptyTopology(), devices: Array(201).fill({}) }), 1],
    [file({ ...emptyTopology(), links: Array(501).fill({}) }), 1],
  ])("blocks unreadable/unsupported files and skips dependent steps %#", async (input, index) => {
    const result = await checkImport(input);
    expect(result.topology).toBeNull();
    expect(result.steps[index]?.status).toBe("无法继续");
    expect(result.steps.slice(index + 1).every((step) => step.status === "未执行")).toBe(true);
  });
  it("collects same-step structural errors without replacing original values", async () => {
    const raw = sampleTopology();
    const a = raw.devices[0];
    const b = raw.devices[1];
    if (!a || !b) throw Error();
    b.id = a.id;
    a.name = 1 as unknown as string;
    const result = await checkImport(file(raw));
    expect(result.topology).toBeNull();
    expect(result.steps[2]?.issues.length).toBeGreaterThanOrEqual(2);
  });
  it("keeps invalid static addresses as editable warnings", async () => {
    const raw = sampleTopology();
    const pc = raw.devices.find((device) => device.type === "pc");
    if (!pc) throw Error();
    pc.config.addressMode = "static";
    pc.config.ip = "broken-address";
    pc.config.gateway = "bad-gateway";
    const result = await checkImport(file(raw));
    expect(result.topology).toEqual(raw);
    expect(
      result.steps.flatMap((step) => step.issues).some((issue) => issue.severity === "warning"),
    ).toBe(true);
  });
  it("keeps malformed DNS address and numeric service port editable", async () => {
    const raw = servicesTopology();
    const server = raw.devices.find((device) => device.type === "server");
    if (!server) throw Error();
    server.config.dnsService.upstream = "invalid";
    if (server.config.services[0]) server.config.services[0].port = 99999;
    const result = await checkImport(file(raw));
    expect(result.topology).toEqual(raw);
    expect(result.steps[2]?.status).toBe("有提醒");
  });
  it("rejects dangling connections and group membership", async () => {
    const raw = sampleTopology();
    if (raw.links[0]) raw.links[0].a.portId = "missing";
    raw.groups = [{ id: "group", name: "group", deviceIds: ["missing"] }];
    const result = await checkImport(file(raw));
    expect(result.topology).toBeNull();
    expect(result.steps[3]?.status).toBe("无法继续");
  });
  it("accepts intentionally unconnected device rather than requiring connectivity", async () => {
    const raw = emptyTopology();
    raw.devices.push(createDevice("pc", { x: 0, y: 0 }, raw));
    expect((await checkImport(file(raw))).topology).toEqual(raw);
  });
  it("does not include simulated passwords in error messages or locations", async () => {
    const raw = servicesTopology();
    const proxy = raw.devices.find((device) => device.type === "proxy");
    if (!proxy) throw Error();
    proxy.config.proxy.password = "do-not-show-this";
    proxy.name = "do-not-show-this";
    proxy.config.proxy.port = "wrong" as unknown as number;
    const result = await checkImport(file(raw));
    expect(result.topology).toBeNull();
    expect(JSON.stringify(result.steps)).not.toContain("do-not-show-this");
  });
  it.each(["missing", "non-proxy"])(
    "blocks a routing rule referencing %s device without dropping the rule",
    async (target) => {
      const raw = servicesTopology();
      const pc = raw.devices.find((device) => device.type === "pc");
      if (!pc) throw Error();
      pc.config.trafficRouting = {
        enabled: false,
        rules: [
          {
            id: "route",
            name: "保留规则",
            enabled: false,
            match: "domain",
            target: "example.com",
            port: null,
            proxy: {
              deviceId: target === "missing" ? "missing" : pc.id,
              protocol: "http",
              dnsMode: "client",
            },
          },
        ],
      };
      const before = structuredClone(raw);
      const result = await checkImport(file(raw));
      expect(result.topology).toBeNull();
      expect(result.steps[3]?.status).toBe("无法继续");
      expect(result.steps[3]?.issues[0]?.path).toContain("proxy.deviceId");
      expect(raw).toEqual(before);
    },
  );
  it("benchmarks maximum device count without truncation", async () => {
    const raw = emptyTopology();
    for (let i = 0; i < IMPORT_LIMITS.devices; i++)
      raw.devices.push(createDevice("pc", { x: i * 160, y: 0 }, raw));
    const start = performance.now();
    const result = await checkImport(file(raw));
    expect(result.topology?.devices).toHaveLength(IMPORT_LIMITS.devices);
    expect(performance.now() - start).toBeLessThan(5000);
  });
});
