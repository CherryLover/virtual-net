import type { ReactElement } from "react";
import { ApIcon } from "./ApIcon";
import { InternetIcon } from "./InternetIcon";
import { ModemIcon } from "./ModemIcon";
import { PcIcon } from "./PcIcon";
import { RouterIcon } from "./RouterIcon";
import { SwitchIcon } from "./SwitchIcon";
import type { IconProps } from "./types";

const ICONS: Record<string, (props: IconProps) => ReactElement> = {
  pc: PcIcon,
  router: RouterIcon,
  internet: InternetIcon,
  switch: SwitchIcon,
  ap: ApIcon,
  modem: ModemIcon,
};

export function DeviceIcon({ type, className }: IconProps & { type: string }) {
  const Icon = ICONS[type] ?? PcIcon;
  return <Icon className={className} />;
}
