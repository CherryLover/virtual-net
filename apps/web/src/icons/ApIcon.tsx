import type { IconProps } from "./types";

/** 无线 AP：圆盘 + 两道信号弧 */
export function ApIcon({ className }: IconProps) {
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
      <rect x="4" y="15" width="16" height="5" rx="2.5" />
      <circle cx="12" cy="17.5" r="0.9" />
      <path d="M8.5 11.5a5 5 0 0 1 7 0" />
      <path d="M6 8.5a8.6 8.6 0 0 1 12 0" />
    </svg>
  );
}
