import { describe, expect, it, vi } from "vitest";
import { emptyTopology } from "../engine";
import { createPersistence } from "./persistence";

function fixture() {
  let current = emptyTopology();
  const options = {
    load: vi.fn(async () => ({ topology: current, savedAt: 1 })),
    save: vi.fn(async () => {}),
    current: () => current,
    restore: vi.fn(),
    status: vi.fn(),
    saved: vi.fn(),
  };
  return {
    options,
    change: () => {
      current = { ...current, name: `${current.name} edited` };
    },
  };
}

describe("safe persistence", () => {
  it("never treats a failed read as an empty database or writes over it; retry restores", async () => {
    const { options } = fixture();
    options.load.mockRejectedValueOnce(new Error("blocked"));
    const persistence = createPersistence(options);
    await persistence.start();
    persistence.changed();
    expect(options.status).toHaveBeenLastCalledWith("load-error");
    expect(options.restore).not.toHaveBeenCalled();
    expect(options.save).not.toHaveBeenCalled();
    await persistence.retry();
    expect(options.restore).toHaveBeenCalledWith(options.current());
    expect(options.status).toHaveBeenLastCalledWith("ready");
    expect(options.save).not.toHaveBeenCalled();
  });
  it("does not report a failed write as saved and retries the newest topology", async () => {
    const { options, change } = fixture();
    options.save.mockRejectedValueOnce(new Error("quota"));
    const persistence = createPersistence(options);
    await persistence.start();
    change();
    persistence.changed();
    await vi.waitFor(() => expect(options.status).toHaveBeenLastCalledWith("save-error"));
    expect(options.saved).not.toHaveBeenCalled();
    change();
    persistence.changed();
    expect(options.save).toHaveBeenCalledTimes(1);
    await persistence.retry();
    expect(options.save).toHaveBeenLastCalledWith(options.current());
    expect(options.saved).toHaveBeenLastCalledWith(options.current());
  });
  it("serializes writes and never marks an older snapshot as saved", async () => {
    const { options, change } = fixture();
    let release: () => void = () => {};
    options.save.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const persistence = createPersistence(options);
    await persistence.start();
    change();
    persistence.changed();
    change();
    persistence.changed();
    expect(options.save).toHaveBeenCalledTimes(1);
    release();
    await vi.waitFor(() => expect(options.save).toHaveBeenCalledTimes(2));
    expect(options.saved).toHaveBeenCalledTimes(1);
    expect(options.saved).toHaveBeenLastCalledWith(options.current());
  });
  it("a disposed read never restores or starts writing", async () => {
    const { options } = fixture();
    let release: (value: Awaited<ReturnType<typeof options.load>>) => void = () => {};
    options.load.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const persistence = createPersistence(options);
    const startup = persistence.start();
    persistence.stop();
    release({ topology: options.current(), savedAt: 1 });
    await startup;
    expect(options.restore).not.toHaveBeenCalled();
    expect(options.save).not.toHaveBeenCalled();
  });
  it("only a successful empty read creates and saves the example", async () => {
    const { options } = fixture();
    const persistence = createPersistence({ ...options, load: async () => null });
    await persistence.start();
    expect(options.restore).toHaveBeenCalledWith(null);
    expect(options.save).toHaveBeenCalledTimes(1);
    expect(options.saved).toHaveBeenCalledTimes(1);
  });
});
