import type { DBSchema, IDBPDatabase } from "idb";
import { openDB } from "idb";
import { parseTopology, type Topology } from "../engine";

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
      terminated() {
        dbPromise = null;
      },
    }).catch((error: unknown) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

export async function load(): Promise<SavedTopology | null> {
  const database = await db();
  const saved = await database.get(STORE, KEY);
  if (saved === undefined) return null;
  const parsed = parseTopology(saved?.topology);
  if (!parsed.ok) throw new Error("本地保存的内容无法读取，原始数据已保留。");
  return { topology: parsed.topology, savedAt: saved.savedAt };
}

export async function save(topology: Topology): Promise<void> {
  const database = await db();
  await database.put(STORE, { topology, savedAt: Date.now() }, KEY);
}

export async function clear(): Promise<void> {
  const database = await db();
  await database.delete(STORE, KEY);
}
