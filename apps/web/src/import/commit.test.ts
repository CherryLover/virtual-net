import { describe, expect, it, vi } from "vitest";
import { emptyTopology } from "../engine";
import { createImportCommit } from "./commit";

describe("import protection", () => {
  it("does not replace after the dialog disappears during backup", async () => {
    const original = emptyTopology();
    const replace = vi.fn();
    let active = true;
    const commit = createImportCommit({
      current: () => original,
      backup: async () => {
        active = false;
      },
      replace,
    });
    expect(await commit(emptyTopology(), original, () => active)).toBe("cancelled");
    expect(replace).not.toHaveBeenCalled();
  });
  it("backs up first and only replaces once", async () => {
    const original = emptyTopology();
    const incoming = { ...emptyTopology(), name: "incoming" };
    const calls: string[] = [];
    const backup = vi.fn(async () => {
      calls.push("backup");
    });
    const replace = vi.fn(() => {
      calls.push("replace");
    });
    const commit = createImportCommit({ current: () => original, backup, replace });
    expect(await commit(incoming, original)).toBe("imported");
    expect(calls).toEqual(["backup", "replace"]);
    expect(backup).toHaveBeenCalledWith(original);
  });
  it("never replaces when backup fails", async () => {
    const original = emptyTopology();
    const replace = vi.fn();
    const commit = createImportCommit({
      current: () => original,
      backup: async () => {
        throw Error("quota");
      },
      replace,
    });
    await expect(commit(emptyTopology(), original)).rejects.toThrow("quota");
    expect(replace).not.toHaveBeenCalled();
  });
  it("requires a new confirmation if original changes before or during backup", async () => {
    const original = emptyTopology();
    let current = original;
    const replace = vi.fn();
    const backup = vi.fn(async () => {
      current = emptyTopology();
    });
    const commit = createImportCommit({ current: () => current, backup, replace });
    expect(await commit(emptyTopology(), original)).toBe("changed");
    expect(await commit(emptyTopology(), original)).toBe("changed");
    expect(backup).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
  });
  it("ignores a double confirmation during asynchronous backup", async () => {
    const original = emptyTopology();
    const replace = vi.fn();
    let finish = () => {};
    const backup = () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      });
    const commit = createImportCommit({ current: () => original, backup, replace });
    const first = commit(emptyTopology(), original);
    expect(await commit(emptyTopology(), original)).toBe("busy");
    finish();
    expect(await first).toBe("imported");
    expect(replace).toHaveBeenCalledTimes(1);
  });
});
