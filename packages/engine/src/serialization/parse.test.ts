import { describe, expect, it } from "vitest";
import { clone, MINIMAL_RAW, minimalTopology } from "../test-support/fixtures";
import { parseTopology } from "./parse";

describe("CP1-S1 parseTopology", () => {
  it("T-CP1-002 解析 minimal.json 后再序列化与原文件深比较相等", () => {
    const result = parseTopology(clone(MINIMAL_RAW));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const roundTrip: unknown = JSON.parse(JSON.stringify(result.topology));
    expect(roundTrip).toEqual(MINIMAL_RAW);
  });

  it("T-CP1-002 接受 JSON 文本", () => {
    const result = parseTopology(JSON.stringify(MINIMAL_RAW));
    expect(result.ok).toBe(true);
  });

  it("T-CP1-003 连线指向不存在的端口 → 失败，错误里带 linkId", () => {
    const broken = minimalTopology();
    const link = broken.links[0];
    if (!link) throw new Error("fixture 少了连线");
    link.b.portId = "p_不存在";
    const result = parseTopology(broken);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.linkId === link.id)).toBe(true);
    expect(result.errors[0]?.message).toContain("不存在的端口");
  });

  it("T-CP1-003 version: 2 → 失败，提示「版本高于支持」", () => {
    const future = minimalTopology();
    future.version = 2;
    const result = parseTopology(future);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain("版本高于支持");
  });

  it("T-CP1-003 其他结构错误也被挡住", () => {
    const badPortName = minimalTopology();
    const pc = badPortName.devices[0];
    if (!pc) throw new Error("fixture 少了设备");
    const port = pc.ports[0];
    if (!port) throw new Error("fixture 少了端口");
    port.name = "eth9";
    expect(parseTopology(badPortName).ok).toBe(false);

    const dupId = minimalTopology();
    const second = dupId.devices[1];
    if (!second) throw new Error("fixture 少了设备");
    second.id = dupId.devices[0]?.id ?? "";
    expect(parseTopology(dupId).ok).toBe(false);

    expect(parseTopology("这不是 JSON").ok).toBe(false);
    expect(parseTopology(42).ok).toBe(false);
  });
});
