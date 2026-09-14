const API_BASE = '/api/sync';
const SYNC_INTERVAL_MS = 30_000;
const DEVICE_ID_KEY = '__cloud_sync_device_id__';
const LAST_SYNC_KEY = '__cloud_sync_last_pull__';

function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) { id = 'dev-' + Math.random().toString(36).slice(2, 10); localStorage.setItem(DEVICE_ID_KEY, id); }
  return id;
}

const INTERNAL_KEYS = new Set([DEVICE_ID_KEY, LAST_SYNC_KEY]);

export async function initCloudSync(): Promise<void> {
  const deviceId = getDeviceId();
  await pushAllLocal(deviceId);
  await pullRemote();
  window.addEventListener('storage', (e) => {
    if (e.key && !INTERNAL_KEYS.has(e.key) && e.newValue !== null) pushSingle(e.key, e.newValue, deviceId).catch(() => {});
  });
  patchLocalStorage(deviceId);
  setInterval(() => pullRemote().catch(() => {}), SYNC_INTERVAL_MS);
}

async function pushAllLocal(deviceId: string): Promise<void> {
  const items: Array<{ key: string; value: string; device_id: string }> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || INTERNAL_KEYS.has(key)) continue;
    const value = localStorage.getItem(key);
    if (value !== null) items.push({ key, value, device_id: deviceId });
  }
  if (items.length === 0) return;
  try { await fetch(API_BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) }); } catch (e) { console.warn('[cloudSync] pushAll
