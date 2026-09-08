import { makeId } from "./defaults";
import { isHost, type Topology } from "./topology";

const identity = () => makeId("copy-");
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function mapped(ids: Map<string, string>, id: string): string {
  const result = ids.get(id);
  if (!result) throw new Error(`Missing copied identity: ${id}`);
  return result;
}

/** Copy only selected devices and their internal links; references outside the selection remain unchanged. */
export function duplicateDevices(
  topology: Topology,
  selected: string[],
): { topology: Topology; ids: string[] } {
  const next = clone(topology);
  const wanted = new Set(selected);
  const originals = topology.devices.filter((d) => wanted.has(d.id));
  const devices = clone(originals);
  const deviceIds = new Map(originals.map((d) => [d.id, identity()]));
  const portIds = new Map(
    originals.flatMap((d) => d.ports.map((p) => [p.id, identity()] as const)),
  );
  const macs = new Set(topology.devices.flatMap((d) => d.ports.map((p) => p.mac.toLowerCase())));
  const freshMac = () => {
    let mac: string;
    let value = Math.floor(Math.random() * 0x10000000000);
    do {
      mac = `02:${value.toString(16).padStart(10, "0").match(/../g)?.join(":")}`;
      value = (value + 1) % 0x10000000000;
    } while (macs.has(mac));
    macs.add(mac);
    return mac;
  };
  for (const d of devices) {
    const originalId = d.id;
    d.id = mapped(deviceIds, d.id);
    d.name += " 副本";
    d.position = { x: d.position.x + 48, y: d.position.y + 48 };
    for (const p of d.ports) {
      p.id = mapped(portIds, p.id);
      p.mac = freshMac();
      p.linkId = null;
    }
    for (const rule of d.accessPolicy?.rules ?? []) rule.id = identity();
    if (isHost(d))
      for (const rule of d.config.trafficRouting?.rules ?? []) {
        rule.id = identity();
        if (rule.proxy)
          rule.proxy.deviceId = deviceIds.get(rule.proxy.deviceId) ?? rule.proxy.deviceId;
      }
    if (d.type === "server") for (const service of d.config.services) service.id = identity();
    if (d.type === "internet") for (const target of d.config.targets) target.id = identity();
    if (next.appearance?.devices && Object.hasOwn(next.appearance.devices, originalId)) {
      const color = next.appearance.devices[originalId];
      if (color !== undefined) next.appearance.devices[d.id] = color;
    }
  }
  const links = clone(
    topology.links.filter((l) => deviceIds.has(l.a.deviceId) && deviceIds.has(l.b.deviceId)),
  );
  for (const link of links) {
    const originalId = link.id;
    link.id = identity();
    for (const end of [link.a, link.b]) {
      end.deviceId = mapped(deviceIds, end.deviceId);
      end.portId = mapped(portIds, end.portId);
      const port = devices
        .find((d) => d.id === end.deviceId)
        ?.ports.find((p) => p.id === end.portId);
      if (!port) throw new Error(`Missing copied port: ${end.portId}`);
      port.linkId = link.id;
    }
    if (next.appearance?.links && Object.hasOwn(next.appearance.links, originalId)) {
      const color = next.appearance.links[originalId];
      if (color !== undefined) next.appearance.links[link.id] = color;
    }
  }
  if (next.groups)
    next.groups.push(
      ...(topology.groups ?? [])
        .filter((g) => g.deviceIds.every((id) => deviceIds.has(id)))
        .map((g) => ({
          id: identity(),
          name: `${g.name} 副本`,
          deviceIds: g.deviceIds.map((id) => mapped(deviceIds, id)),
        })),
    );
  next.devices.push(...devices);
  next.links.push(...links);
  return { topology: next, ids: devices.map((d) => d.id) };
}

export function cleanGroups(topology: Topology): Topology {
  if (!topology.groups) return topology;
  const live = new Set(topology.devices.map((d) => d.id));
  return {
    ...topology,
    groups: topology.groups
      .map((g) => ({ ...g, deviceIds: g.deviceIds.filter((id) => live.has(id)) }))
      .filter((g) => g.deviceIds.length > 0),
  };
}

export function setGroupMembers(topology: Topology, groupId: string, ids: string[]): Topology {
  if (!topology.groups?.some((g) => g.id === groupId)) return topology;
  const live = new Set(topology.devices.map((d) => d.id));
  const members = [...new Set(ids)].filter((id) => live.has(id));
  return {
    ...topology,
    groups: (topology.groups ?? [])
      .map((g) => ({
        ...g,
        deviceIds: g.id === groupId ? members : g.deviceIds.filter((id) => !members.includes(id)),
      }))
      .filter((g) => g.deviceIds.length > 0),
  };
}
