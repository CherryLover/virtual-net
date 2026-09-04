import { useEffect, useId, useState } from "react";

interface Props {
  label: string;
  value: string;
  field: string;
  highlight?: boolean;
  disabled?: boolean;
  placeholder?: string;
  validate?: (value: string) => string | null;
  onCommit: (value: string) => void;
}

export function Field({
  label,
  value,
  field,
  highlight,
  disabled,
  placeholder,
  validate,
  onCommit,
}: Props) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(value);
    setError(null);
  }, [value]);

  return (
    <div className={`field${highlight ? " field-highlight" : ""}`} data-field={field}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={`field-input${error ? " field-input-error" : ""}`}
        value={draft}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const message = validate ? validate(draft) : null;
          if (message) {
            setError(message);
            return;
          }
          setError(null);
          if (draft !== value) onCommit(draft);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      {error ? <div className="field-error">{error}</div> : null}
    </div>
  );
}

interface ToggleProps {
  label: string;
  field: string;
  checked: boolean;
  highlight?: boolean;
  onChange: (checked: boolean) => void;
}

export function Toggle({ label, field, checked, highlight, onChange }: ToggleProps) {
  const id = useId();
  return (
    <div className={`field field-inline${highlight ? " field-highlight" : ""}`} data-field={field}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </div>
  );
}

interface ReadonlyProps {
  label: string;
  value: string;
  field?: string;
  highlight?: boolean;
}

export function ReadonlyField({ label, value, field, highlight }: ReadonlyProps) {
  return (
    <div className={`field${highlight ? " field-highlight" : ""}`} data-field={field}>
      <div className="field-label">{label}</div>
      <div className="field-readonly">{value}</div>
    </div>
  );
}
