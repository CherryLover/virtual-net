import type { CSSProperties } from "react";
import type { TopologyAppearance } from "../engine";

export const DEFAULT_BACKGROUND = "#f8f8f8";
export const DEFAULT_NODE = "#ffffff";
export const DEFAULT_LINK = "#94a3b8";
export const DEFAULT_ACCENT = "#027864";

export function validColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function luminance(color: string): number {
  const channels = [1, 3, 5].map((start) => {
    const value = Number.parseInt(color.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

export function contrastingColor(background: string): string {
  return luminance(validColor(background) ? background : DEFAULT_NODE) > 0.179
    ? "#000000"
    : "#ffffff";
}

/** Keep white button text and icons legible even when imported accents are very pale. */
export function accentColor(appearance?: TopologyAppearance): string {
  const value = appearance?.accent;
  let color = value && validColor(value) ? value : DEFAULT_ACCENT;
  while (luminance(color) > 0.183) {
    color = `#${[1, 3, 5]
      .map((start) =>
        Math.floor(Number.parseInt(color.slice(start, start + 2), 16) * 0.9)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`;
  }
  return color;
}

export function accentStyle(appearance?: TopologyAppearance): CSSProperties {
  const accent = accentColor(appearance);
  const preset = COLOR_PRESETS.find((item) => item.accent === accent.toLowerCase());
  return {
    "--accent": accent,
    "--accent-hover": `color-mix(in srgb, ${accent} 85%, #000000)`,
    "--accent-soft": preset?.soft ?? `color-mix(in srgb, ${accent} 12%, #ffffff)`,
    "--accent-fill": preset?.fill ?? accent,
    "--accent-fill-hover": preset?.hover ?? `color-mix(in srgb, ${accent} 85%, #000000)`,
    "--accent-on-fill": preset?.ink ?? "#ffffff",
  } as CSSProperties;
}

export function canvasAppearanceStyle(_appearance?: TopologyAppearance): CSSProperties {
  return {
    "--network-background": DEFAULT_BACKGROUND,
    "--network-text": "#4b5563",
    "--xy-background-color": DEFAULT_BACKGROUND,
    "--xy-background-pattern-color": "#c5c5c5",
    background: DEFAULT_BACKGROUND,
  } as CSSProperties;
}

// Legacy fill and line overrides remain in saved files but no longer recolor the work surface.
export function nodeColor(
  _appearance: TopologyAppearance | undefined,
  _id: string,
  _kind: string,
): string {
  return DEFAULT_NODE;
}
export function linkColor(_appearance: TopologyAppearance | undefined, _id: string): string {
  return DEFAULT_LINK;
}

// Radix Colors 3.0 sRGB scales: 11 for readable accents, 12 for text on pastel fills.
// https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale
export const COLOR_PRESETS = [
  {
    name: "薄荷",
    family: "马卡龙",
    accent: DEFAULT_ACCENT,
    fill: "#86ead4",
    hover: "#7de0cb",
    soft: "#ddf9f2",
    ink: "#16433c",
  },
  {
    name: "晴空",
    family: "马卡龙",
    accent: "#00749e",
    fill: "#a9daed",
    hover: "#8dcae3",
    soft: "#e1f6fd",
    ink: "#1d3e56",
  },
  {
    name: "樱花",
    family: "马卡龙",
    accent: "#c2298a",
    fill: "#efbfdd",
    hover: "#e7acd0",
    soft: "#fee9f5",
    ink: "#651249",
  },
  {
    name: "鸢尾",
    family: "柔雾",
    accent: "#5753c6",
    fill: "#cbcdff",
    hover: "#b8baf8",
    soft: "#f0f1fe",
    ink: "#272962",
  },
  {
    name: "鼠尾草",
    family: "柔雾",
    accent: "#5f6563",
    fill: "#cbcfcd",
    hover: "#b8bcba",
    soft: "#eef1f0",
    ink: "#1a211e",
  },
  {
    name: "陶土",
    family: "柔雾",
    accent: "#7d5e54",
    fill: "#dfcdc5",
    hover: "#d3bcb3",
    soft: "#f6edea",
    ink: "#43302b",
  },
];
