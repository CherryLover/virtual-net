// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { DeviceEdge } from "./DeviceEdge";

vi.mock("@xyflow/react", () => ({
  Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
  useReactFlow: () => ({ screenToFlowPosition: (point: unknown) => point }),
  BaseEdge: (props: Record<string, unknown>) =>
    createElement("svg", null, createElement("path", props)),
  EdgeLabelRenderer: ({ children }: { children: ReactNode }) => children,
}));

it("marks erroneous links with a labelled warning independent of their color", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        createElement(DeviceEdge, {
          id: "test",
          source: "a",
          target: "b",
          sourceX: 0,
          sourceY: 0,
          targetX: 100,
          targetY: 100,
          sourcePosition: "bottom",
          targetPosition: "top",
          data: { label: "eth0 - lan1", hasError: true },
        } as Parameters<typeof DeviceEdge>[0]),
      ),
    );
    expect(container.querySelector(".device-edge-error")).not.toBeNull();
    expect(container.querySelector('[role="img"][aria-label="连线配置错误"]')).not.toBeNull();
    expect(container.textContent).toContain("eth0 - lan1");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
