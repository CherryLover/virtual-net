import { describe, expect, it } from "vitest";
import { canDropLibraryDevice, type LibraryDrag, moveLibraryDrag } from "./libraryDrag";

const initial: LibraryDrag = {
  pointerId: 1,
  type: "proxy",
  origin: { x: 20, y: 20 },
  point: { x: 20, y: 20 },
  moved: false,
};
const bounds = { left: 100, top: 60, right: 600, bottom: 800 };
describe("device library pointer drag", () => {
  it("ignores small pointer jitter and starts at the movement threshold", () => {
    expect(moveLibraryDrag(initial, { x: 23, y: 23 }).moved).toBe(false);
    expect(moveLibraryDrag(initial, { x: 26, y: 20 }).moved).toBe(true);
  });
  it("remembers an actual drag even when it returns to its origin", () => {
    const moved = moveLibraryDrag(initial, { x: 120, y: 120 });
    expect(moveLibraryDrag(moved, initial.origin).moved).toBe(true);
    expect(canDropLibraryDevice(moveLibraryDrag(moved, initial.origin), bounds)).toBe(false);
  });
  it("accepts only a moved pointer inside canvas bounds", () => {
    expect(canDropLibraryDevice(moveLibraryDrag(initial, { x: 120, y: 120 }), bounds)).toBe(true);
    expect(canDropLibraryDevice(moveLibraryDrag(initial, { x: 600, y: 120 }), bounds)).toBe(false);
    expect(canDropLibraryDevice(moveLibraryDrag(initial, { x: 120, y: 800 }), bounds)).toBe(false);
    expect(canDropLibraryDevice({ ...initial, point: { x: 120, y: 120 } }, bounds)).toBe(false);
  });
});
