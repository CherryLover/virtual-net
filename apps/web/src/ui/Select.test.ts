// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { Select } from "./Select";

it("preserves native select semantics, accessible name and change events", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const change = vi.fn();
  try {
    await act(async () =>
      root.render(
        createElement(
          Select,
          { "aria-label": "加入分组", defaultValue: "a", onChange: change },
          createElement("option", { value: "a" }, "办公室"),
          createElement("option", { value: "b" }, "家庭"),
        ),
      ),
    );
    const select = host.querySelector("select");
    expect(select?.classList.contains("field-input")).toBe(true);
    expect(select?.getAttribute("aria-label")).toBe("加入分组");
    expect(host.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    if (!select) throw Error("Missing select");
    select.value = "b";
    await act(async () => select.dispatchEvent(new Event("change", { bubbles: true })));
    expect(change).toHaveBeenCalledOnce();
    await act(async () =>
      root.render(
        createElement(
          Select,
          { disabled: true, "aria-label": "加入分组" },
          createElement("option", null, "暂无分组"),
        ),
      ),
    );
    expect(host.querySelector("select")?.disabled).toBe(true);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
