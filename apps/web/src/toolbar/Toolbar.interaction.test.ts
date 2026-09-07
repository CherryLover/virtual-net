// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureSparePorts, sampleTopology } from "../engine";
import { servicesTopology } from "../engine/serviceSample";
import { useStorageStatus } from "../storage";
import { useTopologyStore } from "../store";
import { Toolbar } from "./Toolbar";

let root: Root;
let container: HTMLDivElement;

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useTopologyStore.getState().replaceTopology(sampleTopology());
  useTopologyStore.setState({ past: [], future: [] });
  useStorageStatus.setState({ phase: "ready", message: null });
  window.confirm = vi.fn(() => true);
  window.alert = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(Toolbar, { onHelp: () => {} })));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, "confirm");
  Reflect.deleteProperty(window, "alert");
  vi.unstubAllGlobals();
});

async function choose(file?: File) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("file input missing");
  Object.defineProperty(input, "files", { configurable: true, value: file ? [file] : [] });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
  });
  return input;
}

describe("Toolbar file input component events", () => {
  it("imports presentation and simulated proxy credentials after confirmation; undo restores the old graph", async () => {
    const original = structuredClone(useTopologyStore.getState().topology);
    const incoming = ensureSparePorts(servicesTopology());
    const link = incoming.links[0];
    const port = incoming.devices.find((device) => device.type === "switch")?.ports[0];
    const proxy = incoming.devices.find((device) => device.type === "proxy");
    if (!link || !port || !proxy) throw new Error("fixture incomplete");
    link.curve = { source: { x: -43, y: 87 }, target: { x: 98, y: -32 } };
    port.displaySide = "right";
    proxy.config.proxy.auth = "password";
    proxy.config.proxy.username = "test-only-user";
    proxy.config.proxy.password = "simulated-password";
    const input = await choose(
      new File([JSON.stringify(incoming)], "network.json", { type: "application/json" }),
    );
    expect(window.confirm).toHaveBeenCalledWith("替换当前画布？");
    expect(window.alert).not.toHaveBeenCalled();
    expect(useTopologyStore.getState().topology).toEqual(incoming);
    expect(useTopologyStore.getState().past).toHaveLength(1);
    expect(input.value).toBe("");
    const undo = container.querySelector<HTMLButtonElement>('button[aria-label="撤销"]');
    if (!undo) throw new Error("undo button missing");
    await act(async () => undo.click());
    expect(useTopologyStore.getState().topology).toEqual({
      ...original,
      viewport: incoming.viewport,
    });
  });
  it("keeps the original graph on malformed JSON", async () => {
    const before = useTopologyStore.getState().topology;
    await choose(new File(["{broken"], "broken.json"));
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining("文件格式不对"));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(useTopologyStore.getState().topology).toBe(before);
    expect(useTopologyStore.getState().past).toHaveLength(0);
  });
  it("keeps the original graph when reading the selected file fails", async () => {
    const before = useTopologyStore.getState().topology;
    const file = new File(["unused"], "unreadable.json");
    vi.spyOn(file, "text").mockRejectedValue(new Error("read denied"));
    await choose(file);
    expect(window.alert).toHaveBeenCalledWith("无法读取文件，请重新选择。");
    expect(useTopologyStore.getState().topology).toBe(before);
    expect(useTopologyStore.getState().past).toHaveLength(0);
  });
  it("does not replace the graph when the user declines confirmation or cancels file selection", async () => {
    const before = useTopologyStore.getState().topology;
    vi.mocked(window.confirm).mockReturnValue(false);
    await choose(new File([JSON.stringify(servicesTopology())], "valid.json"));
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(useTopologyStore.getState().topology).toBe(before);
    await choose();
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(window.alert).not.toHaveBeenCalled();
    expect(useTopologyStore.getState().past).toHaveLength(0);
  });
});
