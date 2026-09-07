export type PlaybackCommand = { kind: "step"; delta: 1 | -1 } | { kind: "seek"; ms: number };

export function playbackCommand(key: string, totalMs: number): PlaybackCommand | null {
  if (key === "ArrowLeft") return { kind: "step", delta: -1 };
  if (key === "ArrowRight") return { kind: "step", delta: 1 };
  if (key === "Home") return { kind: "seek", ms: 0 };
  if (key === "End") return { kind: "seek", ms: Math.max(0, totalMs) };
  return null;
}
