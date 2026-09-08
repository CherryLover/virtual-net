import { ChevronDown } from "lucide-react";
import type { SelectHTMLAttributes } from "react";

export function Select({
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="ui-select">
      <select {...props} className={`field-input ${className}`}>
        {children}
      </select>
      <ChevronDown size={15} aria-hidden="true" />
    </span>
  );
}
