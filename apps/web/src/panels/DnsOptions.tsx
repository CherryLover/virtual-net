import { useId } from "react";
import { ProxyOptions, type ProxySelection } from "./ProxyOptions";
import { ipValidator } from "./validators";

export interface DnsSelection {
  server: string;
  proxy?: ProxySelection;
}

export const dnsServerError = ipValidator(false);

export function DnsOptions({
  sourceId,
  value,
  onChange,
}: {
  sourceId: string;
  value: DnsSelection;
  onChange: (value: DnsSelection) => void;
}) {
  const id = useId();
  const error = dnsServerError(value.server);
  return (
    <>
      <div className="field">
        <label className="field-label" htmlFor={`${id}-server`}>
          DNS 服务器
        </label>
        <input
          id={`${id}-server`}
          className={`field-input${error ? " field-input-error" : ""}`}
          placeholder="自动"
          value={value.server}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => onChange({ ...value, server: event.target.value })}
        />
        {error ? (
          <div id={`${id}-error`} className="field-error" role="alert">
            {error}
          </div>
        ) : null}
      </div>
      <ProxyOptions
        sourceId={sourceId}
        value={value.proxy}
        mode="udp"
        onChange={(proxy) => onChange({ ...value, proxy })}
      />
    </>
  );
}
