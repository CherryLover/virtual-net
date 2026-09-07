import type { Topology } from "../engine";
import type { SavedTopology } from "./db";

export type StoragePhase = "loading" | "ready" | "load-error" | "save-error";

interface Options {
  load: () => Promise<SavedTopology | null>;
  save: (topology: Topology) => Promise<void>;
  current: () => Topology;
  restore: (saved: Topology | null) => void;
  status: (phase: StoragePhase) => void;
  saved: (topology: Topology) => void;
}

/** A read must succeed before writes are allowed; writes are serialized and coalesced. */
export function createPersistence(options: Options) {
  let stopped = false;
  let ready = false;
  let reading = false;
  let writing = false;
  let pending = false;
  let saveFailed = false;

  async function flush() {
    if (stopped || !ready || writing || !pending) return;
    writing = true;
    try {
      while (pending && !stopped) {
        pending = false;
        const topology = options.current();
        try {
          await options.save(topology);
          if (stopped) return;
          saveFailed = false;
          options.status("ready");
          if (options.current() === topology) options.saved(topology);
        } catch {
          if (stopped) return;
          saveFailed = true;
          pending = true;
          options.status("save-error");
          break;
        }
      }
    } finally {
      writing = false;
    }
  }

  async function read() {
    if (stopped || reading || ready) return;
    reading = true;
    options.status("loading");
    try {
      const saved = await options.load();
      if (stopped) return;
      options.restore(saved?.topology ?? null);
      ready = true;
      options.status("ready");
      if (!saved) {
        pending = true;
        await flush();
      }
    } catch {
      if (!stopped) options.status("load-error");
    } finally {
      reading = false;
    }
  }

  return {
    start: read,
    retry: async () => {
      if (!ready) await read();
      else {
        pending = true;
        saveFailed = false;
        await flush();
      }
    },
    changed: () => {
      if (ready && !stopped) {
        pending = true;
        if (!saveFailed) void flush();
      }
    },
    stop: () => {
      stopped = true;
    },
  };
}
