import { useReactFlow } from "@xyflow/react";
import {
  AlignHorizontalDistributeCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignVerticalDistributeCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  type LucideIcon,
  Trash2,
} from "lucide-react";
import { useTopologyStore } from "../store";
import { IconButton } from "../ui/IconButton";
import { GroupActions } from "./GroupActions";

type Align = "left" | "right" | "top" | "bottom" | "spread-x" | "spread-y";

const BUTTONS: { mode: Align; label: string; icon: LucideIcon }[] = [
  { mode: "left", label: "左对齐", icon: AlignHorizontalJustifyStart },
  { mode: "right", label: "右对齐", icon: AlignHorizontalJustifyEnd },
  { mode: "top", label: "顶部对齐", icon: AlignVerticalJustifyStart },
  { mode: "bottom", label: "底部对齐", icon: AlignVerticalJustifyEnd },
  { mode: "spread-x", label: "横向等距", icon: AlignHorizontalDistributeCenter },
  { mode: "spread-y", label: "纵向等距", icon: AlignVerticalDistributeCenter },
];

interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 对齐：以所选节点的外接框为基准，返回每个节点的新位置 */
export function alignBoxes(boxes: Box[], mode: Align): { id: string; position: Position }[] {
  if (boxes.length < 2) return [];
  const left = Math.min(...boxes.map((b) => b.x));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const top = Math.min(...boxes.map((b) => b.y));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));

  if (mode === "left") return boxes.map((b) => ({ id: b.id, position: { x: left, y: b.y } }));
  if (mode === "right")
    return boxes.map((b) => ({ id: b.id, position: { x: right - b.w, y: b.y } }));
  if (mode === "top") return boxes.map((b) => ({ id: b.id, position: { x: b.x, y: top } }));
  if (mode === "bottom")
    return boxes.map((b) => ({ id: b.id, position: { x: b.x, y: bottom - b.h } }));

  // 等距：最左最右（最上最下）不动，中间的按相等间隙铺开
  const horizontal = mode === "spread-x";
  const sorted = [...boxes].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y));
  const span = horizontal ? right - left : bottom - top;
  const total = sorted.reduce((sum, b) => sum + (horizontal ? b.w : b.h), 0);
  const gap = (span - total) / (sorted.length - 1);
  const out: { id: string; position: Position }[] = [];
  let cursor = horizontal ? left : top;
  for (const box of sorted) {
    out.push({
      id: box.id,
      position: horizontal
        ? { x: Math.round(cursor), y: box.y }
        : { x: box.x, y: Math.round(cursor) },
    });
    cursor += (horizontal ? box.w : box.h) + gap;
  }
  return out;
}

interface Position {
  x: number;
  y: number;
}

interface Props {
  ids: string[];
}

export function SelectionPanel({ ids }: Props) {
  const moveDevices = useTopologyStore((s) => s.moveDevices);
  const removeElements = useTopologyStore((s) => s.removeElements);
  const devices = useTopologyStore((s) => s.topology.devices);
  const { getNode } = useReactFlow();

  const apply = (mode: Align) => {
    const boxes: Box[] = [];
    for (const id of ids) {
      const device = devices.find((d) => d.id === id);
      if (!device) continue;
      const node = getNode(id);
      boxes.push({
        id,
        x: device.position.x,
        y: device.position.y,
        w: node?.measured?.width ?? 140,
        h: node?.measured?.height ?? 56,
      });
    }
    moveDevices(alignBoxes(boxes, mode));
  };

  return (
    <div className="panel-section">
      <h3 className="panel-title">已选 {ids.length} 项</h3>
      <GroupActions ids={ids} />
      <div className="align-buttons" role="toolbar" aria-label="设备对齐">
        {BUTTONS.map((item) => (
          <IconButton
            key={item.mode}
            icon={item.icon}
            label={item.label}
            data-align={item.mode}
            onClick={() => apply(item.mode)}
          />
        ))}
      </div>
      <div className="align-actions">
        <button type="button" className="btn btn-danger" onClick={() => removeElements(ids, [])}>
          <Trash2 size={15} />
          删除
        </button>
      </div>
    </div>
  );
}
