/** 画布底部的播放条（CP3 3.2） */
import { Panel } from "@xyflow/react";
import { Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { useRef } from "react";
import type { PlaybackSpeed } from "../../store";
import { useTraceStore } from "../../store";
import { phaseLabel } from "../../trace/phaseLabel";
import type { Segment, Timeline } from "../../trace/timeline";
import { playbackCommand } from "./playbackKeyboard";
import { phaseColor } from "./traceView";

const SPEEDS: PlaybackSpeed[] = [0.5, 1, 2];

interface Band {
  phase: string;
  startMs: number;
  endMs: number;
}

/** 把片段按阶段并成几段，进度条按段上色，交界处画分隔线 */
function bandsOf(segments: Segment[]): Band[] {
  const bands: Band[] = [];
  for (const segment of segments) {
    const last = bands[bands.length - 1];
    if (last && last.phase === segment.phase) last.endMs = segment.endMs;
    else bands.push({ phase: segment.phase, startMs: segment.startMs, endMs: segment.endMs });
  }
  return bands;
}

function percent(value: number, total: number): string {
  return `${total > 0 ? (value / total) * 100 : 0}%`;
}

interface Props {
  timeline: Timeline;
}

export function PlaybackBar({ timeline }: Props) {
  const cursorMs = useTraceStore((s) => s.cursorMs);
  const playing = useTraceStore((s) => s.playing);
  const speed = useTraceStore((s) => s.speed);
  const dragging = useRef<number | null>(null);
  const total = timeline.totalMs;
  const bands = bandsOf(timeline.segments);

  const seekAt = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    useTraceStore.getState().seekMs(((event.clientX - rect.left) / rect.width) * total);
  };

  return (
    <Panel position="bottom-center" className="playback nopan nodrag nowheel">
      <button
        type="button"
        className="playback-btn"
        title="上一跳"
        aria-label="上一跳"
        onClick={() => useTraceStore.getState().step(-1)}
      >
        <SkipBack size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="playback-btn playback-play"
        title={playing ? "暂停" : "播放"}
        aria-label={playing ? "暂停" : "播放"}
        onClick={() => useTraceStore.getState().togglePlay()}
      >
        {playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
      </button>
      <button
        type="button"
        className="playback-btn"
        title="下一跳"
        aria-label="下一跳"
        onClick={() => useTraceStore.getState().step(1)}
      >
        <SkipForward size={15} aria-hidden="true" />
      </button>

      <div className="playback-progress">
        {bands.length > 1 ? (
          <div className="playback-phases">
            {bands.map((band) => (
              <span
                key={`${band.phase}-${band.startMs}`}
                className="playback-phase"
                style={{ left: percent(band.startMs, total) }}
              >
                {phaseLabel(band.phase)}
              </span>
            ))}
          </div>
        ) : null}
        <div
          className="playback-track"
          role="slider"
          tabIndex={0}
          aria-label="进度"
          aria-valuemin={0}
          aria-valuemax={Math.round(total)}
          aria-valuenow={Math.round(cursorMs)}
          aria-valuetext={`${(cursorMs / 1000).toFixed(1)} / ${(total / 1000).toFixed(1)} 秒`}
          onKeyDown={(event) => {
            const command = playbackCommand(event.key, total);
            if (!command) return;
            event.preventDefault();
            event.stopPropagation();
            const trace = useTraceStore.getState();
            if (command.kind === "step") trace.step(command.delta);
            else trace.seekMs(command.ms);
          }}
          onPointerDown={(event) => {
            if (event.button !== 0 || !event.isPrimary) return;
            dragging.current = event.pointerId;
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            seekAt(event);
          }}
          onPointerMove={(event) => {
            if (dragging.current === event.pointerId) seekAt(event);
          }}
          onPointerUp={(event) => {
            if (dragging.current !== event.pointerId) return;
            seekAt(event);
            dragging.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={(event) => {
            if (dragging.current === event.pointerId) dragging.current = null;
          }}
          onLostPointerCapture={(event) => {
            if (dragging.current === event.pointerId) dragging.current = null;
          }}
        >
          {bands.map((band) => (
            <span
              key={`band-${band.startMs}`}
              className="playback-band"
              style={{
                left: percent(band.startMs, total),
                width: percent(band.endMs - band.startMs, total),
                background: phaseColor(band.phase),
              }}
            />
          ))}
          {bands.map((band) =>
            cursorMs > band.startMs ? (
              <span
                key={`fill-${band.startMs}`}
                className="playback-fill"
                style={{
                  left: percent(band.startMs, total),
                  width: percent(Math.min(cursorMs, band.endMs) - band.startMs, total),
                  background: phaseColor(band.phase),
                }}
              />
            ) : null,
          )}
          {bands.slice(1).map((band) => (
            <span
              key={`divider-${band.startMs}`}
              className="playback-divider"
              style={{ left: percent(band.startMs, total) }}
            />
          ))}
          {timeline.marks.map((mark) => (
            <span
              key={mark.seq}
              className="playback-tick"
              style={{ left: percent(mark.atMs, total) }}
            />
          ))}
          <span className="playback-thumb" style={{ left: percent(cursorMs, total) }} />
        </div>
      </div>

      <div className="playback-speeds">
        {SPEEDS.map((value) => (
          <button
            key={value}
            type="button"
            className={`playback-speed${value === speed ? " playback-speed-on" : ""}`}
            aria-label={`${value} 倍速`}
            title={`${value} 倍速`}
            aria-pressed={value === speed}
            onClick={() => useTraceStore.getState().setSpeed(value)}
          >
            {value}×
          </button>
        ))}
      </div>

      <button
        type="button"
        className="playback-btn"
        title="清除动画"
        aria-label="清除动画"
        onClick={() => useTraceStore.getState().clear()}
      >
        <X size={15} aria-hidden="true" />
      </button>
    </Panel>
  );
}
