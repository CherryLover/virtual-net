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
import { l014VlanMismatch } from "./l014-vlan-mismatch";
import { l015TrunkNotAllowed } from "./l015-trunk-not-allowed";
import { l016TrunkPeerPlain } from "./l016-trunk-peer-plain";
import { l017L2Loop } from "./l017-l2-loop";
import { l018DoubleNat } from "./l018-double-nat";
import { l019DhcpConflict } from "./l019-dhcp-conflict";
import { l020Cgnat } from "./l020-cgnat";
import { l021AccessMismatch } from "./l021-access-mismatch";
import { l022WanLanOverlap } from "./l022-wan-lan-overlap";
import { l023VlanSubnetOverlap } from "./l023-vlan-subnet-overlap";
import { l024StaticGateway } from "./l024-static-gateway";

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
  l014VlanMismatch,
  l015TrunkNotAllowed,
  l016TrunkPeerPlain,
  l017L2Loop,
  l018DoubleNat,
  l019DhcpConflict,
  l020Cgnat,
  l021AccessMismatch,
  l022WanLanOverlap,
  l023VlanSubnetOverlap,
  l024StaticGateway,
];
