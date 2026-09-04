import type { ReactElement } from "react";
import type { DeviceType } from "../engine";
import { InternetIcon } from "./InternetIcon";
import { PcIcon } from "./PcIcon";
import { RouterIcon } from "./RouterIcon";
import type { IconProps } from "./types";

const ICONS: Record<DeviceType, (props: IconProps) => ReactElement> = {
  pc: PcIcon,
  router: RouterIcon,
  internet: InternetIcon,
};

export function DeviceIcon({ type, className }: IconProps & { type: DeviceType }) {
  const Icon = ICONS[type];
  return <Icon className={className} />;
}
