// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TraceView } from "./traceView";
import { VisitBadges } from "./VisitBadges";

const { openInspector, nodes } = vi.hoisted(() => ({
  openInspector: vi.fn(),
  nodes: [{ id: "pc", position: { x: 120, y: 180 }, measured: { width: 160 } }],
}));
vi.mock("@xyflow/react", () => ({ useNodes: () => nodes }));
vi.mock("../../store", () => ({ useTraceStore: { getState: () => ({ openInspector }) } }));

let container: HTMLDivElement;
let root: Root;
const view: TraceView = {
  visits: new Map([
    [
      "pc",
      [
        { seq: 1, active: false },
        { seq: 12, active: true },
      ],
    ],
  ]),
  walkedLinkIds: new Set(),
  activeDeviceId: "pc",
  stoppedDeviceId: null,
  segment: null,
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  openInspector.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("visit badges", () => {
  it("leaves room above the node for port labels and bounds the badge width", async () => {
    await act(async () => root.render(createElement(VisitBadges, { view })));
    const badge = container.querySelector<HTMLElement>(".trace-badge");
    expect(badge?.style.left).toBe("120px");
    expect(badge?.style.top).toBe("144px");
    expect(badge?.style.maxWidth).toBe("160px");
  });

  it("keeps every visit clickable and marks the current step independently", async () => {
    await act(async () => root.render(createElement(VisitBadges, { view })));
    const buttons = container.querySelectorAll<HTMLButtonElement>("button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.getAttribute("aria-current")).toBeNull();
    expect(buttons[1]?.getAttribute("aria-current")).toBe("step");
    expect(buttons[1]?.getAttribute("aria-label")).toBe("第 12 跳 · 查看包头");
    await act(async () => buttons[0]?.click());
    expect(openInspector).toHaveBeenCalledWith(1);
    await act(async () => buttons[1]?.click());
    expect(openInspector).toHaveBeenLastCalledWith(12);
  });

  it("does not leave floating badges for missing nodes", async () => {
    const missing = { ...view, visits: new Map([["missing", [{ seq: 3, active: false }]]]) };
    await act(async () => root.render(createElement(VisitBadges, { view: missing })));
    expect(container.querySelector(".trace-badge")).toBeNull();
  });
});
