// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SelectionActions } from "../canvas/SelectionActions";
import { usePrivacyStore } from "../privacy/display";
import { useTopologyStore } from "../store";
import { minimalTopology } from "../trace/testProbes";
import { GroupPanel } from "./GroupPanel";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const topology = minimalTopology();
  const device = topology.devices[0];
  if (!device) throw new Error("Missing device");
  device.name = "PC 192.168.1.10";
  useTopologyStore.getState().replaceTopology(topology);
  useTopologyStore.getState().createGroup(
    topology.devices.slice(0, 2).map((device) => device.id),
    "Office 192.168.1.1",
  );
  useTopologyStore.setState({ past: [], future: [] });
  usePrivacyStore.setState({ hidden: false });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  usePrivacyStore.setState({ hidden: false });
  vi.unstubAllGlobals();
});
function group() {
  const group = useTopologyStore.getState().topology.groups?.[0];
  if (!group) throw new Error("Missing group");
  return group;
}
async function mount() {
  await act(async () => root.render(createElement(GroupPanel, { group: group() })));
}
async function click(label: string) {
  const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`Missing ${label}`);
  await act(async () => button.click());
}

describe("explicit group actions", () => {
  it("offers separate cancellation and deletion commands", async () => {
    const before = useTopologyStore.getState().topology;
    await mount();
    await click("取消成组");
    expect(useTopologyStore.getState().topology.devices).toEqual(before.devices);
    expect(useTopologyStore.getState().selection.kind).toBe("devices");
    expect(document.querySelector('button[aria-label="删除组内设备"]')).not.toBeNull();
  });
  it("deletes all members from the panel in one undo step", async () => {
    const before = useTopologyStore.getState().topology;
    await mount();
    await click("删除组内设备");
    expect(useTopologyStore.getState().topology.devices).toHaveLength(before.devices.length - 2);
    expect(useTopologyStore.getState().past).toHaveLength(1);
    await act(async () => useTopologyStore.getState().undo());
    expect(useTopologyStore.getState().topology).toEqual(before);
  });
  it("redacts group and member names without exposing an editable raw name", async () => {
    usePrivacyStore.setState({ hidden: true });
    const before = useTopologyStore.getState().topology;
    await mount();
    expect(container.innerHTML).not.toContain("192.168.");
    expect(container.querySelector('input[aria-label="组名"]')).toBeNull();
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(
      before.devices.length,
    );
    expect(useTopologyStore.getState().topology).toBe(before);
    await click("取消成组");
    expect(useTopologyStore.getState().topology.devices).toEqual(before.devices);
  });
  it("uses the same explicit labels in the context menu", async () => {
    await act(async () => root.render(createElement(SelectionActions, { menu: { x: 10, y: 10 } })));
    const labels = Array.from(document.querySelectorAll('[role="menuitem"]')).map(
      (button) => button.textContent,
    );
    expect(labels).toContain("取消成组");
    expect(labels).toContain("删除组内设备");
    const button = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    ).find((button) => button.textContent === "删除组内设备");
    await act(async () => button?.click());
    expect(useTopologyStore.getState().topology.groups).toHaveLength(0);
    expect(useTopologyStore.getState().past).toHaveLength(1);
  });
});
