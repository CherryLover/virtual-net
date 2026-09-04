/** 决策记录构造：保证 seq 连续、终止条目必有 reasonCode 与 reason */

import type {
  Decision,
  DecisionAction,
  DecisionBasis,
  DecisionPhase,
  PacketSummary,
} from "../../model/probe";
import type { StopInfo } from "./messages";

export interface DecisionInput {
  phase: DecisionPhase;
  deviceId: string;
  action: DecisionAction;
  portIn?: string | null;
  portOut?: string | null;
  linkId?: string | null;
  packetIn?: PacketSummary | null;
  packetOut?: PacketSummary | null;
  basis?: DecisionBasis;
  note: string;
}

export class DecisionLog {
  readonly entries: Decision[] = [];

  private next(input: DecisionInput): Omit<Decision, "verdict" | "reasonCode" | "reason"> {
    return {
      seq: this.entries.length + 1,
      phase: input.phase,
      deviceId: input.deviceId,
      portIn: input.portIn ?? null,
      portOut: input.portOut ?? null,
      linkId: input.linkId ?? null,
      action: input.action,
      packetIn: input.packetIn ?? null,
      packetOut: input.packetOut ?? null,
      basis: input.basis ?? {},
      note: input.note,
    };
  }

  pass(input: DecisionInput): Decision {
    const decision: Decision = {
      ...this.next(input),
      verdict: "pass",
      reasonCode: null,
      reason: null,
    };
    this.entries.push(decision);
    return decision;
  }

  stop(input: DecisionInput, stopInfo: StopInfo): Decision {
    const decision: Decision = {
      ...this.next(input),
      portOut: null,
      linkId: null,
      packetOut: null,
      verdict: "stop",
      reasonCode: stopInfo.reasonCode,
      reason: stopInfo.reason,
    };
    this.entries.push(decision);
    return decision;
  }

  get count(): number {
    return this.entries.length;
  }
}
