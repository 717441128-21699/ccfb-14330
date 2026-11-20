/**
 * IndexedDB 持久层。
 * 库结构：
 *   episodes  集（元数据）
 *   shots     镜头（元数据 + 放大参数，index episodeId）
 *   frames    帧（元数据 + sourceBlob/resultBlob，index shotId）
 * Blob 直接存入 IndexedDB（结构化克隆支持），无需 base64 膨胀。
 */
import { EpisodeRecord, FrameRecord, ShotRecord } from '../types';
import { makeId } from '../core/math';

const DB_NAME = 'cel-remaster-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('episodes')) {
        db.createObjectStore('episodes', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('shots')) {
        const store = db.createObjectStore('shots', { keyPath: 'id' });
        store.createIndex('episodeId', 'episodeId', { unique: false });
      }
      if (!db.objectStoreNames.contains('frames')) {
        const store = db.createObjectStore('frames', { keyPath: 'id' });
        store.createIndex('shotId', 'shotId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(storeName, mode);
        const req = fn(t.objectStore(storeName));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

/* ---------------- 集 ---------------- */

export async function createEpisode(code: string, title: string): Promise<EpisodeRecord> {
  const rec: EpisodeRecord = { id: makeId('ep'), code, title, createdAt: Date.now() };
  await tx('episodes', 'readwrite', (s) => s.put(rec));
  return rec;
}

export async function listEpisodes(): Promise<EpisodeRecord[]> {
  const all = await tx<EpisodeRecord[]>('episodes', 'readonly', (s) => s.getAll());
  return all.sort((a, b) => a.code.localeCompare(b.code));
}

export async function deleteEpisode(id: string): Promise<void> {
  const db = await openDb();
  const shots = await tx<ShotRecord[]>('shots', 'readonly', (s) =>
    (s.index('episodeId') as IDBIndex).getAll(id),
  );
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(['episodes', 'shots', 'frames'], 'readwrite');
    t.objectStore('episodes').delete(id);
    const shotStore = t.objectStore('shots');
    const frameStore = t.objectStore('frames');
    for (const shot of shots) {
      shotStore.delete(shot.id);
      const idx = frameStore.index('shotId');
      const cursorReq = idx.openCursor(IDBKeyRange.only(shot.id));
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
    }
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

/* ---------------- 镜头 ---------------- */

export async function createShot(episodeId: string, code: string, name: string, params: ShotRecord['params']): Promise<ShotRecord> {
  const rec: ShotRecord = {
    id: makeId('shot'),
    episodeId,
    code,
    name,
    createdAt: Date.now(),
    params,
    frames: [],
  };
  await tx('shots', 'readwrite', (s) => s.put(rec));
  return rec;
}

export async function listShots(episodeId: string): Promise<ShotRecord[]> {
  const all = await tx<ShotRecord[]>('shots', 'readonly', (s) =>
    (s.index('episodeId') as IDBIndex).getAll(episodeId),
  );
  return all.sort((a, b) => a.code.localeCompare(b.code));
}

export async function updateShot(shot: ShotRecord): Promise<void> {
  await tx('shots', 'readwrite', (s) => s.put(shot));
}

export async function deleteShot(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(['shots', 'frames'], 'readwrite');
    t.objectStore('shots').delete(id);
    const frameStore = t.objectStore('frames');
    const cursorReq = frameStore.index('shotId').openCursor(IDBKeyRange.only(id));
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

/* ---------------- 帧 ---------------- */

export interface StoredFrame extends FrameRecord {
  shotId: string;
}

export async function putFrame(frame: StoredFrame): Promise<void> {
  await tx('frames', 'readwrite', (s) => s.put(frame));
}

export async function listFrames(shotId: string): Promise<StoredFrame[]> {
  const all = await tx<StoredFrame[]>('frames', 'readonly', (s) =>
    (s.index('shotId') as IDBIndex).getAll(shotId),
  );
  return all.sort((a, b) => a.index - b.index);
}

export async function getFrame(id: string): Promise<StoredFrame | undefined> {
  return tx<StoredFrame | undefined>('frames', 'readonly', (s) => s.get(id));
}

export async function deleteFrame(id: string): Promise<void> {
  await tx('frames', 'readwrite', (s) => s.delete(id));
}
