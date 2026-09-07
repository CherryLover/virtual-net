import { Position as Side } from "@xyflow/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Segment } from "../trace/timeline";
import { automaticControl, curveGeometry } from "./curve";
import { packetPoint } from "./trace/geometry";

describe("editable curve geometry", () => {
  const curve = { source: { x: 50, y: -20 }, target: { x: -50, y: 20 } };
  it("keeps each control relative to its own endpoint", () => {
    const initial = curveGeometry({ x: 0, y: 0 }, { x: 200, y: 0 }, curve);
    const moved = curveGeometry({ x: 20, y: 40 }, { x: 200, y: 0 }, curve);
    expect(moved.a).toEqual({ x: initial.a.x + 20, y: initial.a.y + 40 });
    expect(moved.b).toEqual(initial.b);
    const both = curveGeometry({ x: 20, y: 40 }, { x: 220, y: 40 }, curve);
    expect(both.label).toEqual({ x: initial.label.x + 20, y: initial.label.y + 40 });
  });
  it("starts facing the selected side, with aligned peers avoiding an unnecessary detour", () => {
    expect(automaticControl({ x: 0, y: 0 }, { x: 200, y: 0 }, Side.Right)).toEqual({
      x: 100,
      y: 0,
    });
    expect(automaticControl({ x: 200, y: 0 }, { x: 0, y: 0 }, Side.Left)).toEqual({
      x: -100,
      y: 0,
    });
    expect(curveGeometry({ x: 0, y: 0 }, { x: 200, y: 0 }, curve).label).toEqual({ x: 100, y: 0 });
  });
});

describe("animation follows the current SVG path", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("samples the rendered path in both directions and resamples a changed curve", () => {
    let length = 200;
    const getPointAtLength = vi.fn((at: number) => ({ x: at, y: at / 2 }));
    const querySelector = vi.fn(() => ({ getTotalLength: () => length, getPointAtLength }));
    vi.stubGlobal("document", { querySelector });
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    const flow = {
      getEdge: () => ({ id: "edge", source: "a", target: "b" }),
      getInternalNode: () => undefined,
    };
    const segment: Segment = {
      index: 0,
      seq: 1,
      phase: "tcp",
      kind: "travel",
      deviceId: "a",
      toDeviceId: "b",
      linkId: "edge",
      style: "normal",
      startMs: 100,
      endMs: 500,
    };
    expect(packetPoint(flow, segment, 200)).toEqual({ x: 50, y: 25 });
    expect(querySelector).toHaveBeenCalledWith(
      '.react-flow__edge[data-id="edge"] path.react-flow__edge-path',
    );
    expect(packetPoint(flow, { ...segment, deviceId: "b", toDeviceId: "a" }, 200)).toEqual({
      x: 150,
      y: 75,
    });
    length = 400;
    expect(packetPoint(flow, segment, 200)).toEqual({ x: 100, y: 50 });
    expect(packetPoint(flow, segment, 0)).toEqual({ x: 0, y: 0 });
    expect(packetPoint(flow, segment, 800)).toEqual({ x: 400, y: 200 });
  });
});
