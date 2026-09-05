/**
 * 一个包在拓扑里的完整走法（CP1 关键设计 2.2 的 A / B / C / D）。
 * 每到访一台设备记一条 decision，每条 decision 最多跨一根连线。
 */

import { inSubnet, isPrivate, subnetLabel } from "../../model/address";
import type {
  Decision,
  DecisionPhase,
  FixAt,
  L4Summary,
  PacketSummary,
  Protocol,
} from "../../model/probe";
import type { Device, InternetTarget, Topology } from "../../model/topology";
import { BROADCAST_MAC, isL3Router, peerEnd } from "../../model/topology";
import { lanInterfacesOf } from "../runtime/interfaces";
import { lookupRoutes } from "../runtime/routes";
import type { L2Loop, L2Path } from "../runtime/segment";
import type { L3Interface, Route, Runtime } from "../runtime/types";
import { findUpstream, upstreamLabel } from "../runtime/wan";
import { resolveArp } from "./arp";
import { DecisionLog } from "./decision";
import {
  DNS_PORT,
  FIRST_EPHEMERAL_PORT,
  HTTPS_PORT,
  ICMP_ID,
  INITIAL_TTL,
  isDnsQuery,
  isEchoRequest,
  MAX_HOPS,
  makePacket,
  sessionPortOf,
} from "./frame";
import { deliverFrame } from "./l2";
import { leaseFailureText, type StopInfo, stopText } from "./messages";
import { natInbound, natOutbound } from "./nat";

/** 一帧在路上：要送到哪台设备的哪个端口 */
interface Hop {
  deviceId: string;
  portId: string;
  packet: PacketSummary;
  isReply: boolean;
}

/** 等待应答的发起方：probe 起点，或做 DNS 转发的路由器 */
interface Pending {
  kind: "probe" | "forwarder";
  deviceId: string;
  sent: PacketSummary;
  /** forwarder 才有：客户端那次查询，用来回包 */
  clientQuery?: PacketSummary;
  clientPortId?: string;
}

export interface FlowStop {
  stop: StopInfo;
  deviceId: string;
  fixAt: FixAt | null;
}

export interface FlowResult {
  ok: boolean;
  /** DNS 阶段解析到的地址 */
  answerIp?: string;
}

export class Walk {
  readonly log = new DecisionLog();
  private readonly topology: Topology;
  private ephemeral = FIRST_EPHEMERAL_PORT;
  private pending: Pending[] = [];
  /** 路径上「从 wan 发出且 NAT 关闭」的路由器，NO_RETURN_ROUTE 用它定位 */
  private natOffRouters: string[] = [];
  private phase: DecisionPhase = "icmp";
  private domain = "";
  private originDeviceId = "";
  stopped: FlowStop | null = null;
  private answerIp = "";

  constructor(private readonly runtime: Runtime) {
    this.topology = runtime.topology;
  }

  get decisions(): Decision[] {
    return this.log.entries;
  }

  // ---------- 小工具 ----------

  private device(deviceId: string): Device {
    const found = this.topology.devices.find((d) => d.id === deviceId);
    if (!found) throw new Error(`拓扑里没有设备 ${deviceId}`);
    return found;
  }

  private name(deviceId: string): string {
    return this.device(deviceId).name;
  }

  private portName(portId: string): string {
    for (const device of this.topology.devices) {
      const port = device.ports.find((p) => p.id === portId);
      if (port) return port.name;
    }
    return portId;
  }

  private linkIdOf(portId: string): string | null {
    for (const device of this.topology.devices) {
      const port = device.ports.find((p) => p.id === portId);
      if (port) return port.linkId;
    }
    return null;
  }

  /** 二层路径上第一台设备（L2_LOOP 停在这里） */
  private firstHopOf(portId: string): { deviceId: string; portId: string } | null {
    const peer = peerEnd(this.topology, portId);
    return peer ? { deviceId: peer.deviceId, portId: peer.portId } : null;
  }

  private loopStop(loop: L2Loop): StopInfo {
    const names: string[] = [];
    const parts: string[] = [];
    for (const linkId of loop.linkIds) {
      const link = this.topology.links.find((l) => l.id === linkId);
      if (!link) continue;
      const a = `${this.name(link.a.deviceId)} ${this.portName(link.a.portId)}`;
      const b = `${this.name(link.b.deviceId)} ${this.portName(link.b.portId)}`;
      parts.push(`${a} – ${b}`);
      for (const id of [link.a.deviceId, link.b.deviceId]) {
        if (!names.includes(this.name(id))) names.push(this.name(id));
      }
    }
    return stopText.l2Loop(names[0] ?? "设备", names[1] ?? "设备", parts.join("、"));
  }

  /** 上游是谁，PPPOE_REJECTED 文案用 */
  private upstreamNameOf(deviceId: string): string {
    const wanIface = this.runtime.ifaceOf(deviceId, "wan");
    if (!wanIface) return "上游";
    const env = {
      topology: this.topology,
      index: this.runtime.index,
      interfaces: this.runtime.interfaces,
      take: () => undefined,
    };
    return upstreamLabel(findUpstream(env, wanIface));
  }

  private ownInterfaces(deviceId: string): L3Interface[] {
    return this.runtime.interfaces.filter((i) => i.deviceId === deviceId);
  }

  private targetOf(device: Device, ip: string): InternetTarget | null {
    if (device.type !== "internet") return null;
    return device.config.targets.find((t) => t.ip === ip) ?? null;
  }

  private nextEphemeral(): number {
    const port = this.ephemeral;
    this.ephemeral += 1;
    return port;
  }

  private fail(
    deviceId: string,
    stop: StopInfo,
    input: Parameters<DecisionLog["stop"]>[0],
    fixAt: FixAt | null = null,
  ): null {
    this.log.stop(input, stop);
    this.stopped = { stop, deviceId, fixAt };
    return null;
  }

  // ---------- A / C / D 共用的「查路由 → ARP → 发出」 ----------

  private send(opts: {
    deviceId: string;
    action: "originate" | "forward" | "answer";
    dstIp: string;
    proto: Protocol;
    l4: L4Summary;
    ttl: number;
    portIn: string | null;
    packetIn: PacketSummary | null;
    /** 源地址；不给就取出接口地址 */
    srcIp?: string;
    basis?: Decision["basis"];
    note: (ctx: { route: Route; iface: L3Interface; nextHop: string; arpMac: string }) => string;
    /** NAT 出向改写在选好出接口后做 */
    natOut?: boolean;
  }): Hop | null {
    const { deviceId } = opts;
    const device = this.device(deviceId);
    const base = {
      phase: this.phase,
      deviceId,
      action: opts.action,
      portIn: opts.portIn,
      packetIn: opts.packetIn,
      basis: opts.basis ?? {},
      note: "",
    };

    const routes = lookupRoutes(this.runtime.routes[deviceId] ?? [], opts.dstIp);
    const route = routes[0];
    if (!route) {
      if (device.type === "pc") {
        const eth0 = this.runtime.ifaceOf(deviceId, "eth0");
        const subnet = eth0?.ip ? subnetLabel(eth0.ip, eth0.mask) : "本机网段";
        return this.fail(
          deviceId,
          stopText.noGateway(opts.dstIp, subnet),
          { ...base, note: "没有默认路由，包发不出去" },
          { deviceId, field: "gateway" },
        );
      }
      const wanLease = this.runtime.leaseOf(deviceId, "wan");
      if (wanLease?.status === "pppoe-required") {
        return this.fail(
          deviceId,
          stopText.pppoeRequired(device.name),
          { ...base, note: "上游要求拨号，WAN 没拿到地址" },
          { deviceId, field: "wan.mode" },
        );
      }
      if (wanLease?.status === "pppoe-rejected") {
        return this.fail(
          deviceId,
          stopText.pppoeRejected(device.name, this.upstreamNameOf(deviceId)),
          { ...base, note: "上游不接受拨号，WAN 没拿到地址" },
          { deviceId, field: "wan.mode" },
        );
      }
      return this.fail(
        deviceId,
        stopText.noRoute(device.name, opts.dstIp),
        { ...base, note: "路由表里没有能匹配的条目" },
        { deviceId, portId: device.ports.find((p) => p.name === "wan")?.id },
      );
    }
    if (route.wanLanOverlap) {
      const wan = this.runtime.ifaceOf(deviceId, "wan");
      const lan = lanInterfacesOf(this.runtime.interfaces, deviceId).find(
        (i) => i.ip && i.mask && wan?.ip && inSubnet(wan.ip, i.ip, i.mask),
      );
      return this.fail(
        deviceId,
        stopText.wanLanOverlap(wan?.ip ?? "", lan ? subnetLabel(lan.ip, lan.mask) : "LAN 网段"),
        {
          ...base,
          basis: { ...base.basis, route: routeBasis(route) },
          note: "WAN 与 LAN 网段重叠，转发不了",
        },
        { deviceId, field: "lan.ip" },
      );
    }
    if (route.kind === "default" && route.viaOffSubnet) {
      const iface = this.runtime.ifaceOf(deviceId, route.iface);
      const subnet = iface?.ip ? subnetLabel(iface.ip, iface.mask) : "本机网段";
      return this.fail(
        deviceId,
        stopText.gatewayOffSubnet(route.via ?? "", subnet),
        {
          ...base,
          basis: { ...base.basis, route: routeBasis(route) },
          note: "网关与本机不在同一网段，ARP 都问不出去",
        },
        { deviceId, field: "gateway" },
      );
    }

    const iface = this.runtime.ifaceOf(deviceId, route.iface);
    if (!iface) {
      return this.fail(
        deviceId,
        stopText.noRoute(device.name, opts.dstIp),
        { ...base, note: "路由指向的接口不存在" },
        null,
      );
    }

    const nextHop = route.via ?? opts.dstIp;
    const arp = resolveArp(this.runtime, deviceId, iface.name, nextHop);
    if (arp.kind === "unlinked") {
      return this.fail(
        deviceId,
        stopText.portUnlinked(device.name, this.portName(arp.portId)),
        { ...base, basis: { ...base.basis, route: routeBasis(route) }, note: "出接口没有连线" },
        null,
      );
    }
    if (arp.kind === "loop") {
      const first = this.firstHopOf(iface.portIds.find((id) => this.linkIdOf(id)) ?? "");
      const stop = this.loopStop(arp.loop);
      return this.fail(
        first?.deviceId ?? deviceId,
        stop,
        {
          phase: this.phase,
          deviceId: first?.deviceId ?? deviceId,
          action: "forward",
          portIn: first?.portId ?? null,
          note: "同一个 VLAN 里有两条二层路径，广播风暴",
        },
        null,
      );
    }
    if (arp.kind === "vlan") {
      const dropDevice = this.name(arp.drop.deviceId);
      const dropPort = this.portName(arp.drop.portId);
      const stop =
        arp.drop.cause === "access-pvid" && arp.targetIface
          ? stopText.vlanIsolated(
              nextHop,
              this.name(arp.targetIface.deviceId),
              arp.targetVlan,
              arp.ownVlan,
            )
          : arp.drop.cause === "trunk-not-allowed"
            ? stopText.trunkNotAllowed(dropDevice, dropPort, arp.ownVlan ?? arp.targetVlan)
            : stopText.vlanTagDropped(arp.ownVlan ?? arp.targetVlan, dropDevice, dropPort);
      return this.fail(
        deviceId,
        stop,
        {
          ...base,
          basis: {
            ...base.basis,
            route: routeBasis(route),
            arp: { ip: nextHop, mac: null, hit: false },
            vlan: { id: arp.ownVlan, dropAt: arp.drop },
          },
          note: "VLAN 把两边隔开了，ARP 问不到对方",
        },
        { deviceId: arp.drop.deviceId, portId: arp.drop.portId },
      );
    }
    if (arp.kind === "miss") {
      return this.fail(
        deviceId,
        stopText.arpMiss(nextHop, route.via ? "网关" : "目标"),
        {
          ...base,
          basis: {
            ...base.basis,
            route: routeBasis(route),
            arp: { ip: nextHop, mac: null, hit: false },
          },
          note: "ARP 问不到下一跳的 MAC",
        },
        null,
      );
    }

    let srcIp = opts.srcIp ?? iface.ip;
    const l4: L4Summary = { ...opts.l4 };
    let natBasis = opts.basis?.nat ?? null;
    let natNote = "";
    if (opts.natOut && isL3Router(device) && iface.name === "wan") {
      const natOn = device.type === "router" ? device.config.nat : true;
      const fromLan = lanInterfacesOf(this.runtime.interfaces, deviceId).some(
        (lan) => lan.ip && lan.mask && inSubnet(srcIp, lan.ip, lan.mask),
      );
      if (fromLan && natOn) {
        const probe = makePacket({
          srcMac: iface.mac,
          dstMac: arp.mac,
          srcIp,
          dstIp: opts.dstIp,
          proto: opts.proto,
          l4,
        });
        const session = natOutbound(this.runtime, deviceId, probe, iface.ip);
        natBasis = {
          direction: "out",
          before: { ip: srcIp, port: sessionPortOf(probe, "src") },
          after: { ip: session.outer.ip, port: session.outer.port },
        };
        natNote = `NAT 源地址转换：${srcIp} → ${session.outer.ip}`;
        srcIp = session.outer.ip;
        if (opts.proto === "icmp") l4.icmpId = session.outer.port;
        else l4.srcPort = session.outer.port;
      } else if (fromLan && !natOn) {
        this.natOffRouters.push(deviceId);
        natNote = `NAT 关闭，源地址保持 ${srcIp} 出网`;
      }
    }

    const packetOut = makePacket({
      srcMac: iface.mac,
      dstMac: arp.mac,
      srcIp,
      dstIp: opts.dstIp,
      proto: opts.proto,
      l4,
      ttl: opts.ttl,
    });
    packetOut.vlan = arp.path.egressWireVlan;
    const noteParts = [opts.note({ route, iface, nextHop, arpMac: arp.mac })];
    const inVlan = opts.portIn
      ? (this.runtime.ifaceForFrame(opts.portIn, opts.packetIn?.vlan ?? null)?.vlan ?? null)
      : null;
    if (inVlan !== null || iface.vlan !== null) {
      noteParts.push(`VLAN ${inVlan ?? "-"} → VLAN ${iface.vlan ?? "-"}`);
    }
    if (natNote) noteParts.push(natNote);
    if (arp.conflict) noteParts.push(`地址冲突：网段里不止一台设备使用 ${nextHop}`);

    this.log.pass({
      ...base,
      portOut: arp.path.egressPortId,
      linkId: arp.path.egressLinkId,
      packetOut,
      basis: {
        ...base.basis,
        route: routeBasis(route),
        arp: { ip: nextHop, mac: arp.mac, hit: true },
        nat: natBasis,
        ...(arp.path.vlan !== null || arp.path.egressWireVlan !== null
          ? { vlan: { id: arp.path.vlan } }
          : {}),
      },
      note: noteParts.join("；"),
    });

    return this.crossPath(arp.path, packetOut, opts.action === "answer");
  }

  /** 沿二层路径穿过透明设备，返回落到对端三层设备上的那一跳 */
  private crossPath(path: L2Path, packet: PacketSummary, isReply: boolean): Hop | null {
    const arrival = deliverFrame({
      runtime: this.runtime,
      log: this.log,
      phase: this.phase,
      path,
      packet,
    });
    if (!arrival.deviceId || !arrival.portId) return null;
    return {
      deviceId: arrival.deviceId,
      portId: arrival.portId,
      packet: arrival.packet,
      isReply,
    };
  }

  // ---------- A 起点发出 ----------

  private originate(opts: {
    deviceId: string;
    dstIp: string;
    proto: Protocol;
    l4: L4Summary;
    packetIn?: PacketSummary | null;
    portIn?: string | null;
    basis?: Decision["basis"];
    note?: string;
  }): Hop | null {
    const device = this.device(opts.deviceId);
    if (device.type === "pc") {
      const eth0 = this.runtime.ifaceOf(opts.deviceId, "eth0");
      if (!eth0?.ip) {
        const why =
          device.config.addressMode === "dhcp"
            ? `自动获取失败，${leaseFailureText(this.runtime.leaseOf(opts.deviceId, "eth0")?.status ?? "no-server")}`
            : "未填写地址";
        return this.fail(
          opts.deviceId,
          stopText.noIp(device.name, why),
          {
            phase: this.phase,
            deviceId: opts.deviceId,
            action: "originate",
            portIn: opts.portIn ?? null,
            packetIn: opts.packetIn ?? null,
            note: "没有地址就没有路由表，包发不出去",
          },
          null,
        );
      }
    }

    const hop = this.send({
      deviceId: opts.deviceId,
      action: "originate",
      dstIp: opts.dstIp,
      proto: opts.proto,
      l4: opts.l4,
      ttl: INITIAL_TTL,
      portIn: opts.portIn ?? null,
      packetIn: opts.packetIn ?? null,
      basis: opts.basis,
      note: ({ route, nextHop, iface }) =>
        opts.note ??
        (route.kind === "default"
          ? `命中默认路由，交给网关 ${nextHop}`
          : `目标在直连网段 ${subnetLabel(iface.ip, iface.mask)}，直接发给它`),
    });
    return hop;
  }

  // ---------- 主循环 ----------

  run(opts: {
    phase: DecisionPhase;
    originDeviceId: string;
    dstIp: string;
    proto: Protocol;
    l4?: L4Summary;
    domain?: string;
  }): FlowResult {
    this.phase = opts.phase;
    this.domain = opts.domain ?? "";
    this.originDeviceId = opts.originDeviceId;
    const l4: L4Summary =
      opts.l4 ??
      (opts.proto === "icmp"
        ? { icmpId: ICMP_ID, icmpType: "echo-request" }
        : { srcPort: this.nextEphemeral(), dstPort: opts.proto === "udp" ? DNS_PORT : HTTPS_PORT });

    const firstPacketPreview = makePacket({
      srcMac: "",
      dstMac: "",
      srcIp: "",
      dstIp: opts.dstIp,
      proto: opts.proto,
      l4,
    });
    this.pending.push({
      kind: "probe",
      deviceId: opts.originDeviceId,
      sent: firstPacketPreview,
    });

    let hop = this.originate({
      deviceId: opts.originDeviceId,
      dstIp: opts.dstIp,
      proto: opts.proto,
      l4,
      basis: opts.domain ? { dns: { domain: opts.domain } } : undefined,
    });
    const top = this.pending[this.pending.length - 1];
    const sent = this.log.entries[this.log.entries.length - 1]?.packetOut;
    if (top && sent) top.sent = sent;

    while (hop) {
      if (this.log.count >= MAX_HOPS) {
        this.fail(
          hop.deviceId,
          stopText.ttlExceeded(MAX_HOPS),
          {
            phase: this.phase,
            deviceId: hop.deviceId,
            action: "forward",
            portIn: hop.portId,
            packetIn: hop.packet,
            note: "决策记录条数超过上限",
          },
          null,
        );
        break;
      }
      hop = this.deliver(hop);
      if (this.stopped) break;
    }
    if (this.stopped) return { ok: false };
    return { ok: true, answerIp: this.answerIp };
  }

  // ---------- B 收到帧 ----------

  private deliver(hop: Hop): Hop | null {
    const device = this.device(hop.deviceId);
    const inIface = this.runtime.ifaceForFrame(hop.portId, hop.packet.vlan);
    const packetIn = hop.packet;
    const base = {
      phase: this.phase,
      deviceId: hop.deviceId,
      portIn: hop.portId,
      packetIn,
    };

    if (!inIface) {
      return this.fail(
        hop.deviceId,
        stopText.l2Reject(packetIn.dstMac),
        { ...base, action: "forward", note: "收到帧的端口没有三层接口" },
        null,
      );
    }

    // B1 二层过滤（网桥内的转发已经在二层路径里走完了）
    if (packetIn.dstMac !== inIface.mac && packetIn.dstMac !== BROADCAST_MAC) {
      return this.fail(
        hop.deviceId,
        stopText.l2Reject(packetIn.dstMac),
        { ...base, action: "forward", note: "目的 MAC 不是本设备" },
        null,
      );
    }

    // B2 本机处理
    const mine = this.ownInterfaces(hop.deviceId).some((i) => i.ip && i.ip === packetIn.dstIp);
    const target = this.targetOf(device, packetIn.dstIp);
    if (mine || target) return this.localHandle(hop, inIface, target);

    // B3
    if (isL3Router(device)) return this.forward(hop);
    if (device.type === "pc") {
      return this.fail(
        hop.deviceId,
        stopText.notForMe(device.name),
        { ...base, action: "forward", note: "电脑不转发别人的包" },
        null,
      );
    }
    return this.fail(
      hop.deviceId,
      stopText.unknownDest(packetIn.dstIp),
      { ...base, action: "forward", note: "目标库里没有这个地址" },
      null,
    );
  }

  // ---------- C 路由器转发 ----------

  private forward(hop: Hop, natIn?: Decision["basis"]["nat"]): Hop | null {
    const device = this.device(hop.deviceId);
    const packetIn = hop.packet;
    const ttl = packetIn.ttl - 1;
    if (ttl <= 0) {
      return this.fail(
        hop.deviceId,
        stopText.ttlExceeded(INITIAL_TTL),
        {
          phase: this.phase,
          deviceId: hop.deviceId,
          action: "forward",
          portIn: hop.portId,
          packetIn,
          note: "TTL 减到 0",
        },
        null,
      );
    }
    const dstIp = natIn?.after.ip ?? packetIn.dstIp;
    const l4: L4Summary = { ...packetIn.l4 };
    if (natIn) {
      if (packetIn.proto === "icmp") l4.icmpId = natIn.after.port;
      else l4.dstPort = natIn.after.port;
    }
    return this.send({
      deviceId: hop.deviceId,
      action: "forward",
      dstIp,
      proto: packetIn.proto,
      l4,
      ttl,
      portIn: hop.portId,
      packetIn,
      srcIp: packetIn.srcIp,
      basis: natIn ? { nat: natIn } : undefined,
      natOut: !natIn,
      note: ({ route, nextHop }) =>
        natIn
          ? `NAT 还原目的地址：${natIn.before.ip} → ${natIn.after.ip}，转发到 ${route.iface}`
          : `${device.name} 转发到 ${route.iface}，下一跳 ${nextHop}`,
    });
  }

  // ---------- D 本机处理 ----------

  private localHandle(hop: Hop, inIface: L3Interface, target: InternetTarget | null): Hop | null {
    const device = this.device(hop.deviceId);
    const packetIn = hop.packet;
    const base = {
      phase: this.phase,
      deviceId: hop.deviceId,
      portIn: hop.portId,
      packetIn,
    };

    // 起点（或 DNS 转发器）收到自己那次请求的应答
    const top = this.pending[this.pending.length - 1];
    if (top && top.deviceId === hop.deviceId && isReplyFor(top.sent, packetIn)) {
      this.pending.pop();
      if (top.kind === "probe") {
        this.log.pass({
          ...base,
          action: "receive",
          note: this.phase === "dns" ? "收到 DNS 应答" : "收到应答，验证结束",
        });
        return null;
      }
      return this.dnsAnswerToClient(hop, top);
    }

    // 路由器从 wan 收到发给 WAN 地址的包：先查 NAT 会话
    if (isL3Router(device) && inIface.name === "wan" && packetIn.dstIp === inIface.ip) {
      const session = natInbound(this.runtime, hop.deviceId, packetIn);
      if (!session) {
        return this.fail(
          hop.deviceId,
          stopText.natNoSession(device.name, inIface.ip),
          { ...base, action: "forward", note: "会话表里没有对应记录，丢弃" },
          null,
        );
      }
      return this.forward(hop, {
        direction: "in",
        before: { ip: session.outer.ip, port: session.outer.port },
        after: { ip: session.inner.ip, port: session.inner.port },
      });
    }

    // DNS 查询
    if (isDnsQuery(packetIn)) return this.handleDnsQuery(hop, target);

    // ICMP echo request
    if (isEchoRequest(packetIn)) {
      if (target && !target.reachable) {
        return this.fail(
          hop.deviceId,
          stopText.targetUnreachable(target.domain),
          { ...base, action: "answer", note: "目标当前不可达" },
          null,
        );
      }
      return this.answer(hop, {
        proto: "icmp",
        l4: { ...packetIn.l4, icmpType: "echo-reply" },
        note: "收到 ping 请求，回一个应答",
      });
    }

    // TCP：目标端应答视为连接成功
    if (packetIn.proto === "tcp") {
      if (target && !target.reachable) {
        return this.fail(
          hop.deviceId,
          stopText.targetUnreachable(target.domain),
          { ...base, action: "answer", note: "目标当前不可达" },
          null,
        );
      }
      return this.answer(hop, {
        proto: "tcp",
        l4: { srcPort: packetIn.l4.dstPort, dstPort: packetIn.l4.srcPort },
        note: `TCP ${packetIn.l4.dstPort} 连接建立`,
      });
    }

    return this.fail(
      hop.deviceId,
      stopText.unknownDest(packetIn.dstIp),
      { ...base, action: "answer", note: "本机不处理这种包" },
      null,
    );
  }

  /** 本机生成应答并按 A 的 1–6 步发出 */
  private answer(
    hop: Hop,
    opts: { proto: Protocol; l4: L4Summary; note: string; basis?: Decision["basis"] },
  ): Hop | null {
    const device = this.device(hop.deviceId);
    const packetIn = hop.packet;
    if (device.type === "internet") {
      return this.internetAnswer(hop, opts);
    }
    return this.send({
      deviceId: hop.deviceId,
      action: "answer",
      dstIp: packetIn.srcIp,
      proto: opts.proto,
      l4: opts.l4,
      ttl: INITIAL_TTL,
      portIn: hop.portId,
      packetIn,
      basis: opts.basis,
      note: () => opts.note,
    });
  }

  /** 互联网的回程：接入网段内 ARP 找口；私网地址回不去 */
  private internetAnswer(
    hop: Hop,
    opts: { proto: Protocol; l4: L4Summary; note: string; basis?: Decision["basis"] },
  ): Hop | null {
    const device = this.device(hop.deviceId);
    if (device.type !== "internet") return null;
    const packetIn = hop.packet;
    const dstIp = packetIn.srcIp;
    const access = device.config.access;
    const base = {
      phase: this.phase,
      deviceId: hop.deviceId,
      action: "answer" as const,
      portIn: hop.portId,
      packetIn,
      basis: opts.basis ?? {},
    };

    if (inSubnet(dstIp, access.ip, access.mask)) {
      for (const port of device.ports) {
        if (!port.linkId) continue;
        const arp = resolveArp(this.runtime, device.id, port.name, dstIp);
        if (arp.kind !== "hit") continue;
        const packetOut = makePacket({
          srcMac: port.mac,
          dstMac: arp.mac,
          srcIp: packetIn.dstIp,
          dstIp,
          proto: opts.proto,
          l4: opts.l4,
        });
        packetOut.vlan = arp.path.egressWireVlan;
        this.log.pass({
          ...base,
          portOut: arp.path.egressPortId,
          linkId: arp.path.egressLinkId,
          packetOut,
          basis: { ...base.basis, arp: { ip: dstIp, mac: arp.mac, hit: true } },
          note: opts.note,
        });
        return this.crossPath(arp.path, packetOut, true);
      }
      return this.fail(
        hop.deviceId,
        stopText.arpMiss(dstIp, "目标"),
        { ...base, note: "接入网段里没人用这个地址" },
        null,
      );
    }

    const scope = isPrivate(dstIp);
    if (scope === "private" || scope === "carrier") {
      const routerId = this.natOffRouters[this.natOffRouters.length - 1] ?? null;
      return this.fail(
        hop.deviceId,
        stopText.noReturnRoute(dstIp, routerId ? this.name(routerId) : null),
        { ...base, note: "源地址是私网地址，互联网上没有回程路由" },
        routerId ? { deviceId: routerId, field: "nat" } : null,
      );
    }
    return this.fail(
      hop.deviceId,
      stopText.unknownDest(dstIp),
      { ...base, note: "互联网上没有这个源地址，应答送不回去" },
      null,
    );
  }

  // ---------- DNS ----------

  private handleDnsQuery(hop: Hop, target: InternetTarget | null): Hop | null {
    const device = this.device(hop.deviceId);
    const packetIn = hop.packet;
    const base = {
      phase: this.phase,
      deviceId: hop.deviceId,
      portIn: hop.portId,
      packetIn,
    };

    if (device.type === "internet") {
      if (!target?.dnsServer) {
        return this.fail(
          hop.deviceId,
          stopText.dnsNotServer(packetIn.dstIp),
          { ...base, action: "answer", note: "这个地址不是 DNS 服务器" },
          { deviceId: this.originDeviceId, field: "dns" },
        );
      }
      const hit = device.config.targets.find((t) => t.domain === this.domain);
      if (!hit) {
        return this.fail(
          hop.deviceId,
          stopText.dnsNxdomain(this.domain),
          { ...base, action: "answer", note: "目标库里没有这个域名" },
          null,
        );
      }
      this.answerIp = hit.ip;
      return this.answer(hop, {
        proto: "udp",
        l4: { srcPort: DNS_PORT, dstPort: packetIn.l4.srcPort },
        note: `${this.domain} 解析到 ${hit.ip}`,
        basis: { dns: { domain: this.domain, answer: hit.ip } },
      });
    }

    if (device.type === "pc") {
      return this.fail(
        hop.deviceId,
        stopText.dnsNotServer(packetIn.dstIp),
        { ...base, action: "answer", note: "电脑不提供 DNS 服务" },
        { deviceId: this.originDeviceId, field: "dns" },
      );
    }

    // 路由器 / 路由模式光猫：DNS 转发器
    const wanLease = this.runtime.leaseOf(hop.deviceId, "wan");
    const wanIface = this.runtime.ifaceOf(hop.deviceId, "wan");
    if (wanLease?.status !== "ok" || !wanLease.dns || !wanIface?.ip) {
      return this.fail(
        hop.deviceId,
        stopText.dnsNoUpstream(device.name),
        { ...base, action: "answer", note: "没有上游 DNS，无法转发查询" },
        { deviceId: hop.deviceId, portId: device.ports.find((p) => p.name === "wan")?.id },
      );
    }
    const upstream = wanLease.dns;
    const next = this.originate({
      deviceId: hop.deviceId,
      dstIp: upstream,
      proto: "udp",
      l4: { srcPort: this.nextEphemeral(), dstPort: DNS_PORT },
      portIn: hop.portId,
      packetIn,
      basis: { dns: { domain: this.domain, upstream } },
      note: `作为 DNS 转发器，向上游 ${upstream} 查询 ${this.domain}`,
    });
    const sent = this.log.entries[this.log.entries.length - 1]?.packetOut;
    if (next && sent) {
      this.pending.push({
        kind: "forwarder",
        deviceId: hop.deviceId,
        sent,
        clientQuery: packetIn,
        clientPortId: hop.portId,
      });
    }
    return next;
  }

  /** 转发器拿到上游应答后回给客户端 */
  private dnsAnswerToClient(hop: Hop, pending: Pending): Hop | null {
    const query = pending.clientQuery;
    if (!query) return null;
    return this.send({
      deviceId: hop.deviceId,
      action: "answer",
      dstIp: query.srcIp,
      proto: "udp",
      l4: { srcPort: DNS_PORT, dstPort: query.l4.srcPort },
      ttl: INITIAL_TTL,
      portIn: hop.portId,
      packetIn: hop.packet,
      basis: { dns: { domain: this.domain, upstream: hop.packet.srcIp, answer: this.answerIp } },
      note: () => `把解析结果 ${this.answerIp} 回给 ${query.srcIp}`,
    });
  }

  /** 还没发包就失败（例如没配 DNS），也要留一条决策记录 */
  failAtOrigin(
    phase: DecisionPhase,
    deviceId: string,
    stop: StopInfo,
    note: string,
    fixAt: FixAt | null,
  ): void {
    this.phase = phase;
    this.fail(deviceId, stop, { phase, deviceId, action: "originate", note }, fixAt);
  }
}

function routeBasis(route: Route): Decision["basis"]["route"] {
  return { dest: route.dest, mask: route.mask, via: route.via, iface: route.iface };
}

function isReplyFor(sent: PacketSummary, incoming: PacketSummary): boolean {
  if (sent.proto !== incoming.proto) return false;
  if (sent.srcIp && incoming.dstIp !== sent.srcIp) return false;
  if (sent.proto === "icmp") {
    return (
      incoming.l4.icmpType === "echo-reply" && (incoming.l4.icmpId ?? -1) === (sent.l4.icmpId ?? -2)
    );
  }
  return (incoming.l4.dstPort ?? -1) === (sent.l4.srcPort ?? -2);
}
