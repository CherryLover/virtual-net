import { describe, expect, it } from "vitest";
import { outputSize, unionBounds } from "./capture";

describe("完整画布边界", () => {
  it("包含负坐标和画面外元素并保留空白", () => {
    expect(
      unionBounds([
        { x: -100, y: -50, width: 20, height: 40 },
        { x: 2000, y: 3000, width: 100, height: 50 },
      ]),
    ).toEqual({ x: -148, y: -98, width: 2296, height: 3196 });
  });
  it("空图明确拒绝", () => expect(() => unionBounds([])).toThrow("画布为空"));
});
describe("导出尺寸保护", () => {
  it("高清按真实尺寸输出", () =>
    expect(outputSize(800, 500, 2)).toEqual({ width: 1600, height: 1000 }));
  it("狭长分享图不缩小品牌区", () =>
    expect(outputSize(100, 4000, 1, true)).toEqual({ width: 720, height: 4200 }));
  it("宽图完整保留，品牌区仅增加高度", () =>
    expect(outputSize(6000, 100, 1, true)).toEqual({ width: 6000, height: 300 }));
  it.each([
    [17000, 20, 1],
    [6000, 6000, 1],
    [Infinity, 1, 1],
    [NaN, 1, 1],
    [8000, 100, 3],
  ])("超限不裁切 %s", (width, height, scale) =>
    expect(() => outputSize(width, height, scale)).toThrow("图片过大"),
  );
});
