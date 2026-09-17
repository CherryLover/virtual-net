import { nodeSubtitle } from "../canvas/nodes/subtitle";
import { DEVICE_LABELS, type Device, type Runtime, type Topology } from "../engine";

export interface DeviceSearchResult {
  id: string;
  type: Device["type"];
  name: string;
  description: string;
  groups: string;
}

function configuredAddresses(device: Device): string[] {
  switch (device.type) {
    case "pc":
    case "proxy":
    case "server":
      return device.config.addressMode === "static" ? [device.config.ip] : [];
    case "router":
      return [
        device.config.lan.ip,
        ...(device.config.vlans ?? []).map((vlan) => vlan.ip),
        ...(device.config.wan.mode === "static" ? [device.config.wan.static?.ip ?? ""] : []),
      ];
    case "modem":
      return device.config.mode === "route" ? [device.config.lan.ip] : [];
    case "internet":
      return [device.config.access.ip, ...device.config.targets.map((target) => target.ip)];
    default:
      return [];
  }
}

export function searchDevices(
  topology: Topology,
  runtime: Runtime,
  query: string,
  display: (text: string) => string,
): DeviceSearchResult[] {
  const term = query.trim().toLocaleLowerCase();
  return topology.devices
    .map((device): DeviceSearchResult => {
      const addresses = [
        ...new Set(
          [
            ...runtime.interfaces
              .filter((iface) => iface.deviceId === device.id)
              .map((iface) => iface.ip),
            ...configuredAddresses(device),
          ].filter(Boolean),
        ),
      ];
      return {
        id: device.id,
        type: device.type,
        name: display(device.name),
        description: display(
          `${DEVICE_LABELS[device.type]} · ${addresses.join(" · ") || nodeSubtitle(device, runtime) || "无地址"}`,
        ),
        groups: display(
          (topology.groups ?? [])
            .filter((group) => group.deviceIds.includes(device.id))
            .map((group) => group.name)
            .join(" · "),
        ),
      };
    })
    .filter((result) =>
      [result.name, result.description, result.groups].some((text) =>
        text.toLocaleLowerCase().includes(term),
      ),
    );
}
