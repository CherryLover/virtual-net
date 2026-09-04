import type { LintRule } from "../context";
import { l001IpConflict } from "./l001-ip-conflict";
import { l002GatewayOffSubnet } from "./l002-gateway-off-subnet";
import { l003NoGateway } from "./l003-no-gateway";
import { l004LinkSubnetMismatch } from "./l004-link-subnet-mismatch";
import { l005MaskMismatch } from "./l005-mask-mismatch";
import { l006PoolOverlapsStatic } from "./l006-pool-overlaps-static";
import { l007PoolContainsRouter } from "./l007-pool-contains-router";
import { l008PoolOffSubnet } from "./l008-pool-off-subnet";
import { l009PortUnlinked } from "./l009-port-unlinked";
import { l010LeaseFailed } from "./l010-lease-failed";
import { l011BadAddress } from "./l011-bad-address";
import { l012NoDns } from "./l012-no-dns";
import { l013NatOff } from "./l013-nat-off";

/** 规则按编号排列，输出前再按级别排序 */
export const LINT_RULES: LintRule[] = [
  l001IpConflict,
  l002GatewayOffSubnet,
  l003NoGateway,
  l004LinkSubnetMismatch,
  l005MaskMismatch,
  l006PoolOverlapsStatic,
  l007PoolContainsRouter,
  l008PoolOffSubnet,
  l009PortUnlinked,
  l010LeaseFailed,
  l011BadAddress,
  l012NoDns,
  l013NatOff,
];
