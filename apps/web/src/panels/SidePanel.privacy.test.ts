// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sampleTopology } from "../engine";
import { usePrivacyStore } from "../privacy/display";
import { useTopologyStore } from "../store";
import { useLayoutStore } from "../store/layout";
import { SidePanel } from "./SidePanel";

vi.mock("@xyflow/react", () => ({ useReactFlow: () => ({ getNode: () => undefined }) }));

let container: HTMLDivElement;
let root: Root;
function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("Missing test fixture");
  return value;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const topology = sampleTopology();
  const device = required(topology.devices[0]);
  device.name = "设备 192.168.99.1";
  required(device.ports[0]).name = "端口 192.168.99.2";
  useTopologyStore.getState().replaceTopology(topology);
  useTopologyStore.getState().createGroup(topology.devices.slice(0, 2).map((d) => d.id));
  const group = required(useTopologyStore.getState().topology.groups?.[0]);
  useTopologyStore.getState().renameGroup(group.id, "分组 192.168.99.3");
  usePrivacyStore.setState({ hidden: true });
  useLayoutStore.setState({ inspectorOpen: true });
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
const mount = () => act(async () => root.render(createElement(SidePanel)));
const privateMarkup = () => {
  expect(container.innerHTML).not.toContain("192.168.99.");
  expect(container.querySelector("input.field-input")).toBeNull();
  expect(
    container.querySelector<HTMLButtonElement>('[aria-label="查看全部验证结果"]')?.disabled,
  ).toBe(true);
};

it("keeps device copy and group controls without mounting configuration fields", async () => {
  const device = required(useTopologyStore.getState().topology.devices[0]);
  useTopologyStore.getState().select({ kind: "device", id: device.id });
  await mount();
  privateMarkup();
  expect(container.textContent).toContain("配置已隐藏");
  const count = useTopologyStore.getState().topology.devices.length;
  await act(async () =>
    required(container.querySelector<HTMLButtonElement>('[aria-label="复制所选设备"]')).click(),
  );
  expect(useTopologyStore.getState().topology.devices).toHaveLength(count + 1);
  privateMarkup();
});

it("keeps multiselection alignment and grouping actions", async () => {
  const ids = useTopologyStore
    .getState()
    .topology.devices.slice(0, 2)
    .map((d) => d.id);
  useTopologyStore.getState().select({ kind: "devices", ids });
  await mount();
  privateMarkup();
  await act(async () =>
    required(container.querySelector<HTMLButtonElement>('[aria-label="左对齐"]')).click(),
  );
  const devices = useTopologyStore.getState().topology.devices.filter((d) => ids.includes(d.id));
  expect(required(devices[0]).position.x).toBe(required(devices[1]).position.x);
  expect(container.querySelector('[aria-label="建立分组"]')).not.toBeNull();
});

it("keeps group member editing while hiding address-bearing names", async () => {
  const group = required(useTopologyStore.getState().topology.groups?.[0]);
  useTopologyStore.getState().select({ kind: "group", id: group.id });
  await mount();
  privateMarkup();
  expect(container.querySelector('[aria-label="复制分组"]')).not.toBeNull();
  const checkbox = required(
    container.querySelector<HTMLInputElement>('input[type="checkbox"]:not(:checked)'),
  );
  await act(async () => checkbox.click());
  expect(required(useTopologyStore.getState().topology.groups?.[0]).deviceIds).toHaveLength(3);
  privateMarkup();
});

it("redacts connection endpoint labels and conceals results with no selection", async () => {
  const link = required(useTopologyStore.getState().topology.links[0]);
  useTopologyStore.getState().select({ kind: "link", id: link.id });
  await mount();
  privateMarkup();
  expect(container.textContent).toContain("网络连线");
  await act(async () => useTopologyStore.getState().select({ kind: "none" }));
  privateMarkup();
  expect(container.textContent).toContain("验证详情已隐藏");
});

it("switches an open group editor to safe content and restores the real name unchanged", async () => {
  const group = required(useTopologyStore.getState().topology.groups?.[0]);
  usePrivacyStore.setState({ hidden: false });
  useTopologyStore.getState().select({ kind: "group", id: group.id });
  const before = useTopologyStore.getState().topology;
  await mount();
  expect(container.querySelector<HTMLInputElement>('[aria-label="组名"]')?.value).toBe(group.name);
  await act(async () => usePrivacyStore.getState().toggle());
  privateMarkup();
  await act(async () => usePrivacyStore.getState().toggle());
  expect(container.querySelector<HTMLInputElement>('[aria-label="组名"]')?.value).toBe(group.name);
  expect(useTopologyStore.getState().topology).toBe(before);
});
