import type { IconProps } from "./types";

/** 路由器：扁盒 + 两根天线 */
export function RouterIcon({ className }: IconProps) {
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
      <rect x="2.5" y="13" width="19" height="7" rx="1.5" />
      <path d="M7 4.5 9.5 13" />
      <path d="M17 4.5 14.5 13" />
      <path d="M6 16.5h2.5" />
      <circle cx="17.5" cy="16.5" r="0.9" />
    </svg>
  );
}
