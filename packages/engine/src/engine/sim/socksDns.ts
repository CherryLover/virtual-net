import type { Topology } from "../../model/topology";
import type { Runtime } from "../runtime/types";
import { socksUdp, type UdpProxySelection } from "./socksUdp";

export type DnsProxySelection = UdpProxySelection;

export function socksDns(
  topology: Topology,
  runtime: Runtime,
  options: {
    sourceDeviceId: string;
    domain: string;
    server: string;
    proxy: DnsProxySelection;
  },
) {
  return socksUdp(topology, runtime, { ...options, kind: "dnsQuery" });
}
