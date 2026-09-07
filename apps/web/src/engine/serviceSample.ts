import {
  createDevice,
  createEmptyTopology,
  createLink,
  type Device,
  type DeviceType,
  type Position,
  type Topology,
} from "@virtual-net/engine";

export const SERVICES_SAMPLE_NAME = "服务与代理示例";
export const SERVICES_SAMPLE_DOMAIN = "app.example";

export function servicesTopology(): Topology {
  const topology = createEmptyTopology(SERVICES_SAMPLE_NAME);
  topology.viewport = { x: 24, y: 24, zoom: 0.85 };
  function add<T extends DeviceType>(type: T, name: string, zone: string, position: Position) {
    const device = createDevice(type, position, topology) as Extract<Device, { type: T }>;
    device.name = name;
    device.zone = zone;
    topology.devices.push(device);
    return device;
  }
  function join(a: Device, aName: string, b: Device, bName: string) {
    const pa = a.ports.find((p) => p.name === aName);
    const pb = b.ports.find((p) => p.name === bName);
    if (!pa || !pb || pa.linkId || pb.linkId) throw new Error("示例接线端口不可用");
    const link = createLink({ deviceId: a.id, portId: pa.id }, { deviceId: b.id, portId: pb.id });
    topology.links.push(link);
    pa.linkId = link.id;
    pb.linkId = link.id;
  }

  const internet = add("internet", "外部网络", "外部网络", { x: 576, y: 32 });
  const control = add("access-control", "出口访问控制", "办公网", { x: 320, y: 32 });
  const router = add("router", "办公网关", "办公网", { x: 64, y: 32 });
  const networkSwitch = add("switch", "接入交换机", "办公网", { x: 272, y: 240 });
  const pc = add("pc", "办公电脑", "办公网", { x: 32, y: 448 });
  const proxy = add("proxy", "SOCKS5 代理", "服务区", { x: 288, y: 448 });
  const server = add("server", "应用与 DNS 服务器", "服务区", { x: 544, y: 448 });

  internet.config.access.dns = "192.0.2.53";
  internet.config.targets = [
    {
      id: "public-dns",
      domain: "dns.public.example",
      ip: "192.0.2.53",
      region: "overseas",
      dnsServer: true,
      reachable: true,
    },
    {
      id: "external-app",
      domain: SERVICES_SAMPLE_DOMAIN,
      ip: "198.51.100.80",
      region: "overseas",
      dnsServer: false,
      reachable: true,
    },
  ];
  for (const [host, ip] of [
    [pc, "192.168.1.10"],
    [proxy, "192.168.1.20"],
    [server, "192.168.1.30"],
  ] as const) {
    host.config.addressMode = "static";
    host.config.ip = ip;
    host.config.mask = "255.255.255.0";
    host.config.gateway = "192.168.1.1";
    host.config.dns = "192.168.1.30";
  }
  server.config.dnsService = {
    enabled: true,
    upstream: "192.0.2.53",
    records: [{ domain: "service.example", ip: server.config.ip }],
  };
  server.config.services = [
    { id: "internal-https", name: "内部应用", port: 443, enabled: true },
    { id: "udp-echo", name: "UDP 回显", port: 7, enabled: true, protocol: "udp" },
  ];
  proxy.config.proxy = {
    enabled: true,
    protocol: "socks5",
    port: 1080,
    auth: "none",
    username: "",
    password: "",
  };
  control.accessPolicy = {
    enabled: true,
    stateful: true,
    defaultAction: "allow",
    rules: [
      {
        id: "restrict-mail",
        name: "限制外部邮件连接",
        enabled: true,
        action: "deny",
        direction: "forward",
        protocol: "tcp",
        source: "",
        destination: "",
        domain: "",
        port: 25,
      },
    ],
  };
  join(router, "wan", control, "port1");
  join(control, "port2", internet, "port1");
  join(router, "lan1", networkSwitch, "port1");
  join(networkSwitch, "port5", pc, "eth0");
  join(networkSwitch, "port6", proxy, "eth0");
  join(networkSwitch, "port7", server, "eth0");
  return topology;
}
