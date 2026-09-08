import { Copy, Group, Ungroup } from "lucide-react";
import { useTopologyStore } from "../store";
import { IconButton } from "../ui/IconButton";
import { Select } from "../ui/Select";

export function GroupActions({ ids }: { ids: string[] }) {
  const groups = useTopologyStore((s) => s.topology.groups);
  const containing = groups?.find((g) => ids.every((id) => g.deviceIds.includes(id)));
  return (
    <div className="align-actions group-actions">
      <IconButton
        icon={Copy}
        label="复制所选设备"
        onClick={() => useTopologyStore.getState().copyDevices(ids)}
      />
      {ids.length > 1 && (
        <IconButton
          icon={Group}
          label="建立分组"
          onClick={() => useTopologyStore.getState().createGroup(ids)}
        />
      )}
      <Select
        aria-label="加入分组"
        disabled={!groups?.length}
        value=""
        onChange={(e) => {
          const group = groups?.find((g) => g.id === e.target.value);
          if (group)
            useTopologyStore.getState().updateGroupMembers(group.id, [...group.deviceIds, ...ids]);
        }}
      >
        <option value="">{groups?.length ? "加入分组" : "暂无分组"}</option>
        {groups?.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </Select>
      {containing && (
        <IconButton
          icon={Ungroup}
          label="移出分组"
          onClick={() =>
            useTopologyStore.getState().updateGroupMembers(
              containing.id,
              containing.deviceIds.filter((id) => !ids.includes(id)),
            )
          }
        />
      )}
    </div>
  );
}
