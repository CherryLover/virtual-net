import type { DBSchema, IDBPDatabase } from "idb";
import { openDB } from "idb";
import type { Topology } from "../engine";

const DB_NAME = "virtual-net";
const STORE = "topologies";
const KEY = "current";

export interface SavedTopology {
  topology: Topology;
  savedAt: number;
}

interface VirtualNetDB extends DBSchema {
  topologies: {
    key: string;
    value: SavedTopology;
  };
}

let dbPromise: Promise<IDBPDatabase<VirtualNetDB>> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<VirtualNetDB>(DB_NAME, 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE);
      },
    });
  }
  return dbPromise;
}

export async function load(): Promise<SavedTopology | null> {
  try {
    const database = await db();
    return (await database.get(STORE, KEY)) ?? null;
  } catch {
    return null;
  }
}

export async function save(topology: Topology): Promise<void> {
  const database = await db();
  await database.put(STORE, { topology, savedAt: Date.now() }, KEY);
}

export async function clear(): Promise<void> {
  const database = await db();
  await database.delete(STORE, KEY);
}
