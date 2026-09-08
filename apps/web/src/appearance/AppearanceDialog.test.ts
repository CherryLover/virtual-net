// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseTopology, sampleTopology } from "../engine";
import { useTopologyStore } from "../store";
import { AppearanceDialog } from "./AppearanceDialog";
import { PageTheme } from "./PageTheme";

let container: HTMLDivElement;
let root: Root;
const close = vi.fn();
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useTopologyStore.getState().replaceTopology(sampleTopology());
  useTopologyStore.setState({ past: [], future: [] });
  close.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(AppearanceDialog, { onClose: close })));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const click = async (label: string) => {
  const button = Array.from(
    document.querySelectorAll<HTMLButtonElement>(".appearance-dialog button"),
  ).find((b) => b.getAttribute("aria-label") === label || b.textContent === label);
  if (!button) throw new Error(`Missing ${label}`);
  await act(async () => button.click());
};

describe("appearance dialog", () => {
  it("previews without editing, then applies one undoable saved color set without invalidating probes", async () => {
    const original = useTopologyStore.getState().topology;
    const revision = useTopologyStore.getState().topologyRevision;
    await click("晴空配色");
    expect(useTopologyStore.getState().topology).toBe(original);
    await click("应用配色");
    const next = useTopologyStore.getState();
    expect(next.topology.appearance?.accent).toBe("#00749e");
    expect(next.past).toHaveLength(1);
    expect(next.topologyRevision).toBe(revision);
    const parsed = parseTopology(JSON.stringify(next.topology));
    expect(parsed.ok && parsed.topology.appearance).toEqual(next.topology.appearance);
    await act(async () => next.undo());
    expect(useTopologyStore.getState().topology.appearance).toBeUndefined();
    await act(async () => next.redo());
    expect(useTopologyStore.getState().topology.appearance?.accent).toBe("#00749e");
  });
  it("cancel leaves topology and history unchanged", async () => {
    const original = useTopologyStore.getState().topology;
    await click("樱花配色");
    await click("取消");
    expect(useTopologyStore.getState().topology).toBe(original);
    expect(useTopologyStore.getState().past).toHaveLength(0);
    expect(close).toHaveBeenCalledOnce();
  });
  it("resets the draft and offers no canvas fill or dark mode controls", async () => {
    await click("晴空配色");
    await click("恢复默认配色");
    expect(document.querySelector<HTMLInputElement>('input[type="color"]')?.value).toBe("#027864");
    expect(document.querySelectorAll('input[type="color"]')).toHaveLength(1);
    expect(document.querySelector(".appearance-dialog")?.textContent).not.toContain("深色");
    await click("应用配色");
    expect(useTopologyStore.getState().past).toHaveLength(0);
  });
  it("applies one root accent and ignores an old dark page preference", async () => {
    localStorage.setItem("virtual-net.page-theme", "dark");
    document.documentElement.dataset.pageTheme = "dark";
    await click("晴空配色");
    await click("应用配色");
    await act(async () => root.render(createElement(PageTheme)));
    expect(document.documentElement.dataset.pageTheme).toBeUndefined();
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#00749e");
    localStorage.removeItem("virtual-net.page-theme");
  });
});
