// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sampleTopology } from "../engine";
import { useTopologyStore } from "../store";
import { SelectionActions } from "./SelectionActions";

let root: Root;
let host: HTMLDivElement;
const close = vi.fn();
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useTopologyStore.getState().replaceTopology(sampleTopology());
  useTopologyStore.setState({ past: [], future: [] });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  close.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const render = async () => {
  await act(async () =>
    root.render(createElement(SelectionActions, { menu: { x: 30, y: 30 }, onClose: close })),
  );
};
const click = async (name: string) => {
  const button = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
    (el) => el.textContent === name,
  );
  if (!button) throw Error(name);
  await act(async () => button.click());
};
it("groups selected devices in one undoable operation", async () => {
  const ids = useTopologyStore
    .getState()
    .topology.devices.slice(0, 2)
    .map((d) => d.id);
  useTopologyStore.getState().select({ kind: "devices", ids });
  await render();
  await click("成组");
  expect(useTopologyStore.getState().topology.groups?.[0]?.deviceIds).toEqual(ids);
  expect(useTopologyStore.getState().past).toHaveLength(1);
  expect(close).toHaveBeenCalledOnce();
  await act(async () => useTopologyStore.getState().undo());
  expect(useTopologyStore.getState().topology.groups ?? []).toHaveLength(0);
});
it("splits multiple selected groups atomically without deleting devices or links", async () => {
  const store = useTopologyStore.getState();
  const ids = store.topology.devices.map((d) => d.id);
  store.createGroup(ids.slice(0, 2));
  store.createGroup(ids.slice(2));
  store.select({ kind: "devices", ids });
  const before = useTopologyStore.getState().topology;
  const history = useTopologyStore.getState().past.length;
  await render();
  await click("拆分成组");
  expect(useTopologyStore.getState().topology.groups).toHaveLength(0);
  expect(useTopologyStore.getState().topology.devices).toEqual(before.devices);
  expect(useTopologyStore.getState().topology.links).toEqual(before.links);
  expect(useTopologyStore.getState().past).toHaveLength(history + 1);
  await act(async () => useTopologyStore.getState().undo());
  expect(useTopologyStore.getState().topology.groups).toEqual(before.groups);
});
it("disables inapplicable commands and dismisses with Escape", async () => {
  await render();
  expect(
    [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].every(
      (el) => el.disabled,
    ),
  ).toBe(true);
  await act(async () =>
    document
      .querySelector('[role="menu"]')
      ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
  );
  expect(close).toHaveBeenCalledOnce();
  expect(useTopologyStore.getState().past).toHaveLength(0);
});
