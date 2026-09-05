/**
 * 透明设备到访（CP2 关键设计 2.3 E）：交换机、AP、桥接光猫、路由器 LAN 网桥。
 * 沿 `segmentOf` 算出的二层路径逐台设备产出一条 decision：学习源 MAC、查表、泛洪或命中。
 */

import type { DecisionPhase, PacketSummary } from "../../model/probe";
import type { Device, Port } from "../../model/topology";
import { portSupportsVlan, vlanMembership, vlanOf } from "../../model/vlan";
import { bridgePortsOf, type L2Path, type L2Step } from "../runtime/segment";
import type { MacTable, Runtime } from "../runtime/types";
import type { DecisionLog } from "./decision";

export interface L2Delivery {
  deviceId: string;
  portId: string;
  packet: PacketSummary;
}

function vlanKey(vlan: number | null): string {
  return vlan === null ? "-" : String(vlan);
}

function tableOf(runtime: Runtime, deviceId: string, vlan: number | null): Record<string, string> {
  let device: MacTable | undefined = runtime.mac[deviceId];
  if (!device) {
    device = {};
    runtime.mac[deviceId] = device;
  }
  const key = vlanKey(vlan);
  let table = device[key];
  if (!table) {
    table = {};
    device[key] = table;
  }
  return table;
}

/** 端口在这个 VLAN 里有没有成员资格 */
function memberOf(device: Device, port: Port, vlan: number | null): boolean {
  if (!portSupportsVlan(device.type, port.name)) return true;
  if (vlan === null) return true;
  return vlanMembership(vlanOf(port)).includes(vlan);
}

function portModeOf(device: Device, port: Port): "access" | "trunk" | "plain" {
  if (!portSupportsVlan(device.type, port.name)) return "plain";
  return vlanOf(port).mode;
}

function tagText(vlan: number | null, wireVlan: number | null): string {
  if (vlan === null) return "";
  return wireVlan === null ? `（VLAN ${vlan}）` : `（VLAN ${vlan} 带标签）`;
}

/** 沿二层路径把帧送到对端，每台透明设备记一条 decision */
export function deliverFrame(opts: {
  runtime: Runtime;
  log: DecisionLog;
  phase: DecisionPhase;
  path: L2Path;
  packet: PacketSummary;
}): L2Delivery {
  const { runtime, log, phase, path } = opts;
  let packet = opts.packet;

  for (const step of path.steps) {
    const device = runtime.topology.devices.find((d) => d.id === step.deviceId);
    if (!device) break;
    const portIn = device.ports.find((p) => p.id === step.portIn);
    const portOut = device.ports.find((p) => p.id === step.portOut);
    if (!portIn || !portOut) break;

    const packetIn: PacketSummary = { ...packet, vlan: step.wireVlanIn };
    const packetOut: PacketSummary = { ...packet, vlan: step.wireVlanOut };

    // 学习
    const table = tableOf(runtime, device.id, step.vlan);
    table[packetIn.srcMac] = step.portIn;

    // 查表
    const hit = table[packetIn.dstMac];
    const lookup: "hit" | "flood" = hit ? "hit" : "flood";
    const bridge = bridgePortsOf(device, step.portIn) ?? [];
    const floodPorts = bridge
      .filter((p) => p.id !== step.portIn && p.linkId && memberOf(device, p, step.vlan))
      .map((p) => p.id);

    const noteParts: string[] = [];
    if (device.type === "router" || device.type === "modem") noteParts.push("二层转发，未路由");
    noteParts.push(`学习 ${packetIn.srcMac} 在 ${portIn.name}`);
    if (lookup === "hit") {
      noteParts.push("查表命中");
    } else {
      const names = bridge
        .filter((p) => floodPorts.includes(p.id))
        .map((p) => p.name)
        .join(" ");
      noteParts.push(`查表未命中，泛洪到 ${names || "（无其他端口）"}`);
    }
    noteParts.push(`从 ${portOut.name} 发出${tagText(step.vlan, step.wireVlanOut)}`);

    log.pass({
      phase,
      deviceId: device.id,
      action: "forward",
      portIn: step.portIn,
      portOut: step.portOut,
      linkId: step.linkId,
      packetIn,
      packetOut,
      basis: {
        route: null,
        mac: {
          learned: { mac: packetIn.srcMac, portId: step.portIn },
          lookup,
          ...(lookup === "flood" ? { floodPorts } : {}),
        },
        vlan: {
          id: step.vlan,
          in: portModeOf(device, portIn),
          out: portModeOf(device, portOut),
        },
      },
      note: noteParts.join("，"),
    });
    packet = packetOut;
  }

  return {
    deviceId: path.arriveDeviceId,
    portId: path.arrivePortId,
    packet: { ...packet, vlan: path.arriveWireVlan },
  };
}

/** 二层路径最后一跳之前的透明设备，L2_LOOP 停在这里 */
export function firstTransparentOf(runtime: Runtime, portId: string): Port | null {
  const peer = runtime.topology.links
    .map((link) => (link.a.portId === portId ? link.b : link.b.portId === portId ? link.a : null))
    .find((end) => end !== null);
  if (!peer) return null;
  const device = runtime.topology.devices.find((d) => d.id === peer.deviceId);
  return device?.ports.find((p) => p.id === peer.portId) ?? null;
}

export type { L2Step };
