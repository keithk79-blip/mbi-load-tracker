import { useMemo, useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
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
import { vacationNamesOnDateAllYards } from "../lib/rosterVacation";
import { DriverNameInput } from "./DriverNameInput";
import { useDrivers } from "../store/DriversContext";
import { useVacation } from "../store/VacationContext";
import "./drivers-card.css";

const CALL_OFF_KIND_BUTTON_STYLE: Record<
  CallOffKind,
  { background: string; border: string; color: string }
> = {
  "call-off": { background: "#1d4f91", border: "1px solid #163e73", color: "#ffffff" },
  "p-day": { background: "#166534", border: "1px solid #14532d", color: "#ffffff" },
  "okd-off": { background: "#a16207", border: "1px solid #854d0e", color: "#ffffff" },
  ncns: { background: "#b91c1c", border: "1px solid #7f1d1d", color: "#ffffff" },
  "late-early": { background: "#c2410c", border: "1px solid #9a3412", color: "#ffffff" },
};

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
  collapsible = false,
  date,
  loadCount = null,
}: {
  compact?: boolean;
  collapsible?: boolean;
  date?: string;
  loadCount?: number | null;
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
    ootNames,
    callOffsOn,
    addManualOff,
    removeManualOff,
  } = useDrivers();
  const vacation = useVacation();
  const vacationNames = useMemo(
    () => vacationNamesOnDateAllYards(vacation.store, viewed),
    [vacation.store, viewed],
  );
  const [open, setOpen] = useState(!collapsible);
  const dayAvail = availabilityOn(viewed);
  const avg = ytdAverage(today);
  const callOffs = callOffsOn(viewed);
  const canEditCallOffs = !sunday;

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
    (viewingToday || viewingFuture
      ? status === "live" ||
        status === "cached" ||
        callOffs.length > 0 ||
        canEditCallOffs
      : Boolean(dayAvail) || callOffs.length > 0 || canEditCallOffs);

  const whenLabel = viewingToday
    ? saturday
      ? "Saturday"
      : "today"
    : formatHeaderDate(viewed);

  const collapsed = collapsible && !open;
  const loadsPerDriver =
    !sunday && dayAvail && dayAvail.available > 0 && loadCount != null
      ? (loadCount / dayAvail.available).toFixed(2)
      : null;

  const summaryLine = sunday
    ? "No Sunday tally"
    : dayAvail
      ? collapsed
        ? `${dayAvail.available} out of ${dayAvail.base} drivers`
        : `${dayAvail.available} out of ${dayAvail.base} · ${whenLabel}`
      : viewingToday
        ? "Roster not loaded"
        : `No snapshot for ${formatHeaderDate(viewed)}`;

  return (
    <article
      className={[
        compact ? "drivers-card drivers-card-compact" : "drivers-card",
        collapsed ? "drivers-card-collapsed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="drivers-card-top">
        {collapsible ? (
          <button
            type="button"
            className="drivers-card-toggle"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="drivers-card-toggle-copy">
              <span className="section-title">Available drivers</span>
              <span className="drivers-avail">{summaryLine}</span>
              {collapsed && loadsPerDriver ? (
                <span className="drivers-ratio">{loadsPerDriver} loads/driver</span>
              ) : null}
            </span>
            <ChevronDown
              size={18}
              className={open ? "totals-chevron open" : "totals-chevron"}
              aria-hidden
            />
          </button>
        ) : (
          <div>
            <p className="section-title">Available drivers</p>
            <p className="drivers-avail">{summaryLine}</p>
            {sunday ? (
              <p className="grand-sub">
                Sundays are not tallied. {formatHeaderDate(viewed)}
              </p>
            ) : !dayAvail && viewingToday ? (
              <p className="grand-sub">
                Import Full Roster on the Driver tab (one-time seed).
              </p>
            ) : !dayAvail ? (
              <p className="grand-sub">
                This Chicago day was never snapshotted. Today’s live roster tally is not
                written back onto past dates.
              </p>
            ) : null}
          </div>
        )}
      </div>

      {!collapsed && showOot ? (
        <div className="oot-block">
          <p className="oot-label">Out of town</p>
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

      {!collapsed && showCallOffs ? (
        <div className="oot-block">
          <div className="calloff-head">
            <div>
              <p className="oot-label">Call offs</p>
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
              <DriverNameInput
                id={`calloff-name-${viewed}`}
                className="text-input calloff-name-input"
                value={draftName}
                onChange={(next) => {
                  setDraftName(next);
                  if (addError) setAddError(null);
                }}
                placeholder="Name"
                autoFocus
                aria-label="Driver name"
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
                    style={{
                      ...CALL_OFF_KIND_BUTTON_STYLE[option.kind],
                      fontWeight: 800,
                      opacity: 1,
                    }}
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
                <button type="button" className="text-btn" onClick={closeAdd}>
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

      {!collapsed && !sunday ? (
        <div className="oot-block">
          <p className="oot-label">Vacation</p>
          {vacationNames.length ? (
            <ul className="oot-list">
              {vacationNames.map((name) => (
                <li key={name} className="oot-chip vacation-chip">
                  {name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="oot-empty">No vacation this week</p>
          )}
        </div>
      ) : null}

      {!collapsed && !compact && avg !== null ? (
        <p className="drivers-avg">
          YTD average {avg.toFixed(0)} available · Mon–Sat (no Sundays)
        </p>
      ) : null}

      {!collapsed ? (
        <>
          <div className="drivers-actions">
            <span className="field-hint tight">
              {status === "live"
                ? `Full Roster · ${pulledLabel(fetchedAt)}`
                : status === "cached"
                  ? `Full Roster · ${pulledLabel(fetchedAt)}`
                  : status === "error"
                    ? "Could not sync"
                    : status === "loading"
                      ? "Loading…"
                      : "Full Roster"}
            </span>
          </div>
          {error ? <p className="field-hint">{error}</p> : null}
        </>
      ) : null}
    </article>
  );
}
