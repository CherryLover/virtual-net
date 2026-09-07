import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleTopology } from "../engine";
import { useTopologyStore } from "../store";
import { useAutoSave, useStorageStatus } from "./autosave";
import { load, save } from "./db";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useEffect: vi.fn(), useState: vi.fn(() => ["loading", vi.fn()]) };
});
vi.mock("./db", () => ({ load: vi.fn(), save: vi.fn(async () => undefined) }));

const original = useTopologyStore.getState();
let cleanup: (() => void) | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  useTopologyStore.setState(original, true);
  useStorageStatus.setState({ phase: "loading", message: null });
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.unstubAllGlobals();
});

function mountEffect() {
  // biome-ignore lint/correctness/useHookAtTopLevel: React hooks are mocked to inspect this lifecycle without a DOM.
  useAutoSave();
  const call = vi.mocked(useEffect).mock.calls.at(-1);
  if (!call) throw new Error("missing autosave effect");
  const stop = call[0]();
  if (typeof stop !== "function") throw new Error("missing cleanup");
  cleanup = stop;
  return { stop, dependencies: call[1] };
}

describe("autosave store lifecycle", () => {
  it("depends on both store identities and finishes restoration", async () => {
    const topology = sampleTopology();
    vi.mocked(load).mockResolvedValue({ topology, savedAt: 1 });
    const mounted = mountEffect();
    expect(mounted.dependencies).toEqual([useTopologyStore, useStorageStatus]);
    await vi.waitFor(() => expect(useStorageStatus.getState().phase).toBe("ready"));
    expect(useTopologyStore.getState().loaded).toBe(true);
    expect(useTopologyStore.getState().topology.name).toBe(topology.name);
  });
  it("a disposed pending read cannot reset a newer ready lifecycle", async () => {
    let release: ((value: Awaited<ReturnType<typeof load>>) => void) | undefined;
    vi.mocked(load).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const old = mountEffect();
    old.stop();
    const topology = sampleTopology();
    topology.name = "new lifecycle";
    vi.mocked(load).mockResolvedValueOnce({ topology, savedAt: 2 });
    mountEffect();
    await vi.waitFor(() => expect(useStorageStatus.getState().phase).toBe("ready"));
    release?.({ topology: sampleTopology(), savedAt: 1 });
    await Promise.resolve();
    expect(useTopologyStore.getState().topology.name).toBe("new lifecycle");
    expect(useStorageStatus.getState().phase).toBe("ready");
    expect(save).not.toHaveBeenCalled();
  });
  it("restarting an already-loaded editor preserves and saves unsaved edits", async () => {
    const saved = sampleTopology();
    useTopologyStore.getState().replaceTopology(saved);
    useTopologyStore.getState().setLoaded();
    useTopologyStore.getState().rename("unsaved editing session");
    const before = useTopologyStore.getState();
    vi.mocked(load).mockResolvedValue({ topology: saved, savedAt: 1 });
    mountEffect();
    await vi.waitFor(() => expect(useStorageStatus.getState().phase).toBe("ready"));
    expect(useTopologyStore.getState().topology).toBe(before.topology);
    expect(useTopologyStore.getState().past).toBe(before.past);
    expect(save).toHaveBeenCalledWith(before.topology);
  });
});
