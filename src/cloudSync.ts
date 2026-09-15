// Constants
const API_BASE = '/api/sync';
const SYNC_INTERVAL_MS = 30_000;
const DEVICE_ID_KEY = '__cloud_sync_device_id__';
const LAST_SYNC_KEY = '__cloud_sync_last_pull__';
const INTERNAL_KEYS = new Set([DEVICE_ID_KEY, LAST_SYNC_KEY] as const);
const LOG_PREFIX = '[cloudSync]';

// Type definitions
interface SyncItem {
  key: string;
  value: string;
  device_id: string;
}

// Device ID caching
let cachedDeviceId: string | null = null;
let syncIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Generate or retrieve a unique device ID from localStorage.
 * Results are cached in memory to reduce localStorage access.
 */
function getDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId;

  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = 'dev-' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(DEVICE_ID_KEY, id);
  }

  cachedDeviceId = id;
  return id;
}

/**
 * Initialize cloud sync, starting all sync operations.
 * Should be called once on app startup.
 */
export async function initCloudSync(): Promise<void> {
  const deviceId = getDeviceId();

  // Initial sync: push local changes, then pull remote
  await pushAllLocal(deviceId);
  await pullRemote();

  // Listen for local storage changes and push immediately
  window.addEventListener('storage', (e) => {
    if (e.key && !INTERNAL_KEYS.has(e.key as typeof DEVICE_ID_KEY | typeof LAST_SYNC_KEY) && e.newValue !== null) {
      pushSingle(e.key, e.newValue, deviceId).catch((err) => {
        console.warn(`${LOG_PREFIX} pushSingle failed:`, err);
      });
    }
  });

  patchLocalStorage(deviceId);

  // Periodic sync: pull remote changes every SYNC_INTERVAL_MS
  syncIntervalId = setInterval(() => {
    pullRemote().catch((err) => {
      console.warn(`${LOG_PREFIX} periodic pullRemote failed:`, err);
    });
  }, SYNC_INTERVAL_MS);
}

/**
 * Push all local storage items to the server.
 * Skips internal keys and null values.
 */
async function pushAllLocal(deviceId: string): Promise<void> {
  const items: SyncItem[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || INTERNAL_KEYS.has(key as typeof DEVICE_ID_KEY | typeof LAST_SYNC_KEY)) continue;

    const value = localStorage.getItem(key);
    if (value !== null) {
      items.push({ key, value, device_id: deviceId });
    }
  }

  if (items.length === 0) return;

  try {
    await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
  } catch (err) {
    console.warn(`${LOG_PREFIX} pushAll failed:`, err);
  }
}

/**
 * Push a single key-value pair to the server.
 * Called when a storage change event is detected.
 */
async function pushSingle(key: string, value: string, deviceId: string): Promise<void> {
  try {
    await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ key, value, device_id: deviceId }],
      }),
    });
  } catch (err) {
    console.warn(`${LOG_PREFIX} pushSingle for key "${key}" failed:`, err);
    throw err;
  }
}

/**
 * Pull remote changes from the server and merge into local storage.
 */
async function pullRemote(): Promise<void> {
  try {
    const response = await fetch(API_BASE, { method: 'GET' });
    if (!response.ok) {
      console.warn(`${LOG_PREFIX} pullRemote HTTP error:`, response.status);
      return;
    }

    const data = await response.json() as { items?: SyncItem[] };
    if (!data.items) return;

    for (const item of data.items) {
      if (!INTERNAL_KEYS.has(item.key as typeof DEVICE_ID_KEY | typeof LAST_SYNC_KEY)) {
        localStorage.setItem(item.key, item.value);
      }
    }

    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
  } catch (err) {
    console.warn(`${LOG_PREFIX} pullRemote failed:`, err);
  }
}

/**
 * Patch localStorage to handle sync on value changes.
 * Provides a mechanism for intercepting and logging storage modifications.
 */
function patchLocalStorage(deviceId: string): void {
  const originalSetItem = localStorage.setItem;

  localStorage.setItem = function (key: string, value: string) {
    originalSetItem.call(this, key, value);

    if (!INTERNAL_KEYS.has(key as typeof DEVICE_ID_KEY | typeof LAST_SYNC_KEY)) {
      pushSingle(key, value, deviceId).catch(() => {
        // Already logged in pushSingle
      });
    }
  };
}

/**
 * Clean up sync operations (e.g., on app unload).
 */
export function cleanupCloudSync(): void {
  if (syncIntervalId !== null) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
}
