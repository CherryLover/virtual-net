import { Undo2, X } from "lucide-react";
import { useDeletionNotice } from "../store/deletionNotice";
import { IconButton } from "../ui/IconButton";

export function DeletionNotice() {
  const { notice, undo, dismiss } = useDeletionNotice();
  if (!notice) return null;
  return (
    <div className="deletion-notice" role="status">
      <span>
        {notice.deviceCount ? `已删除 ${notice.deviceCount} 台设备` : "已删除连线"}
        {notice.deviceCount && notice.linkCount ? `及 ${notice.linkCount} 条连线` : ""}
      </span>
      <IconButton icon={Undo2} label="撤销此次删除" onClick={undo} />
      <IconButton icon={X} label="关闭删除提示" onClick={dismiss} />
    </div>
  );
}
