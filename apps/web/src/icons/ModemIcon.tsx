import type { IconProps } from "./types";

/** 光猫：竖立小盒 + 指示灯 + 光纤引线 */
export function ModemIcon({ className }: IconProps) {
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
      <rect x="6.5" y="6" width="11" height="14" rx="2" />
      <path d="M9.5 9.5h5" />
      <circle cx="10" cy="13" r="0.8" />
      <circle cx="13" cy="13" r="0.8" />
      <path d="M12 6V2.5" />
    </svg>
  );
}
