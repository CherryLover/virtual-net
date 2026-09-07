import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
}

export function IconButton({ icon: Icon, label, className = "", ...props }: Props) {
  return (
    <button
      type="button"
      className={`btn icon-button ${className}`}
      title={label}
      aria-label={label}
      {...props}
    >
      <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}
