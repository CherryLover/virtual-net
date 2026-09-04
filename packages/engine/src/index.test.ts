import { describe, expect, it } from "vitest";
import { ENGINE_VERSION } from "./index";

describe("ENGINE_VERSION", () => {
  it("是三段式版本号", () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
