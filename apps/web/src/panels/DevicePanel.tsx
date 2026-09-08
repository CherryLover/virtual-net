import { Activity, Cable, Settings2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DEVICE_LABELS, type Device, type Runtime } from "../engine";
import { DeviceIcon } from "../icons";
import { useTopologyStore } from "../store";
import { DeviceProbe } from "./DeviceProbe";
import { Field } from "./Field";
import { ApForm } from "./forms/ApForm";
import { InternetForm } from "./forms/InternetForm";
import { ModemForm } from "./forms/ModemForm";
import { PcForm } from "./forms/PcForm";
import { PortVlanTable } from "./forms/PortVlanTable";
import { RouterForm } from "./forms/RouterForm";
import { AccessControlForm, AccessPolicyForm, ProxyForm, ServerForm } from "./forms/ServiceForms";
import { SwitchForm } from "./forms/SwitchForm";
import { GroupActions } from "./GroupActions";
import { diagnosticTab, type InspectorTab } from "./inspectorTab";
import { ResultsPanel } from "./ResultsPanel";

interface Props {
  device: Device;
  runtime: Runtime;
  highlight: string | null;
  highlightPortId: string | null;
}

export function DevicePanel({ device, runtime, highlight, highlightPortId }: Props) {
  const updateDevice = useTopologyStore((s) => s.updateDevice);
  const issues = useTopologyStore((s) => s.issues);
  const devices = useTopologyStore((s) => s.topology.devices);
  const links = useTopologyStore((s) => s.topology.links);
  const selection = useTopologyStore((s) => s.selection);
  const [tab, setTab] = useState<InspectorTab>(
    diagnosticTab(highlight, highlightPortId) ?? "config",
  );
  const root = useRef<HTMLDivElement>(null);
  const errors = issues.filter((i) => i.targets.some((t) => t.deviceId === device.id));
  useEffect(() => {
    const targetTab = diagnosticTab(highlight, highlightPortId);
    if (targetTab && selection.kind === "device") setTab(targetTab);
  }, [highlight, highlightPortId, selection]);
  useEffect(() => {
    if (tab === "verify" || (!highlight && !highlightPortId)) return;
    let target = root.current?.querySelector<HTMLElement>(".field-highlight, .port-row-highlight");
    if (!target && highlight) {
      target = Array.from(root.current?.querySelectorAll<HTMLElement>("[data-field]") ?? []).find(
        (el) => highlight === el.dataset.field || highlight.startsWith(`${el.dataset.field}.`),
      );
    }
    if (target) {
      const detail = target.closest("details");
      if (detail) detail.open = true;
    }
    target?.scrollIntoView({ block: "nearest" });
  }, [tab, highlight, highlightPortId]);
  return (
    <div className="device-inspector" ref={root}>
      <div className="device-inspector-head">
        <h3 className="panel-title panel-title-device">
          <DeviceIcon type={device.type} className="device-icon" />
          {device.name}
        </h3>
        <div className="device-meta">
          <span>{DEVICE_LABELS[device.type]}</span>
          <span className={errors.length ? "status-warning" : "status-ok"}>
            {errors.length ? `${errors.length} 项待检查` : "配置正常"}
          </span>
        </div>
      </div>
      <div className="inspector-tabs" role="tablist" aria-label="设备操作">
        {(
          [
            { id: "config", name: "配置", icon: Settings2 },
            { id: "ports", name: "端口", icon: Cable },
            { id: "verify", name: "验证", icon: Activity },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            id={`tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`panel-${item.id}`}
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const tabs: InspectorTab[] = ["config", "ports", "verify"];
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? 2
                    : (tabs.indexOf(tab) + (event.key === "ArrowRight" ? 1 : 2)) % 3;
              setTab(tabs[next] as InspectorTab);
              root.current?.querySelector<HTMLButtonElement>(`#tab-${tabs[next]}`)?.focus();
            }}
          >
            <item.icon size={14} />
            {item.name}
          </button>
        ))}
      </div>
      <div
        className="device-inspector-content"
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
      >
        {tab === "verify" ? (
          <>
            {/* 交换机、AP、光猫不是 ping 起点，不显示发起验证的块 */}
            {device.type === "pc" ||
            device.type === "router" ||
            device.type === "server" ||
            device.type === "proxy" ? (
              <DeviceProbe device={device} runtime={runtime} />
            ) : null}
            <ResultsPanel />
          </>
        ) : tab === "ports" ? (
          <>
            {device.type === "router" || device.type === "switch" ? (
              <PortVlanTable device={device} highlightPortId={highlightPortId} />
            ) : null}
            <div className="port-overview">
              {device.ports.map((port) => {
                const link = links.find((l) => l.id === port.linkId);
                const end = link ? (link.a.deviceId === device.id ? link.b : link.a) : null;
                const peer = devices.find((d) => d.id === end?.deviceId);
                return (
                  <div
                    key={port.id}
                    className={`port-overview-row${highlightPortId === port.id ? " port-row-highlight" : ""}`}
                  >
                    <div>
                      <strong>{port.name}</strong>
                      <span>
                        {peer
                          ? `${peer.name} · ${peer.ports.find((p) => p.id === end?.portId)?.name}`
                          : "未连接"}
                      </span>
                    </div>
                    {device.type === "switch" ? (
                      <select
                        className="field-input port-side-select"
                        aria-label={`${port.name} 接线位置`}
                        value={port.displaySide ?? ""}
                        onChange={(e) =>
                          useTopologyStore
                            .getState()
                            .setPortSide(
                              device.id,
                              port.id,
                              (e.target.value || undefined) as
                                | "top"
                                | "bottom"
                                | "left"
                                | "right"
                                | undefined,
                            )
                        }
                      >
                        <option value="">自动</option>
                        <option value="top">上侧</option>
                        <option value="bottom">下侧</option>
                        <option value="left">左侧</option>
                        <option value="right">右侧</option>
                      </select>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <Field
              label="名称"
              field="name"
              value={device.name}
              highlight={highlight === "name"}
              validate={(value) => (value.trim() ? null : "必填")}
              onCommit={(value) => updateDevice(device.id, (d) => ({ ...d, name: value.trim() }))}
            />
            {device.type === "pc" ? (
              <PcForm device={device} runtime={runtime} highlight={highlight} />
            ) : null}
            <Field
              label="网络区域"
              field="zone"
              value={device.zone ?? ""}
              placeholder="未分组"
              onCommit={(zone) => updateDevice(device.id, (d) => ({ ...d, zone: zone.trim() }))}
            />
            {device.type === "server" ? (
              <ServerForm device={device} runtime={runtime} highlight={highlight} />
            ) : null}
            {device.type === "proxy" ? (
              <ProxyForm device={device} runtime={runtime} highlight={highlight} />
            ) : null}
            {device.type === "access-control" ? (
              <AccessControlForm device={device} highlight={highlight} />
            ) : null}
            {device.type === "router" ? (
              <RouterForm
                device={device}
                runtime={runtime}
                highlight={highlight}
                highlightPortId={highlightPortId}
                hidePorts
              />
            ) : null}
            {device.type === "switch" ? (
              <SwitchForm
                device={device}
                highlight={highlight}
                highlightPortId={highlightPortId}
                hidePorts
              />
            ) : null}
            {device.type === "ap" ? <ApForm device={device} highlight={highlight} /> : null}
            {device.type === "modem" ? (
              <ModemForm device={device} runtime={runtime} highlight={highlight} />
            ) : null}
            {device.type === "internet" ? (
              <InternetForm device={device} highlight={highlight} />
            ) : null}
            {device.type === "pc" ||
            device.type === "server" ||
            device.type === "proxy" ||
            device.type === "router" ||
            device.type === "access-control" ? (
              <AccessPolicyForm device={device} highlight={highlight} />
            ) : null}
            <div className="panel-danger-zone">
              <GroupActions ids={[device.id]} />
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => useTopologyStore.getState().removeDevice(device.id)}
              >
                <Trash2 size={14} />
                删除设备
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
