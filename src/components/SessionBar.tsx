import { useAuth } from "../store/AuthContext";
import { useLoads } from "../store/LoadsContext";
import { CrewPresenceList } from "./CrewPresenceList";
import { ThemeToggle } from "./ThemeToggle";

export function SessionBar() {
  const { configured, user, displayName, signOut } = useAuth();
  const {
    syncStatus,
    queuedCount,
    lastSyncError,
    uploadLocalLoads,
    localPendingCount,
    pushAllLoadsToCloud,
  } = useLoads();

  if (!configured) {
    return (
      <div className="session-bar">
        <span>This device only · set Supabase env to share</span>
        <span className="session-actions">
          <ThemeToggle />
        </span>
      </div>
    );
  }

      const statusLabel =
    syncStatus === "local"
      ? "This device only · set Supabase env to share"
      : syncStatus === "offline"
        ? queuedCount
          ? `Offline · ${queuedCount} queued`
          : "Offline"
        : syncStatus === "syncing"
          ? "Syncing…"
          : syncStatus === "error"
            ? queuedCount
              ? `Sync error · ${queuedCount} queued${lastSyncError ? ` · ${lastSyncError}` : ""}`
              : lastSyncError
                ? `Sync error · ${lastSyncError}`
                : "Sync error"
            : queuedCount
              ? `${queuedCount} queued`
              : "Live";

const pushLabel =
    syncStatus === "error" || queuedCount > 0 ? "Sync now" : "Push all to cloud";

  return (
    <div className="session-bar">
      <div className="session-info">
        <span className={syncStatus === "error" ? "session-status is-error" : undefined}>
          {displayName}
          {user?.email ? ` · ${user.email}` : ""} · {statusLabel}
        </span>
        <CrewPresenceList />
      </div>
      <span className="session-actions">
        <ThemeToggle />
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
