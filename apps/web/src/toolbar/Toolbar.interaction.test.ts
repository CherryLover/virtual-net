// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureSparePorts, sampleTopology } from "../engine";
import { servicesTopology } from "../engine/serviceSample";
import { useStorageStatus } from "../storage";
import { useTopologyStore } from "../store";
import { Toolbar } from "./Toolbar";

vi.mock("../storage/db", () => ({
  backupBeforeImport: vi.fn(async () => {}),
  loadImportBackup: vi.fn(async () => null),
}));

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
  if (!container.querySelector(".import-dialog")) {
    const trigger = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((b) =>
      b.textContent?.includes("导入文件"),
    );
    await act(async () => trigger?.click());
  }
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("file input missing");
  Object.defineProperty(input, "files", { configurable: true, value: file ? [file] : [] });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
  });
  return input;
}

async function confirmImport() {
  const button = Array.from(
    container.querySelectorAll<HTMLButtonElement>(".import-dialog footer button"),
  ).find((b) => /确认导入|仍然导入/.test(b.textContent ?? ""));
  if (!button || button.disabled) throw new Error("import confirmation missing or disabled");
  await act(async () => button.click());
}

describe("Toolbar file input component events", () => {
  it("places fixed editing commands before the network name and its save status", () => {
    const header = container.querySelector(".toolbar");
    if (!header) throw new Error("toolbar missing");
    const children = Array.from(header.children);
    const actions = header.querySelector(".toolbar-actions");
    const name = header.querySelector(".toolbar-name");
    const status = header.querySelector('[role="status"]');
    if (!actions || !name || !status) throw new Error("toolbar controls missing");
    expect(children.indexOf(actions)).toBeLessThan(children.indexOf(name));
    expect(name.nextElementSibling).toBe(status);
    expect(actions.querySelector('[aria-label="撤销"]')).not.toBeNull();
    expect(actions.querySelector('[aria-label="重做"]')).not.toBeNull();
  });

  it("keeps a compact entry for choosing a probe source without selecting a node", async () => {
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="选择起点验证"]');
    expect(trigger?.textContent).toBe("");
    expect(trigger?.title).toBe("选择起点验证");
    if (!trigger) throw new Error("probe trigger missing");
    await act(async () => trigger.click());
    expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("网络验证");
    const source = container.querySelector<HTMLSelectElement>('[id$="-source"]');
    expect(source?.options.length).toBeGreaterThan(0);
    const close = container.querySelector<HTMLButtonElement>('button[aria-label="关闭"]');
    await act(async () => close?.click());
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

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
    expect(useTopologyStore.getState().topology).toEqual(original);
    expect(container.querySelector(".import-dialog")).not.toBeNull();
    await confirmImport();
    expect(window.confirm).not.toHaveBeenCalled();
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
    expect(container.textContent).toContain("内容不是有效 JSON");
    expect(window.alert).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(useTopologyStore.getState().topology).toBe(before);
    expect(useTopologyStore.getState().past).toHaveLength(0);
  });
  it("keeps the original graph when reading the selected file fails", async () => {
    const before = useTopologyStore.getState().topology;
    const file = new File(["unused"], "unreadable.json");
    vi.spyOn(file, "text").mockRejectedValue(new Error("read denied"));
    await choose(file);
    expect(container.textContent).toContain("无法读取文件");
    expect(window.alert).not.toHaveBeenCalled();
    expect(useTopologyStore.getState().topology).toBe(before);
    expect(useTopologyStore.getState().past).toHaveLength(0);
  });
  it("does not replace the graph when the user declines confirmation or cancels file selection", async () => {
    const before = useTopologyStore.getState().topology;
    await choose(new File([JSON.stringify(servicesTopology())], "valid.json"));
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="关闭导入"]')?.click(),
    );
    expect(window.confirm).not.toHaveBeenCalled();
    expect(useTopologyStore.getState().topology).toBe(before);
    await choose();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(window.alert).not.toHaveBeenCalled();
    expect(useTopologyStore.getState().past).toHaveLength(0);
  });
});
