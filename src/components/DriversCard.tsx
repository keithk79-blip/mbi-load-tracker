import { useState } from "react";
import { Plus, RefreshCw, X } from "lucide-react";
import {
  chicagoToday,
  formatHeaderDate,
  isChicagoSaturday,
  isChicagoSunday,
} from "../lib/chicagoDate";
import {
  CALL_OFF_KIND_OPTIONS,
  type CallOffKind,
} from "../lib/driverAvailability";
import { useDrivers } from "../store/DriversContext";

function pulledLabel(iso: string | null): string {
  if (!iso) return "Not pulled yet";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function DriversCard({
  compact = false,
  date,
}: {
  compact?: boolean;
  date?: string;
}) {
  const today = chicagoToday();
  const viewed = date ?? today;
  const saturday = isChicagoSaturday(viewed);
  const sunday = isChicagoSunday(viewed);
  const viewingToday = viewed === today;
  const viewingFuture = viewed > today;
  const {
    status,
    error,
    fetchedAt,
    availabilityOn,
    ytdAverage,
    refresh,
    ootNames,
    callOffsOn,
    addManualOff,
    removeManualOff,
  } = useDrivers();
  const dayAvail = availabilityOn(viewed);
  const avg = ytdAverage(today);
  const callOffs = callOffsOn(viewed);
  const canEditCallOffs = !sunday && (viewingToday || viewingFuture);

  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftKind, setDraftKind] = useState<CallOffKind>("call-off");
  const [addError, setAddError] = useState<string | null>(null);
  const adding = addingFor === viewed;

  function closeAdd() {
    setAddingFor(null);
    setAddError(null);
  }

  async function saveManual() {
    const name = draftName.trim();
    if (!name) {
      setAddError("Enter a driver name.");
      return;
    }
    const ok = await addManualOff(viewed, name, draftKind);
    if (!ok) {
      setAddError("That name is already on this day’s call offs.");
      return;
    }
    setDraftName("");
    setDraftKind("call-off");
    setAddError(null);
    closeAdd();
  }

  // Today + future: live roster OOT. Past: locked day ootNames only (never backfill).
  const displayedOot =
    viewingToday || viewingFuture
      ? ootNames
      : dayAvail && Array.isArray(dayAvail.ootNames)
        ? dayAvail.ootNames
        : [];
  const showOot =
    !sunday &&
    (viewingToday || viewingFuture
      ? status === "live" || status === "cached" || ootNames.length > 0
      : Boolean(dayAvail));

  const showCallOffs =
    !sunday &&
    (viewingToday || viewingFuture) &&
    (status === "live" ||
      status === "cached" ||
      callOffs.length > 0 ||
      canEditCallOffs);

  const whenLabel = viewingToday
    ? saturday
      ? "Saturday"
      : "today"
    : formatHeaderDate(viewed);

  return (
    <article className={compact ? "drivers-card drivers-card-compact" : "drivers-card"}>
      <div className="drivers-card-top">
        <div>
          <p className="section-title">Available drivers</p>
          {sunday ? (
            <p className="drivers-avail">No Sunday tally</p>
          ) : dayAvail ? (
            <p className="drivers-avail">
              {dayAvail.available} available {whenLabel}
            </p>
          ) : viewingToday ? (
            <p className="drivers-avail">Roster not loaded</p>
          ) : (
            <p className="drivers-avail">No snapshot for {formatHeaderDate(viewed)}</p>
          )}
          {sunday ? (
            <p className="grand-sub">
              Sundays are not tallied. {formatHeaderDate(viewed)}
            </p>
          ) : !dayAvail && viewingToday ? (
            <p className="grand-sub">
              Share both sheets as Anyone with the link (Viewer), then refresh.
            </p>
          ) : !dayAvail ? (
            <p className="grand-sub">
              This Chicago day was never snapshotted. Today’s live sheet is not
              written back onto past dates.
            </p>
          ) : null}
        </div>
        <span className="grand-value">{dayAvail ? dayAvail.available : "—"}</span>
      </div>

      {showOot ? (
        <div className="oot-block">
          <p className="oot-label">Out of town</p>
          <p className="oot-yards">
            {viewingToday
              ? "Live from Burnham · Rockford · Pontiac · ARC · Zion"
              : viewingFuture
                ? "Current roster OOT"
                : dayAvail?.locked
                  ? "Locked for this Chicago day"
                  : "Saved with this day’s snapshot"}
          </p>
          {displayedOot.length ? (
            <ul className="oot-list">
              {displayedOot.map((name) => (
                <li key={name} className="oot-chip">
                  {name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="oot-empty">
              {viewingToday
                ? "No OOT"
                : dayAvail && Array.isArray(dayAvail.ootNames)
                  ? "No OOT"
                  : "No OOT saved for this day"}
            </p>
          )}
        </div>
      ) : null}

      {showCallOffs ? (
        <div className="oot-block">
          <div className="calloff-head">
            <div>
              <p className="oot-label">Call offs</p>
              <p className="oot-yards">Full-day Off.</p>
            </div>
            {canEditCallOffs ? (
              <button
                type="button"
                className="calloff-add-btn"
                aria-expanded={adding}
                onClick={() => {
                  if (adding) {
                    closeAdd();
                    return;
                  }
                  setAddingFor(viewed);
                  setDraftName("");
                  setDraftKind("call-off");
                  setAddError(null);
                }}
              >
                <Plus size={14} strokeWidth={2.6} />
                Add
              </button>
            ) : null}
          </div>
          {adding ? (
            <form
              className="calloff-add-form"
              onSubmit={(event) => {
                event.preventDefault();
                void saveManual();
              }}
            >
              <label className="field-label calloff-name-label" htmlFor={`calloff-name-${viewed}`}>
                Driver name
              </label>
              <input
                id={`calloff-name-${viewed}`}
                className="text-input calloff-name-input"
                value={draftName}
                onChange={(event) => {
                  setDraftName(event.target.value);
                  if (addError) setAddError(null);
                }}
                placeholder="Name"
                autoComplete="off"
                autoFocus
              />
              <p className="field-label calloff-type-label">Type</p>
              <div className="calloff-kind-row" role="group" aria-label="Call-off type">
                {CALL_OFF_KIND_OPTIONS.map((option) => (
                  <button
                    key={option.kind}
                    type="button"
                    className={
                      draftKind === option.kind
                        ? `calloff-kind-btn calloff-kind-${option.kind} selected`
                        : `calloff-kind-btn calloff-kind-${option.kind}`
                    }
                    aria-pressed={draftKind === option.kind}
                    onClick={() => setDraftKind(option.kind)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {addError ? <p className="calloff-add-error">{addError}</p> : null}
              <div className="calloff-add-actions">
                <button type="submit" className="text-btn amber">
                  Save
                </button>
                <button
                  type="button"
                  className="text-btn"
                  onClick={closeAdd}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
          {callOffs.length ? (
            <ul className="oot-list">
              {callOffs.map((entry) => (
                <li
                  key={`${entry.source}:${entry.name}`}
                  className={`oot-chip calloff-chip calloff-chip-${entry.kind}`}
                >
                  <span>{entry.name}</span>
                  {entry.source === "manual" ? (
                    <button
                      type="button"
                      className="calloff-remove"
                      aria-label={`Remove ${entry.name}`}
                      onClick={() => void removeManualOff(viewed, entry.name)}
                    >
                      <X size={12} strokeWidth={2.6} />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="oot-empty">No full-day call offs</p>
          )}
        </div>
      ) : null}

      {!compact && avg !== null ? (
        <p className="drivers-avg">
          YTD average {avg.toFixed(0)} available · Mon–Sat (no Sundays)
        </p>
      ) : null}

      <div className="drivers-actions">
        <button
          type="button"
          className="text-btn amber"
          onClick={() => void refresh()}
          disabled={status === "loading"}
        >
          <RefreshCw size={16} />
          {status === "loading" ? "Pulling sheets…" : "Refresh sheets"}
        </button>
        <span className="field-hint tight">
          {status === "live"
            ? `Live · ${pulledLabel(fetchedAt)}`
            : status === "cached"
              ? `Cached · ${pulledLabel(fetchedAt)}`
              : status === "error"
                ? "Sheets unreachable"
                : "Pulling…"}
        </span>
      </div>
      {error ? <p className="field-hint">{error}</p> : null}
    </article>
  );
}
