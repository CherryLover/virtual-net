import type { IconProps } from "./types";

/** 电脑：显示器 + 底座 */
export function PcIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="2.5" y="4" width="19" height="12" rx="1.5" />
      <path d="M10 16v3" />
      <path d="M14 16v3" />
      <path d="M7.5 19.5h9" />
    </svg>
  );
}
