// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { canvasKeyboardBlocked } from "./keyboard";

afterEach(() => {
  document.body.replaceChildren();
});
describe("canvas keyboard modal guard", () => {
  it("blocks dialog button shortcuts and body events while a native dialog is open", () => {
    const dialog = document.createElement("dialog");
    dialog.open = true;
    const button = document.createElement("button");
    dialog.append(button);
    document.body.append(dialog);
    expect(canvasKeyboardBlocked(button)).toBe(true);
    expect(canvasKeyboardBlocked(document.body)).toBe(true);
    dialog.open = false;
    expect(canvasKeyboardBlocked(document.body)).toBe(false);
  });
  it("blocks custom dialog and alertdialog targets, leaves canvas actions available", () => {
    for (const role of ["dialog", "alertdialog"]) {
      const container = document.createElement("div");
      container.setAttribute("role", role);
      const button = document.createElement("button");
      container.append(button);
      document.body.append(container);
      expect(canvasKeyboardBlocked(button)).toBe(true);
    }
    expect(canvasKeyboardBlocked(document.body)).toBe(false);
    expect(canvasKeyboardBlocked(null)).toBe(false);
  });
});
