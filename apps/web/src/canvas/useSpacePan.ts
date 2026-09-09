import { useEffect, useState } from "react";
import { canvasKeyboardBlocked } from "./keyboard";

export function useSpacePan() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    let pointerDown = false;
    let spaceDown = false;
    const reset = () => {
      pointerDown = false;
      spaceDown = false;
      setActive(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" && event.key !== " ") return;
      const target = event.target instanceof Element ? event.target : null;
      if (
        canvasKeyboardBlocked(event.target) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        target?.closest(
          'input, textarea, select, button, a, [contenteditable="true"], .playback',
        ) ||
        (target && target !== document.body && !target.closest(".canvas"))
      )
        return;
      event.preventDefault();
      if (event.repeat || pointerDown) return;
      spaceDown = true;
      setActive(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space" && event.key !== " ") return;
      spaceDown = false;
      if (!pointerDown) setActive(false);
    };
    const onPointerDown = () => {
      pointerDown = true;
    };
    const onPointerUp = () => {
      pointerDown = false;
      if (!spaceDown) setActive(false);
    };
    const onVisibility = () => {
      if (document.hidden) reset();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", reset);
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", reset);
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return active;
}
