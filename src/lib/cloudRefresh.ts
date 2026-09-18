/**
 * Realtime postgres_changes websockets die silently (sleep/wake, VPN, Tauri,
 * backgrounded phone). LoadsContext already polls + refreshes on focus.
 * Other crew tables used mount+Realtime only, so device B stayed stale until
 * a hard reload. Same fallbacks, no remote deletes.
 */

export const CLOUD_REFRESH_INTERVAL_MS = 90_000;

export function attachCloudRefresh(
  refresh: () => void | Promise<void>,
  intervalMs = CLOUD_REFRESH_INTERVAL_MS,
): () => void {
  const pull = () => {
    void refresh();
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") pull();
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);
  window.addEventListener("online", pull);
  const pollId = window.setInterval(() => {
    if (document.visibilityState === "visible") pull();
  }, intervalMs);
  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onVisible);
    window.removeEventListener("online", pull);
    window.clearInterval(pollId);
  };
}
