/** 阶段名到中文（CP3 文档 2.2）。未知值原样显示，CP4 起新增阶段不必改这里 */

const PHASE_LABELS: Record<string, string> = {
  icmp: "ping",
  dns: "DNS",
  tcp: "连接",
  udp: "UDP 中继",
};

export function phaseLabel(phase: string): string {
  return PHASE_LABELS[phase] ?? phase;
}
