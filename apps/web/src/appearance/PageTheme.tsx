import { useLayoutEffect } from "react";
import { useTopologyStore } from "../store";
import { accentStyle } from "./colors";
import "./appearance.css";

export function PageTheme() {
  const appearance = useTopologyStore((s) => s.topology.appearance);
  useLayoutEffect(() => {
    const root = document.documentElement;
    delete root.dataset.pageTheme;
    for (const [name, value] of Object.entries(accentStyle(appearance)))
      root.style.setProperty(name, String(value));
    return () => {
      for (const name of Object.keys(accentStyle(appearance))) root.style.removeProperty(name);
    };
  }, [appearance]);
  return null;
}
