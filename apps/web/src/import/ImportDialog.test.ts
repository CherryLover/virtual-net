// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyTopology, sampleTopology } from "../engine";
import { useStorageStatus } from "../storage";
import { useTopologyStore } from "../store";
import { ImportDialog } from "./ImportDialog";

const mocks = vi.hoisted(() => ({ backup: vi.fn(), loadBackup: vi.fn() }));
vi.mock("../storage/db", () => ({
  backupBeforeImport: mocks.backup,
  loadImportBackup: mocks.loadBackup,
  load: vi.fn(),
  save: vi.fn(),
}));
let root: Root;
let container: HTMLDivElement;
const close = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useTopologyStore.getState().replaceTopology(sampleTopology());
  useTopologyStore.setState({ past: [], future: [] });
  useStorageStatus.setState({ phase: "ready", message: null });
  mocks.backup.mockReset().mockResolvedValue(undefined);
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
async function mount(initialFile?: File) {
  await act(async () => root.render(createElement(ImportDialog, { onClose: close, initialFile })));
}
function button(text: string) {
  const result = Array.from(container.querySelectorAll("button")).find(
    (item) => item.textContent === text,
  );
  if (!result) throw Error(`Missing ${text}`);
  return result;
}
async function choose(file: File) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw Error();
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
}
const incoming = () => new File([JSON.stringify(emptyTopology())], "incoming.json");

describe("import dialog interaction", () => {
  it("does not replace until confirmed, backs up original, and supports one-step undo", async () => {
    const original = useTopologyStore.getState().topology;
    await mount(incoming());
    expect(useTopologyStore.getState().topology).toBe(original);
    await act(async () => button("确认导入").click());
    expect(mocks.backup).toHaveBeenCalledWith(original);
    expect(useTopologyStore.getState().topology.devices).toHaveLength(0);
    expect(useTopologyStore.getState().past).toHaveLength(1);
    await act(async () => useTopologyStore.getState().undo());
    expect(useTopologyStore.getState().topology.devices).toEqual(original.devices);
  });
  it("disables confirmation on invalid file; cancel leaves selection and history alone", async () => {
    const before = useTopologyStore.getState();
    await mount(new File(["{"], "bad.json"));
    expect(button("确认导入").disabled).toBe(true);
    await act(async () => button("取消").click());
    expect(close).toHaveBeenCalled();
    expect(useTopologyStore.getState()).toBe(before);
    expect(mocks.backup).not.toHaveBeenCalled();
  });
  it("ignores old asynchronous read after reselecting a file", async () => {
    let finish = (_value: string) => {};
    const first = new File(["{}"], "slow.json");
    Object.defineProperty(first, "text", {
      value: () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    });
    await mount(first);
    await choose(incoming());
    await act(async () => finish(JSON.stringify({ version: 999 })));
    expect(button("确认导入").disabled).toBe(false);
    expect(container.textContent).not.toContain("版本高于支持");
  });
  it("keeps original when backup fails and allows retry", async () => {
    const original = useTopologyStore.getState().topology;
    mocks.backup.mockRejectedValueOnce(Error("quota"));
    await mount(incoming());
    await act(async () => button("确认导入").click());
    expect(useTopologyStore.getState().topology).toBe(original);
    expect(container.textContent).toContain("当前画布未替换");
    await act(async () => button("确认导入").click());
    expect(close).toHaveBeenCalledTimes(1);
  });
  it("requires fresh confirmation when current graph changed", async () => {
    await mount(incoming());
    await act(async () => useTopologyStore.getState().rename("latest"));
    await act(async () => button("确认导入").click());
    expect(mocks.backup).not.toHaveBeenCalled();
    await act(async () => button("确认替换最新原图").click());
    expect(mocks.backup.mock.calls[0]?.[0].name).toBe("latest");
  });
  it("supports Escape and wraps keyboard focus", async () => {
    await mount();
    const dialog = container.querySelector('[role="dialog"]');
    if (!dialog) throw Error();
    button("取消").focus();
    await act(async () =>
      button("取消").dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
      ),
    );
    expect(document.activeElement?.getAttribute("aria-label")).toBe("关闭导入");
    await act(async () =>
      dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    expect(close).toHaveBeenCalled();
  });
});
