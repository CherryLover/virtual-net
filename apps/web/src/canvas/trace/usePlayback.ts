/** 播放时钟（CP3 4.1）：每帧把 `cursorMs` 往前推，只有这一个数字在变 */
import { useEffect } from "react";
import { useTraceStore } from "../../store";

export function usePlayback(): void {
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = now - last;
      last = now;
      const state = useTraceStore.getState();
      if (state.playing) state.tick(dt);
    };
    // 标签页切走时浏览器不发 rAF，切回来那一帧的间隔是整段离开时间，丢掉不算
    const onVisible = () => {
      last = performance.now();
    };
    document.addEventListener("visibilitychange", onVisible);
    raf = requestAnimationFrame(frame);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      cancelAnimationFrame(raf);
    };
  }, []);
}
