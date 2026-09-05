import type { Topology } from "../engine";

/** 撤销栈深度 */
export const HISTORY_LIMIT = 50;

/** 压入一步，超出栈深从最旧的一端丢弃 */
export function pushHistory(past: Topology[], snapshot: Topology): Topology[] {
  const next = [...past, snapshot];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

/**
 * 撤销 / 重做时把视口换成当前值：视口不进撤销栈，
 * 否则回退一步会顺带把画布拉回旧位置。
 */
export function keepViewport(snapshot: Topology, current: Topology): Topology {
  return { ...snapshot, viewport: current.viewport };
}
