import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLayoutStore } from "./layout";

describe("workbench panels", () => {
  beforeEach(() => useLayoutStore.setState({ libraryOpen: true, inspectorOpen: true }));
  afterEach(() => vi.unstubAllGlobals());
  it("toggles desktop panels independently", () => {
    vi.stubGlobal("window", { innerWidth: 1280 });
    useLayoutStore.getState().toggleLibrary();
    expect(useLayoutStore.getState().libraryOpen).toBe(false);
    expect(useLayoutStore.getState().inspectorOpen).toBe(true);
    useLayoutStore.getState().closeInspector();
    expect(useLayoutStore.getState().inspectorOpen).toBe(false);
    useLayoutStore.getState().openInspector();
    expect(useLayoutStore.getState().inspectorOpen).toBe(true);
  });
  it("shows only one drawer at a time on mobile", () => {
    vi.stubGlobal("window", { innerWidth: 390 });
    useLayoutStore.setState({ libraryOpen: false, inspectorOpen: true });
    useLayoutStore.getState().toggleLibrary();
    expect(useLayoutStore.getState().libraryOpen).toBe(true);
    expect(useLayoutStore.getState().inspectorOpen).toBe(false);
    useLayoutStore.getState().openInspector();
    expect(useLayoutStore.getState().libraryOpen).toBe(false);
    expect(useLayoutStore.getState().inspectorOpen).toBe(true);
  });
  it("keeps the inspector when resizing an expanded desktop to mobile", () => {
    vi.stubGlobal("window", { innerWidth: 390 });
    useLayoutStore.getState().adaptToCompact();
    expect(useLayoutStore.getState().libraryOpen).toBe(false);
    expect(useLayoutStore.getState().inspectorOpen).toBe(true);
  });
});
