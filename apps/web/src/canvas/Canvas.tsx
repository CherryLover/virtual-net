import type { Connection, EdgeChange, NodeChange, OnSelectionChangeParams } from "@xyflow/react";
import {
  applyNodeChanges,
  Background,
  ConnectionMode,
  Controls,
  ReactFlow,
  useStore as useFlowStore,
  useReactFlow,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DeviceType } from "../engine";
import { DEVICE_TYPES } from "../engine";
import { useTopologyStore, useTraceStore } from "../store";
import type { DeviceEdgeType } from "./DeviceEdge";
import { DeviceEdge } from "./DeviceEdge";
import { ApNode } from "./nodes/ApNode";
import { InternetNode } from "./nodes/InternetNode";
import { ModemNode } from "./nodes/ModemNode";
import { PcNode } from "./nodes/PcNode";
import { RouterNode } from "./nodes/RouterNode";
import { ServiceNode } from "./nodes/ServiceNode";
import { SwitchNode } from "./nodes/SwitchNode";
import { nodeSubtitle } from "./nodes/subtitle";
import type { DeviceNodeType } from "./nodes/types";
import { PlaybackBar } from "./trace/PlaybackBar";
import { TraceLayer } from "./trace/TraceLayer";
import { segmentIndexAt, traceView } from "./trace/traceView";
import { usePlayback } from "./trace/usePlayback";
import "./canvas.css";

const nodeTypes = {
  pc: PcNode,
  router: RouterNode,
  internet: InternetNode,
  switch: SwitchNode,
  ap: ApNode,
  modem: ModemNode,
  server: ServiceNode,
  proxy: ServiceNode,
  "access-control": ServiceNode,
};
const edgeTypes = { device: DeviceEdge };

/** 拖动落点与对齐都吸附到这个网格 */
export const GRID = 16;

export function Canvas() {
  const topology = useTopologyStore((s) => s.topology);
  const runtime = useTopologyStore((s) => s.runtime);
  const issues = useTopologyStore((s) => s.issues);
  const selection = useTopologyStore((s) => s.selection);
  const loaded = useTopologyStore((s) => s.loaded);
  const { screenToFlowPosition, setViewport } = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);
  const restored = useRef(false);
  const domNode = useFlowStore((s) => s.domNode);

  // CP3：播放时钟只在这里跑一份，画面全部由 cursorMs 派生
  usePlayback();
  const timeline = useTraceStore((s) => s.timeline);
  const traceStale = useTraceStore((s) => s.stale);
  const segmentIndex = useTraceStore((s) => segmentIndexAt(s.timeline, s.cursorMs));
  const traceLive = timeline !== null && !traceStale;
  const view = useMemo(
    () => traceView(traceLive ? timeline : null, segmentIndex),
    [traceLive, timeline, segmentIndex],
  );

  useEffect(() => {
    if (!loaded || restored.current || !domNode) return;
    restored.current = true;
    void setViewport(topology.viewport);
  }, [loaded, topology.viewport, setViewport, domNode]);

  const errorCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const issue of issues) {
      if (issue.severity !== "error") continue;
      for (const target of issue.targets) {
        counts.set(target.deviceId, (counts.get(target.deviceId) ?? 0) + 1);
      }
    }
    return counts;
  }, [issues]);

  const selectedIds = useMemo(() => {
    if (selection.kind === "device") return new Set([selection.id]);
    if (selection.kind === "devices") return new Set(selection.ids);
    return new Set<string>();
  }, [selection]);

  const derivedNodes: DeviceNodeType[] = useMemo(
    () =>
      topology.devices.map((device) => ({
        id: device.id,
        type: device.type,
        position: device.position,
        selected: selectedIds.has(device.id),
        className:
          [
            view.visits.has(device.id) ? "trace-visited" : "",
            view.activeDeviceId === device.id ? "trace-active" : "",
            view.stoppedDeviceId === device.id ? "trace-stopped" : "",
          ]
            .filter(Boolean)
            .join(" ") || undefined,
        data: {
          device,
          address: [nodeSubtitle(device, runtime), device.zone].filter(Boolean).join(" · "),
          errorCount: errorCounts.get(device.id) ?? 0,
        },
      })),
    [topology.devices, runtime, errorCounts, selectedIds, view],
  );

  const [nodes, setNodes] = useState<DeviceNodeType[]>(derivedNodes);
  useEffect(() => {
    setNodes((prev) =>
      derivedNodes.map((node) => {
        const old = prev.find((p) => p.id === node.id);
        return old ? { ...old, ...node } : node;
      }),
    );
  }, [derivedNodes]);

  const edges: DeviceEdgeType[] = useMemo(
    () =>
      topology.links.map((link) => {
        const portName = (deviceId: string, portId: string) =>
          topology.devices.find((d) => d.id === deviceId)?.ports.find((p) => p.id === portId)
            ?.name ?? "";
        const hasError = issues.some((i) => i.severity === "error" && i.linkId === link.id);
        return {
          id: link.id,
          type: "device" as const,
          source: link.a.deviceId,
          sourceHandle: link.a.portId,
          target: link.b.deviceId,
          targetHandle: link.b.portId,
          selected: selection.kind === "link" && selection.id === link.id,
          className: view.walkedLinkIds.has(link.id) ? "trace-walked" : undefined,
          data: {
            label: `${portName(link.a.deviceId, link.a.portId)} – ${portName(link.b.deviceId, link.b.portId)}`,
            hasError,
            curve: link.curve,
          },
        };
      }),
    [topology.links, topology.devices, issues, selection, view],
  );

  const onNodesChange = useCallback((changes: NodeChange<DeviceNodeType>[]) => {
    setNodes((prev) => applyNodeChanges(changes, prev));
    const moves: { id: string; position: { x: number; y: number } }[] = [];
    for (const change of changes) {
      if (change.type === "position" && change.dragging === false && change.position) {
        moves.push({
          id: change.id,
          position: {
            x: Math.round(change.position.x),
            y: Math.round(change.position.y),
          },
        });
      }
    }
    // 一次拖动（可能带着多个已选节点）算一步
    if (moves.length > 0) useTopologyStore.getState().moveDevices(moves);
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<DeviceEdgeType>[]) => {
    const store = useTopologyStore.getState();
    for (const change of changes) {
      if (change.type === "remove") store.removeLink(change.id);
    }
  }, []);

  const onSelectionChange = useCallback(({ nodes: selected }: OnSelectionChangeParams) => {
    const store = useTopologyStore.getState();
    const ids = selected.map((n) => n.id);
    const current = store.selection;
    if (ids.length >= 2) {
      if (current.kind === "devices" && current.ids.join() === ids.join()) return;
      store.select({ kind: "devices", ids });
      return;
    }
    // 单选与取消由点击处理，这里只负责从多选切回去
    if (current.kind !== "devices") return;
    store.select(ids.length === 1 ? { kind: "device", id: ids[0] as string } : { kind: "none" });
  }, []);

  const isValidConnection = useCallback((connection: Connection | DeviceEdgeType) => {
    const state = useTopologyStore.getState().topology;
    const { source, target, sourceHandle, targetHandle } = connection;
    if (!sourceHandle || !targetHandle) return false;
    if (source === target) return false;
    const portOf = (deviceId: string, portId: string) =>
      state.devices.find((d) => d.id === deviceId)?.ports.find((p) => p.id === portId);
    const a = portOf(source, sourceHandle);
    const b = portOf(target, targetHandle);
    return Boolean(a && b && a.linkId === null && b.linkId === null);
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    const { source, target, sourceHandle, targetHandle } = connection;
    if (!sourceHandle || !targetHandle) return;
    useTopologyStore
      .getState()
      .connect(
        { deviceId: source, portId: sourceHandle },
        { deviceId: target, portId: targetHandle },
      );
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/virtual-net-device") as DeviceType;
      if (!DEVICE_TYPES.includes(type)) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      useTopologyStore.getState().addDevice(type, {
        x: Math.round((position.x - 70) / GRID) * GRID,
        y: Math.round((position.y - 28) / GRID) * GRID,
      });
    },
    [screenToFlowPosition],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  // 键盘：删除、全选、撤销、重做
  useEffect(() => {
    /** 焦点在任意表单控件上：删除、全选这类会误伤填表的快捷键要让开 */
    const inForm = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return (
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true
      );
    };
    /**
     * 焦点在能打字的地方：只有这时才把 Ctrl/Cmd+Z 让给浏览器自己的输入撤销。
     * 复选框、下拉框没有输入撤销，让开只会让快捷键失灵。
     */
    const typing = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      if (el.tagName === "TEXTAREA" || el.isContentEditable === true) return true;
      if (el.tagName !== "INPUT") return false;
      const type = (el as HTMLInputElement).type;
      return type !== "checkbox" && type !== "radio" && type !== "button" && type !== "file";
    };
    /** 按钮、链接：空格本来就是「按下去」，别再抢去做播放开关 */
    const clickable = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      return el?.tagName === "BUTTON" || el?.tagName === "A";
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const store = useTopologyStore.getState();
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "z") {
        if (typing(event.target)) return;
        event.preventDefault();
        if (event.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (meta && event.key.toLowerCase() === "y") {
        if (typing(event.target)) return;
        event.preventDefault();
        store.redo();
        return;
      }
      if (meta && event.key.toLowerCase() === "a") {
        if (inForm(event.target)) return;
        event.preventDefault();
        const ids = store.topology.devices.map((d) => d.id);
        if (ids.length === 0) return;
        store.select(
          ids.length === 1 ? { kind: "device", id: ids[0] as string } : { kind: "devices", ids },
        );
        return;
      }
      // CP3 播放快捷键：焦点落在按钮或输入框上时让开
      if (event.key === " " || event.key === "Spacebar") {
        if (inForm(event.target) || clickable(event.target)) return;
        const trace = useTraceStore.getState();
        if (!trace.timeline || trace.stale) return;
        event.preventDefault();
        trace.togglePlay();
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        if (inForm(event.target)) return;
        const trace = useTraceStore.getState();
        if (!trace.timeline || trace.stale) return;
        event.preventDefault();
        trace.step(event.key === "ArrowRight" ? 1 : -1);
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (inForm(event.target)) return;
        const selection = store.selection;
        if (selection.kind === "devices") {
          event.preventDefault();
          store.removeElements(selection.ids, []);
        } else if (selection.kind === "device") {
          event.preventDefault();
          store.removeElements([selection.id], []);
        } else if (selection.kind === "link") {
          event.preventDefault();
          store.removeLink(selection.id);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <main className="canvas" ref={wrapper} onDrop={onDrop} onDragOver={onDragOver}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onSelectionChange={onSelectionChange}
        onNodeClick={(_, node) =>
          useTopologyStore.getState().select({ kind: "device", id: node.id })
        }
        onEdgeClick={(_, edge) => useTopologyStore.getState().select({ kind: "link", id: edge.id })}
        onPaneClick={() => useTopologyStore.getState().select({ kind: "none" })}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onMoveEnd={(_, viewport) => useTopologyStore.getState().setViewport(viewport)}
        deleteKeyCode={null}
        selectionKeyCode="Shift"
        multiSelectionKeyCode={["Meta", "Control"]}
        selectionOnDrag={false}
        snapToGrid
        snapGrid={[GRID, GRID]}
        panOnDrag
        minZoom={0.2}
        maxZoom={2}
      >
        <Background gap={GRID} />
        <Controls showInteractive={false} fitViewOptions={{ padding: traceLive ? 0.3 : 0.1 }} />
        <TraceLayer view={view} live={traceLive} />
        {traceLive && timeline ? <PlaybackBar timeline={timeline} /> : null}
      </ReactFlow>
    </main>
  );
}
