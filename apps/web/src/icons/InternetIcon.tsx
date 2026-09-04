import type { IconProps } from "./types";

/** 互联网：云 */
export function InternetIcon({ className }: IconProps) {
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
      <path d="M7 18.5h10.2a3.8 3.8 0 0 0 .5-7.57 5.4 5.4 0 0 0-10.2-1.63A4.6 4.6 0 0 0 7 18.5Z" />
    </svg>
  );
}
