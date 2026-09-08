import { describe, expect, it } from "vitest";
import {
  accentColor,
  accentStyle,
  COLOR_PRESETS,
  canvasAppearanceStyle,
  contrastingColor,
  linkColor,
  nodeColor,
  validColor,
} from "./colors";

describe("network appearance", () => {
  it("uses coordinated pastel fills without recoloring the canvas", () => {
    const luminance = (hex: string) => {
      const channels = [1, 3, 5]
        .map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return (
        (channels[0] ?? 0) * 0.2126 + (channels[1] ?? 0) * 0.7152 + (channels[2] ?? 0) * 0.0722
      );
    };
    for (const preset of COLOR_PRESETS) {
      const style = accentStyle(preset);
      expect(style).toMatchObject({
        "--accent": preset.accent,
        "--accent-fill": preset.fill,
        "--accent-soft": preset.soft,
        "--accent-on-fill": preset.ink,
      });
      expect(1.05 / (luminance(preset.accent) + 0.05)).toBeGreaterThanOrEqual(4.5);
      for (const surface of [preset.fill, preset.hover])
        expect((luminance(surface) + 0.05) / (luminance(preset.ink) + 0.05)).toBeGreaterThanOrEqual(
          4.5,
        );
      expect(canvasAppearanceStyle(preset).background).toBe("#f8f8f8");
    }
    expect(accentStyle({ accent: "#743a9f" })).toMatchObject({
      "--accent-fill": "#743a9f",
      "--accent-on-fill": "#ffffff",
    });
  });
  it("keeps surfaces neutral even with legacy fill overrides", () => {
    expect(nodeColor(undefined, "d1", "pc")).toBe("#ffffff");
    expect(linkColor(undefined, "l1")).toBe("#94a3b8");
    expect(nodeColor({ devices: {} }, "constructor", "pc")).toBe("#ffffff");
    expect(linkColor({ links: {} }, "__proto__")).toBe("#94a3b8");
    const appearance = {
      nodeColor: "#111111",
      nodeTypes: { pc: "#222222" },
      devices: { d1: "#333333" },
      linkColor: "#444444",
      links: { l1: "#555555" },
    };
    expect(nodeColor(appearance, "d1", "pc")).toBe("#ffffff");
    expect(nodeColor(appearance, "d2", "pc")).toBe("#ffffff");
    expect(nodeColor(appearance, "d2", "router")).toBe("#ffffff");
    expect(linkColor(appearance, "l1")).toBe("#94a3b8");
    expect(linkColor(appearance, "l2")).toBe("#94a3b8");
  });
  it("uses readable foreground for dark, bright and threshold colors", () => {
    expect(contrastingColor("#000000")).toBe("#ffffff");
    expect(contrastingColor("#ffffff")).toBe("#000000");
    expect(contrastingColor("#ffee00")).toBe("#000000");
    expect(contrastingColor("#202124")).toBe("#ffffff");
    expect(contrastingColor("not a color")).toBe("#000000");
    expect(validColor("red")).toBe(false);
    expect(validColor("#12345678")).toBe(false);
    expect(validColor("#Ab12Cd")).toBe(true);
    expect(canvasAppearanceStyle({ background: "#000000" })).toMatchObject({
      background: "#f8f8f8",
      "--network-text": "#4b5563",
    });
  });
  it("keeps presets unchanged and normalizes pale custom accents for contrast", () => {
    for (const preset of COLOR_PRESETS) expect(accentColor(preset)).toBe(preset.accent);
    expect(accentColor({ accent: "invalid" })).toBe("#027864");
    expect(contrastingColor(accentColor({ accent: "#ffffff" }))).toBe("#ffffff");
  });
});
