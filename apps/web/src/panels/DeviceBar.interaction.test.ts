// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyTopology } from "../engine";
import { useTopologyStore } from "../store";
import { useLayoutStore } from "../store/layout";
import { DeviceBar } from "./DeviceBar";

vi.mock("@xyflow/react", () => ({
  useReactFlow: () => ({ screenToFlowPosition: (point: { x: number; y: number }) => point }),
}));

let container: HTMLDivElement;
let canvas: HTMLDivElement;
let root: Root;

function find<T extends Element>(selector: string): T {
  const element = container.querySelector<T>(selector);
  if (!element) throw new Error(`Missing library element: ${selector}`);
  return element;
}

async function search(value: string) {
  const input = find<HTMLInputElement>('[aria-label="搜索设备"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setter) throw new Error("native input setter missing");
  await act(async () => {
    input.focus();
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useTopologyStore.getState().replaceTopology(emptyTopology());
  useTopologyStore.setState({ past: [], future: [] });
  useLayoutStore.setState({ libraryOpen: true });
  container = document.createElement("div");
  canvas = document.createElement("div");
  canvas.className = "canvas";
  document.body.append(container, canvas);
  root = createRoot(container);
  await act(async () => root.render(createElement(DeviceBar)));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  canvas.remove();
  vi.unstubAllGlobals();
});

describe("grouped device library", () => {
  it("collapses a category, auto-expands search results, and restores all entries on clear", async () => {
    const toggle = find<HTMLButtonElement>('[aria-controls="library-services"]');
    await act(async () => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(find<HTMLElement>("#library-services").hidden).toBe(true);
    await search("SOCKS");
    expect(
      find<HTMLButtonElement>('[aria-controls="library-services"]').getAttribute("aria-expanded"),
    ).toBe("true");
    expect(find<HTMLElement>("#library-services").hidden).toBe(false);
    expect(container.querySelectorAll(".device-card")).toHaveLength(1);
    expect(find<HTMLElement>(".library-count").textContent).toBe("1");
    await act(async () => find<HTMLButtonElement>('[aria-label="清除搜索"]').click());
    expect(container.querySelectorAll(".device-card")).toHaveLength(9);
    expect(container.querySelectorAll(".library-group")).toHaveLength(3);
  });
  it("adds the same proxy entity from filtered results and preserves single-step undo", async () => {
    await search("HTTP");
    await act(async () => find<HTMLButtonElement>('[data-device-type="proxy"]').click());
    expect(useTopologyStore.getState().topology.devices.map((d) => d.type)).toEqual(["proxy"]);
    expect(useTopologyStore.getState().past).toHaveLength(1);
    await act(async () => useTopologyStore.getState().undo());
    expect(useTopologyStore.getState().topology.devices).toHaveLength(0);
  });
  it("shows an empty state and returns DNS searches to the existing server entry", async () => {
    await search("unknown device");
    expect(container.querySelectorAll(".library-group")).toHaveLength(0);
    expect(find<HTMLElement>(".panel-empty").textContent).toBe("没有匹配的设备");
    await search("DNS");
    expect(container.querySelector(".panel-empty")).toBeNull();
    expect(find<HTMLElement>(".device-card").getAttribute("data-device-type")).toBe("server");
  });
});
