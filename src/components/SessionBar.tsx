import { useAuth } from "../store/AuthContext";
import { useLoads } from "../store/LoadsContext";

export function SessionBar() {
  const { configured, user, displayName, signOut } = useAuth();
  const {
    syncStatus,
    queuedCount,
    uploadLocalLoads,
    localPendingCount,
    pushAllLoadsToCloud,
  } = useLoads();

  if (!configured) {
    return (
      <div className="session-bar">
        <span>This device only · set Supabase env to share</span>
      </div>
    );
  }

  const statusLabel =
    syncStatus === "offline"
      ? queuedCount
        ? `Offline · ${queuedCount} queued`
        : "Offline"
      : syncStatus === "syncing"
        ? "Syncing…"
        : syncStatus === "error"
          ? queuedCount
            ? `Sync error · ${queuedCount} queued`
            : "Sync error"
          : queuedCount
            ? `${queuedCount} queued`
            : "Live";

  const pushLabel =
    syncStatus === "error" || queuedCount > 0 ? "Sync now" : "Push all to cloud";

  return (
    <div className="session-bar">
      <span className={syncStatus === "error" ? "session-status is-error" : undefined}>
        {displayName}
        {user?.email ? ` · ${user.email}` : ""} · {statusLabel}
      </span>
      <span className="session-actions">
        {localPendingCount > 0 ? (
          <button
            type="button"
            className="text-btn amber"
            onClick={() => void uploadLocalLoads()}
            disabled={syncStatus === "syncing"}
          >
            Upload {localPendingCount} local
          </button>
        ) : null}
        <button
          type="button"
          className="text-btn amber"
          onClick={() => void pushAllLoadsToCloud()}
          disabled={syncStatus === "syncing"}
        >
          {pushLabel}
        </button>
        <button type="button" className="text-btn amber" onClick={() => void signOut()}>
          Log out
        </button>
      </span>
    </div>
  );
}
