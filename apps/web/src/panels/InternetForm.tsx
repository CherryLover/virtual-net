import type { InternetDevice } from "../engine";
import { ReadonlyField } from "./Field";

interface Props {
  device: InternetDevice;
}

const REGION_LABEL = { cn: "国内", overseas: "境外" } as const;

export function InternetForm({ device }: Props) {
  const access = device.config.access;
  return (
    <div className="form">
      <ReadonlyField label="接入地址" value={`${access.ip} / ${access.mask}`} />
      <ReadonlyField label="地址池" value={`${access.poolStart} – ${access.poolEnd}`} />
      <ReadonlyField label="下发 DNS" value={access.dns} />
      <div className="field">
        <div className="field-label">目标</div>
        <table className="target-table">
          <thead>
            <tr>
              <th>域名</th>
              <th>IP</th>
              <th>位置</th>
            </tr>
          </thead>
          <tbody>
            {device.config.targets.map((target) => (
              <tr key={target.id}>
                <td>{target.domain}</td>
                <td>{target.ip}</td>
                <td>{REGION_LABEL[target.region]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
