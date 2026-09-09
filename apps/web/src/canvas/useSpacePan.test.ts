// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSpacePan } from "./useSpacePan";

let root: Root;
let host: HTMLDivElement;
const Harness = () => createElement("output", null, String(useSpacePan()));
const send = async (type: string, target: EventTarget = document.body, options = {}) => {
  await act(async () =>
    target.dispatchEvent(
      type.startsWith("key")
        ? new KeyboardEvent(type, {
            key: " ",
            code: "Space",
            bubbles: true,
            cancelable: true,
            ...options,
          })
        : new Event(type, { bubbles: true }),
    ),
  );
};
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(Harness)));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it("holds pan until release and resets on lost focus", async () => {
  await send("keydown");
  expect(host.textContent).toBe("true");
  await send("keyup");
  expect(host.textContent).toBe("false");
  await send("keydown");
  await send("blur", window);
  expect(host.textContent).toBe("false");
});
it("does not switch tools in the middle of a selection drag", async () => {
  await send("pointerdown");
  await send("keydown");
  expect(host.textContent).toBe("false");
  await send("pointerup");
  await send("keyup");
  await send("keydown");
  expect(host.textContent).toBe("true");
});
it("finishes the current pan when space is released before the mouse", async () => {
  await send("keydown");
  await send("pointerdown");
  await send("keyup");
  expect(host.textContent).toBe("true");
  await send("pointerup");
  expect(host.textContent).toBe("false");
});
it("leaves inputs, buttons, playback and dialogs alone", async () => {
  for (const tag of ["input", "textarea", "select", "button", "a"]) {
    const element = document.createElement(tag);
    document.body.append(element);
    await send("keydown", element);
    expect(host.textContent).toBe("false");
    element.remove();
  }
  const dialog = document.createElement("dialog");
  dialog.setAttribute("open", "");
  document.body.append(dialog);
  await send("keydown");
  expect(host.textContent).toBe("false");
  dialog.remove();
  await send("keydown", document.body, { metaKey: true });
  expect(host.textContent).toBe("false");
});
