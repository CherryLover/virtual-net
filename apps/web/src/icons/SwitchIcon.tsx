import type { IconProps } from "./types";

/** 交换机：扁长机箱 + 一排口 */
export function SwitchIcon({ className }: IconProps) {
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
      <rect x="2.5" y="7.5" width="19" height="9" rx="1.5" />
      <path d="M6 13.5v1.5" />
      <path d="M9.5 13.5v1.5" />
      <path d="M13 13.5v1.5" />
      <path d="M16.5 13.5v1.5" />
      <path d="M5 10.5h3" />
    </svg>
  );
}
