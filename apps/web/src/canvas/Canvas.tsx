import type { Connection, EdgeChange, NodeChange } from "@xyflow/react";
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
import { leaseOf } from "../engine";
import { useTopologyStore } from "../store";
import type { DeviceEdgeType } from "./DeviceEdge";
import { DeviceEdge } from "./DeviceEdge";
import { InternetNode } from "./nodes/InternetNode";
import { PcNode } from "./nodes/PcNode";
import { RouterNode } from "./nodes/RouterNode";
import type { DeviceNodeType } from "./nodes/types";
import "./canvas.css";

const nodeTypes = { pc: PcNode, router: RouterNode, internet: InternetNode };
const edgeTypes = { device: DeviceEdge };

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

  const derivedNodes: DeviceNodeType[] = useMemo(
    () =>
      topology.devices.map((device) => {
        let address: string | undefined;
        if (device.type === "pc") {
          if (device.config.addressMode === "dhcp") {
            const lease = leaseOf(runtime, device.id, "eth0");
            address = lease?.status === "ok" && lease.ip ? lease.ip : "未获取到地址";
          } else {
            address = device.config.ip || "未获取到地址";
          }
        } else if (device.type === "router") {
          address = `LAN ${device.config.lan.ip}`;
        }
        return {
          id: device.id,
          type: device.type,
          position: device.position,
          selected: selection.kind === "device" && selection.id === device.id,
          data: { device, address, errorCount: errorCounts.get(device.id) ?? 0 },
        };
      }),
    [topology.devices, runtime, errorCounts, selection],
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
          data: {
            label: `${portName(link.a.deviceId, link.a.portId)} – ${portName(link.b.deviceId, link.b.portId)}`,
            hasError,
          },
        };
      }),
    [topology.links, topology.devices, issues, selection],
  );

  const onNodesChange = useCallback((changes: NodeChange<DeviceNodeType>[]) => {
    setNodes((prev) => applyNodeChanges(changes, prev));
    const store = useTopologyStore.getState();
    for (const change of changes) {
      if (change.type === "position" && change.dragging === false && change.position) {
        store.moveDevice(change.id, change.position);
      }
      if (change.type === "remove") store.removeDevice(change.id);
    }
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<DeviceEdgeType>[]) => {
    const store = useTopologyStore.getState();
    for (const change of changes) {
      if (change.type === "remove") store.removeLink(change.id);
    }
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
      if (type !== "pc" && type !== "router" && type !== "internet") return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      useTopologyStore
        .getState()
        .addDevice(type, { x: Math.round(position.x - 70), y: Math.round(position.y - 28) });
    },
    [screenToFlowPosition],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
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
        onNodeClick={(_, node) =>
          useTopologyStore.getState().select({ kind: "device", id: node.id })
        }
        onEdgeClick={(_, edge) => useTopologyStore.getState().select({ kind: "link", id: edge.id })}
        onPaneClick={() => useTopologyStore.getState().select({ kind: "none" })}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onMoveEnd={(_, viewport) => useTopologyStore.getState().setViewport(viewport)}
        deleteKeyCode={["Delete", "Backspace"]}
        multiSelectionKeyCode={null}
        selectionOnDrag={false}
        panOnDrag
        minZoom={0.2}
        maxZoom={2}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </main>
  );
}
