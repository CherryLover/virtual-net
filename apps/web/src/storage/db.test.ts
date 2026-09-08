import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyTopology } from "../engine";

const mocks = vi.hoisted(() => ({ open: vi.fn(), get: vi.fn(), put: vi.fn() }));
vi.mock("idb", () => ({ openDB: mocks.open }));

describe("local database recovery", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.open.mockReset().mockResolvedValue({ get: mocks.get, put: mocks.put });
    mocks.get.mockReset();
    mocks.put.mockReset();
  });
  it("retries an unsuccessful database open instead of reusing a rejected promise", async () => {
    mocks.open.mockRejectedValueOnce(new Error("denied"));
    const { load } = await import("./db");
    await expect(load()).rejects.toThrow("denied");
    await expect(load()).resolves.toBeNull();
    expect(mocks.open).toHaveBeenCalledTimes(2);
  });
  it("keeps read errors distinct from an absent current record", async () => {
    mocks.get.mockRejectedValueOnce(new Error("read failure"));
    const { load } = await import("./db");
    await expect(load()).rejects.toThrow("read failure");
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it("refuses corrupt records without replacing the original content", async () => {
    mocks.get.mockResolvedValueOnce({ topology: { version: 999 }, savedAt: 2 });
    const { load } = await import("./db");
    await expect(load()).rejects.toThrow("原始数据已保留");
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it("restores a valid saved empty topology rather than replacing it with an example", async () => {
    const record = { topology: emptyTopology(), savedAt: 3 };
    mocks.get.mockResolvedValueOnce(record);
    const { load } = await import("./db");
    await expect(load()).resolves.toEqual(record);
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it("writes and restores the import backup without changing the current record", async () => {
    const record = { topology: emptyTopology(), savedAt: 3 };
    const { backupBeforeImport, loadImportBackup } = await import("./db");
    await backupBeforeImport(record.topology);
    expect(mocks.put).toHaveBeenCalledWith(
      "topologies",
      expect.objectContaining({ topology: record.topology }),
      "before-import",
    );
    mocks.get.mockResolvedValueOnce(record);
    await expect(loadImportBackup()).resolves.toEqual(record);
    expect(mocks.get).toHaveBeenCalledWith("topologies", "before-import");
  });
});
