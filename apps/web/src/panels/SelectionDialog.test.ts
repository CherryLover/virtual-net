// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyTopology, sampleTopology } from "../engine";
import { useTopologyStore } from "../store";
import { useLayoutStore } from "../store/layout";
import { SelectionDialog } from "./SelectionDialog";

let container: HTMLDivElement;
let root: Root;
const close = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useTopologyStore.getState().replaceTopology(sampleTopology());
  useTopologyStore.setState({ past: [], future: [] });
  useLayoutStore.setState({ inspectorOpen: false });
  close.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const mount = () =>
  act(async () => root.render(createElement(SelectionDialog, { onClose: close })));
const button = (name: string) => {
  const found = Array.from(
    document.querySelectorAll<HTMLButtonElement>(".selection-dialog button"),
  ).find((b) => b.getAttribute("aria-label") === name || b.textContent === name);
  if (!found) throw new Error(`Missing ${name}`);
  return found;
};
const click = (name: string) => act(async () => button(name).click());
const checkboxes = () =>
  Array.from(
    document.querySelectorAll<HTMLInputElement>('.selection-dialog input[type="checkbox"]'),
  );

describe("touch-friendly device selection", () => {
  it("selects all and confirms without modifying topology, then opens the inspector", async () => {
    const topology = useTopologyStore.getState().topology;
    await mount();
    expect(document.querySelector<HTMLDialogElement>("dialog")?.open).toBe(true);
    await click("全选设备");
    expect(checkboxes().every((c) => c.checked)).toBe(true);
    expect(useTopologyStore.getState().selection).toEqual({ kind: "none" });
    await click("确认选择");
    expect(useTopologyStore.getState().selection).toEqual({
      kind: "devices",
      ids: topology.devices.map((d) => d.id),
    });
    expect(useTopologyStore.getState().topology).toBe(topology);
    expect(useTopologyStore.getState().past).toHaveLength(0);
    expect(useLayoutStore.getState().inspectorOpen).toBe(true);
    expect(close).toHaveBeenCalledOnce();
  });
  it("clears draft selection, supports an individual checkbox and confirms a single device", async () => {
    const ids = useTopologyStore.getState().topology.devices.map((d) => d.id);
    useTopologyStore.getState().select({ kind: "devices", ids });
    await mount();
    await click("清空设备选择");
    expect(checkboxes().every((c) => !c.checked)).toBe(true);
    expect(button("确认选择").disabled).toBe(true);
    const first = checkboxes()[0];
    if (!first) throw new Error("Missing device");
    await act(async () => first.click());
    await click("确认选择");
    expect(useTopologyStore.getState().selection).toEqual({ kind: "device", id: ids[0] });
  });
  it("cancel preserves the original selection and does not open the inspector", async () => {
    const device = useTopologyStore.getState().topology.devices[0];
    if (!device) throw new Error("Missing device");
    useTopologyStore.getState().select({ kind: "device", id: device.id });
    await mount();
    await click("全选设备");
    await click("取消");
    expect(useTopologyStore.getState().selection).toEqual({ kind: "device", id: device.id });
    expect(useLayoutStore.getState().inspectorOpen).toBe(false);
    expect(close).toHaveBeenCalledOnce();
  });
  it("Escape cancellation preserves selection and group members initialize checked", async () => {
    const ids = useTopologyStore
      .getState()
      .topology.devices.slice(0, 2)
      .map((d) => d.id);
    useTopologyStore.getState().createGroup(ids);
    const selection = useTopologyStore.getState().selection;
    await mount();
    expect(checkboxes().filter((c) => c.checked)).toHaveLength(2);
    await click("清空设备选择");
    await act(async () => {
      document.querySelector("dialog")?.dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    expect(close).toHaveBeenCalledOnce();
    expect(useTopologyStore.getState().selection).toEqual(selection);
  });
  it("empty graph has no selectable items and disables confirm", async () => {
    useTopologyStore.getState().replaceTopology(emptyTopology());
    await mount();
    expect(document.body.textContent).toContain("暂无设备");
    expect(button("确认选择").disabled).toBe(true);
    expect(button("全选设备").disabled).toBe(true);
  });
  it("does not select devices removed while the dialog was open", async () => {
    await mount();
    await click("全选设备");
    const removed = useTopologyStore.getState().topology.devices[0];
    if (!removed) throw new Error("Missing device");
    await act(async () => useTopologyStore.getState().removeDevice(removed.id));
    await click("确认选择");
    const selection = useTopologyStore.getState().selection;
    expect(selection.kind).toBe("devices");
    if (selection.kind === "devices") expect(selection.ids).not.toContain(removed.id);
  });
});
