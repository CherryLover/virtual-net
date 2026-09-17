// @vitest-environment happy-dom
import { act, createElement, Fragment, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleTopology } from "../engine";
import { usePrivacyStore } from "../privacy/display";
import { useTopologyStore } from "../store";
import { useLayoutStore } from "../store/layout";
import { DeviceSearchDialog } from "./DeviceSearchDialog";

const { fitView } = vi.hoisted(() => ({ fitView: vi.fn() }));
vi.mock("@xyflow/react", () => ({ useReactFlow: () => ({ fitView }) }));
let container: HTMLDivElement;
let root: Root;
let frames: FrameRequestCallback[];
const close = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("innerWidth", 1200);
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  useTopologyStore.getState().replaceTopology(sampleTopology());
  usePrivacyStore.setState({ hidden: false });
  useLayoutStore.setState({ inspectorOpen: false, libraryOpen: true });
  close.mockReset();
  fitView.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
function SelectionInspectorEffect() {
  const selection = useTopologyStore((state) => state.selection);
  useEffect(() => {
    if (selection.kind !== "none") useLayoutStore.getState().openInspector();
  }, [selection]);
  return null;
}
const mount = () =>
  act(async () =>
    root.render(
      createElement(
        Fragment,
        null,
        createElement(SelectionInspectorEffect),
        createElement(DeviceSearchDialog, { onClose: close }),
      ),
    ),
  );
const searchInput = () => {
  const input = document.querySelector<HTMLInputElement>(".device-search-form input");
  if (!input) throw new Error("Missing search input");
  return input;
};
const typeQuery = (value: string) =>
  act(async () => {
    const input = searchInput();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
const submit = () =>
  act(async () => {
    document
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
const flushFrames = () =>
  act(async () => {
    while (frames.length) frames.shift()?.(0);
  });

describe("device search dialog", () => {
  it("selects a result and centers after closing and applying the side panel layout", async () => {
    await mount();
    const device = useTopologyStore.getState().topology.devices[0];
    if (!device) throw new Error("Missing device");
    await act(async () =>
      document.querySelector<HTMLButtonElement>(".device-search-result")?.click(),
    );
    expect(close).toHaveBeenCalledOnce();
    expect(useTopologyStore.getState().selection).toEqual({ kind: "device", id: device.id });
    expect(useLayoutStore.getState().inspectorOpen).toBe(true);
    expect(fitView).not.toHaveBeenCalled();
    await flushFrames();
    expect(fitView).toHaveBeenCalledWith(
      expect.objectContaining({ nodes: [{ id: device.id }], maxZoom: 1 }),
    );
  });

  it("keeps the located device visible on phones instead of opening an overlay", async () => {
    vi.stubGlobal("innerWidth", 390);
    useLayoutStore.setState({ inspectorOpen: true });
    await mount();
    await act(async () =>
      document.querySelector<HTMLButtonElement>(".device-search-result")?.click(),
    );
    expect(useLayoutStore.getState().inspectorOpen).toBe(true);
    await flushFrames();
    expect(useLayoutStore.getState().inspectorOpen).toBe(false);
    expect(useLayoutStore.getState().libraryOpen).toBe(false);
  });

  it("redacts all result names, addresses, group labels and tooltips when privacy changes", async () => {
    const topology = sampleTopology();
    const device = topology.devices[0];
    if (!device) throw new Error("Missing device");
    device.name = "Device 10.42.42.42";
    topology.groups = [{ id: "private", name: "Group 10.42.42.43", deviceIds: [device.id] }];
    useTopologyStore.getState().replaceTopology(topology);
    await mount();
    expect(document.querySelector("dialog")?.textContent).toContain("10.42.42.42");
    await typeQuery("10.42.42.42");
    expect(searchInput().value).toBe("10.42.42.42");
    expect(document.querySelectorAll(".device-search-result")).toHaveLength(1);
    await act(async () => usePrivacyStore.getState().toggle());
    expect(searchInput().value).toBe("");
    expect(document.querySelector("dialog")?.innerHTML).not.toMatch(/10\.42\.42\./);
    expect(document.querySelector("dialog")?.textContent).toContain("地址");
  });

  it("filters search input and Enter submission locates the matching result", async () => {
    const device = useTopologyStore.getState().topology.devices.at(-1);
    if (!device) throw new Error("Missing device");
    await mount();
    await typeQuery(device.name);
    expect(document.querySelectorAll(".device-search-result")).toHaveLength(1);
    await submit();
    expect(useTopologyStore.getState().selection).toEqual({ kind: "device", id: device.id });
    expect(close).toHaveBeenCalledOnce();
  });

  it("does not change selection or close on an unmatched query", async () => {
    await mount();
    await typeQuery("no such device");
    expect(document.querySelectorAll(".device-search-result")).toHaveLength(0);
    expect(document.querySelector("dialog")?.textContent).toContain("未找到设备");
    await submit();
    expect(useTopologyStore.getState().selection).toEqual({ kind: "none" });
    expect(close).not.toHaveBeenCalled();
  });

  it("Escape preserves the previous selection even with a query", async () => {
    const device = useTopologyStore.getState().topology.devices[0];
    if (!device) throw new Error("Missing device");
    useTopologyStore.getState().select({ kind: "device", id: device.id });
    await mount();
    await typeQuery("no such device");
    const keyEvent = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    await act(async () => searchInput().dispatchEvent(keyEvent));
    expect(keyEvent.defaultPrevented).toBe(true);
    expect(useTopologyStore.getState().selection).toEqual({ kind: "device", id: device.id });
    expect(close).toHaveBeenCalledOnce();
  });
});
