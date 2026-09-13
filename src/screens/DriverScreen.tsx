import { useEffect, useMemo, useRef, useState } from "react";
import { BrandMark } from "../components/BrandMark";
import { DriverNameInput } from "../components/DriverNameInput";
import { ConfirmOverlay } from "../components/ConfirmOverlay";
import { addDays, chicagoToday, formatMonthDayYear, isValidISODate, weekdayOfISO } from "../lib/chicagoDate";
import { entriesForGone, goneEntryCount, type DriverGoneEntry } from "../lib/driverGone";
import {
  DRIVER_ROSTER_YARDS,
  DRIVER_TAB_GROUPS,
  ROSTER_UNAVAILABLE_REASONS,
  driverRosterYardLabel,
  entriesForRoster,
  formatRosterCopyList,
  fullRosterTally,
  rosterEntryCount,
  rosterStatusLabel,
  rosterStatusRemovesFromAvailable,
  satDateForYard,
  satRosterColumnCount,
  satRosterMatchesFull,
  satRosterRowCount,
  type DriverRosterEntry,
  type DriverRosterKind,
  type DriverTabGroup,
} from "../lib/driverRoster";
import {
  effectiveRosterStatus,
  vacationNamesOnDate,
} from "../lib/rosterVacation";
import { sundayOnOrBefore } from "../lib/vacationBoard";
import { useDriverGone } from "../store/DriverGoneContext";
import { useDriverRoster } from "../store/DriverRosterContext";
import { useVacation } from "../store/VacationContext";

function upcomingSaturday(today: string): string {
  const dow = weekdayOfISO(today);
  return dow === 6 ? today : addDays(today, 6 - dow);
}

function useSatRosterColumnCount(): number {
  const [width, setWidth] = useState(() =>
    typeof window === "undefined" ? 1400 : window.innerWidth,
  );
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return satRosterColumnCount(width);
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

function AddRosterForm({
  kind,
  onCancel,
  onSave,
}: {
  kind: DriverRosterKind;
  onCancel: () => void;
  onSave: (truck: string, name: string, status: string) => void;
}) {
  const [truck, setTruck] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  return (
    <form
      className="drv-add-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        onSave(truck.trim(), name.trim(), status.trim());
      }}
    >
      <input
        className="text-input drv-add-truck"
        value={truck}
        onChange={(event) => setTruck(event.target.value)}
        placeholder="Employee #"
        inputMode="numeric"
        autoComplete="off"
        aria-label="Employee number"
      />
      <DriverNameInput
        inputRef={nameRef}
        className="text-input drv-add-name"
        value={name}
        onChange={setName}
        placeholder="Driver name"
        aria-label="Driver name"
      />
      {kind === "full" ? (
        <select
          className="text-input drv-add-status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label="Unavailability reason"
        >
          <option value="">Available (working)</option>
          {ROSTER_UNAVAILABLE_REASONS.map((row) => (
            <option key={row.token} value={row.token}>
              {row.reason !== row.label ? `${row.label} — ${row.reason}` : `${row.label} — out`}
            </option>
          ))}
        </select>
      ) : null}
      <div className="vac-add-actions">
        <button type="submit" className="text-btn amber">
          Add
        </button>
        <button type="button" className="text-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function tabGroupLabel(group: DriverTabGroup): string {
  if (group === "full") return "Full Roster";
  if (group === "sat") return "Sat Roster";
  return "Gone";
}

function AddGoneForm({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: (input: {
    employeeNumber: string;
    name: string;
    hireDate: string;
    terminationDate: string;
    notes: string;
  }) => void;
}) {
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [name, setName] = useState("");
  const [hireDate, setHireDate] = useState("");
  const [terminationDate, setTerminationDate] = useState(() => chicagoToday());
  const [notes, setNotes] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  return (
    <form
      className="drv-add-form drv-gone-add-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        onSave({
          employeeNumber: employeeNumber.trim(),
          name: name.trim(),
          hireDate,
          terminationDate,
          notes,
        });
      }}
    >
      <input
        className="text-input drv-add-truck"
        value={employeeNumber}
        onChange={(event) => setEmployeeNumber(event.target.value)}
        placeholder="Employee #"
        inputMode="numeric"
        autoComplete="off"
        aria-label="Employee number"
      />
      <DriverNameInput
        inputRef={nameRef}
        className="text-input drv-add-name"
        value={name}
        onChange={setName}
        placeholder="Driver name"
        aria-label="Driver name"
      />
      <label className="drv-gone-field">
        Hire date
        <input
          className="text-input drv-gone-date"
          type="date"
          value={hireDate}
          onChange={(event) => setHireDate(event.target.value)}
        />
      </label>
      <label className="drv-gone-field">
        Termination date
        <input
          className="text-input drv-gone-date"
          type="date"
          value={terminationDate}
          onChange={(event) => setTerminationDate(event.target.value)}
        />
      </label>
      <input
        className="text-input drv-add-name"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Notes"
        autoComplete="off"
        aria-label="Notes"
      />
      <div className="vac-add-actions">
        <button type="submit" className="text-btn amber">
          Add
        </button>
        <button type="button" className="text-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

type FullRemoveDialog =
  | null
  | { step: "choose"; entry: DriverRosterEntry }
  | {
      step: "terminate";
      entry: DriverRosterEntry;
      hireDate: string;
      terminationDate: string;
      notes: string;
    };

export function DriverScreen() {
  const {
    store,
    kind,
    group,
    yard,
    setGroup,
    setYard,
    importing,
    lastImport,
    importFromSheet,
    addDriver,
    setDriverStatus,
    removeDriver,
    removeHiredAndSat,
    moveDriver,
    setSatDate,
    resetSatToFullRoster,
  } = useDriverRoster();
  const gone = useDriverGone();
  const vacation = useVacation();
  const [adding, setAdding] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [removeDialog, setRemoveDialog] = useState<FullRemoveDialog>(null);
  const [goneDelete, setGoneDelete] = useState<DriverGoneEntry | null>(null);
  const [asOf, setAsOf] = useState(() => chicagoToday());
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const today = chicagoToday();
  const onGone = group === "gone";
  const satCols = useSatRosterColumnCount();

  const entries = useMemo(() => entriesForRoster(store, kind, yard), [store, kind, yard]);
  const goneEntries = useMemo(() => entriesForGone(gone.store), [gone.store]);
  const count = onGone ? goneEntryCount(gone.store) : rosterEntryCount(store, kind, yard);
  const vacationNames = useMemo(
    () => (kind === "full" ? vacationNamesOnDate(vacation.store, asOf, yard) : []),
    [kind, vacation.store, asOf, yard],
  );
  const tally = useMemo(
    () =>
      kind === "full"
        ? fullRosterTally(entries, {
            treatAsUnavailable: (entry) => effectiveRosterStatus(entry, vacationNames).onVacation,
          })
        : null,
    [kind, entries, vacationNames],
  );
  const satDate = satDateForYard(store, yard);
  const copyTextValue = formatRosterCopyList(entries);
  const yardLabel = driverRosterYardLabel(yard);
  const vacationWeekOf = kind === "full" ? sundayOnOrBefore(asOf) : null;
  const fullCount = rosterEntryCount(store, "full", yard);
  const satMatchesFull = kind === "sat" && satRosterMatchesFull(store, yard);
  const satRows = satRosterRowCount(entries.length, satCols);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedCount = selectedIds.length;

  function toggleSelected(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  async function deleteSelected() {
    const ids = selectedIds.filter((id) => entries.some((entry) => entry.id === id));
    setSelectedIds([]);
    for (const id of ids) {
      await removeDriver(id);
    }
  }

  async function runResetToFull() {
    setResetting(true);
    setResetConfirm(false);
    setSelectedIds([]);
    try {
      await resetSatToFullRoster();
    } finally {
      setResetting(false);
    }
  }

  function onResetToFull() {
    if (count > 0 && !satMatchesFull) {
      setResetConfirm(true);
      return;
    }
    void runResetToFull();
  }

  async function confirmEditRemove() {
    if (removeDialog?.step !== "choose") return;
    const id = removeDialog.entry.id;
    setRemoveDialog(null);
    await removeHiredAndSat(id);
  }

  async function confirmTermination() {
    if (removeDialog?.step !== "terminate") return;
    const { entry, hireDate, terminationDate, notes } = removeDialog;
    setRemoveDialog(null);
    await gone.addGone({
      employeeNumber: entry.truckNumber,
      name: entry.name,
      hireDate: hireDate || null,
      terminationDate: terminationDate || today,
      notes,
      yard: entry.yard,
    });
    await removeHiredAndSat(entry.id);
  }

  async function onCopy() {
    const ok = await copyText(copyTextValue);
    if (!ok) {
      setCopyError("Could not copy — select the list and copy manually.");
      setCopied(false);
      return;
    }
    setCopyError(null);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="screen vac-screen drv-screen">
      <div className="vac-yard-switch" role="tablist" aria-label="Roster type">
        {DRIVER_TAB_GROUPS.map((item) => {
          const selected = group === item;
          return (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={selected}
              className={selected ? "vac-yard-btn is-active" : "vac-yard-btn"}
              onClick={() => {
                setGroup(item);
                setAdding(false);
                setResetConfirm(false);
                setRemoveDialog(null);
                setSelectedIds([]);
              }}
            >
              {tabGroupLabel(item)}
            </button>
          );
        })}
      </div>

      <header className="page-header">
        <div className="page-header-brand">
          <BrandMark />
          <div>
            <p className="eyebrow">
              {onGone ? "Terminated archive" : kind === "full" ? "Hired roster" : "Saturday planning"}
            </p>
            <h1 className="page-title">{onGone ? "Gone" : yardLabel}</h1>
          </div>
        </div>
        <div className="drv-header-meta">
          {onGone ? (
            <p className="drv-count">
              {count} {count === 1 ? "driver" : "drivers"} archived
            </p>
          ) : tally ? (
            <p className="drv-count" title="Hired − status − Vacation VAC for this yard/day. Today uses this Full Roster across all yards, minus leftover full-day offs.">
              <strong>{tally.hired}</strong> hired
              {tally.unavailable ? (
                <>
                  {" "}
                  · <span className="drv-count-out">{tally.unavailable} out</span>
                  {" "}
                  · {tally.available} available
                </>
              ) : (
                <> · all available</>
              )}
            </p>
          ) : (
            <p className="drv-count">
              {count} {count === 1 ? "driver" : "drivers"}
            </p>
          )}
          <div className="vac-add-actions">
            <button type="button" className="text-btn amber" onClick={() => setAdding(true)}>
              + Add
            </button>
            {kind === "sat" && !onGone ? (
              <button
                type="button"
                className="text-btn"
                disabled={resetting || (!fullCount && !count)}
                onClick={onResetToFull}
              >
                {resetting ? "Resetting…" : "Reset to full roster"}
              </button>
            ) : null}
            {onGone ? (
              <button
                type="button"
                className="text-btn"
                disabled={gone.importing || count > 0}
                onClick={() => void gone.importFromSheet()}
              >
                {gone.importing ? "Importing…" : "Import Gone 2026"}
              </button>
            ) : (
              <button
                type="button"
                className="text-btn"
                disabled={importing}
                onClick={() => void importFromSheet()}
              >
                {importing ? "Importing…" : "Import empty lists"}
              </button>
            )}
          </div>
        </div>
      </header>

      {onGone ? null : (
      <div className="vac-toolbar">
        <div className="vac-year-row" role="tablist" aria-label="Yard">
          {DRIVER_ROSTER_YARDS.map((item) => (
            <button
              key={item}
              type="button"
              className={yard === item ? "day-chip day-chip-active" : "day-chip"}
              onClick={() => {
                setYard(item);
                setAdding(false);
                setResetConfirm(false);
                setSelectedIds([]);
              }}
            >
              {driverRosterYardLabel(item)}
            </button>
          ))}
        </div>
      </div>
      )}

      {onGone ? null : kind === "sat" ? (
        <div className="drv-sat-bar">
          <label className="drv-sat-date">
            Planning Saturday
            <input
              className="text-input drv-sat-input"
              type="date"
              value={satDate ?? upcomingSaturday(today)}
              onChange={(event) => void setSatDate(event.target.value || null)}
            />
          </label>
          {satDate ? <p className="drv-sat-note">{formatMonthDayYear(satDate)}</p> : null}
          {resetConfirm ? (
            <div className="drv-reset-confirm" role="status">
              <p>Replace {yardLabel} Sat Roster with the current Full Roster?</p>
              <button
                type="button"
                className="text-btn amber"
                disabled={resetting}
                onClick={() => void runResetToFull()}
              >
                Reset
              </button>
              <button
                type="button"
                className="text-btn"
                disabled={resetting}
                onClick={() => setResetConfirm(false)}
              >
                Cancel
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="drv-sat-bar">
          <label className="drv-sat-date">
            As of
            <input
              className="text-input drv-sat-input"
              type="date"
              value={asOf}
              onChange={(event) => {
                const next = event.target.value;
                if (isValidISODate(next)) setAsOf(next);
              }}
            />
          </label>
          <p className="drv-sat-note">
            {formatMonthDayYear(asOf)}
            {vacationWeekOf ? ` · Vacation week of ${formatMonthDayYear(vacationWeekOf)}` : null}
            {vacationNames.length
              ? ` · ${vacationNames.length} on Vacation`
              : " · no Vacation names this week"}
          </p>
          {asOf !== today ? (
            <button
              type="button"
              className="text-btn"
              aria-label="Jump as-of date to today"
              onClick={() => setAsOf(today)}
            >
              Today
            </button>
          ) : null}
        </div>
      )}

      {adding && onGone ? (
        <AddGoneForm
          onCancel={() => setAdding(false)}
          onSave={(input) => {
            void gone.addGone({
              employeeNumber: input.employeeNumber,
              name: input.name,
              hireDate: input.hireDate || null,
              terminationDate: input.terminationDate || null,
              notes: input.notes,
            });
            setAdding(false);
          }}
        />
      ) : null}
      {adding && !onGone ? (
        <AddRosterForm
          kind={kind}
          onCancel={() => setAdding(false)}
          onSave={(truck, name, status) => {
            void addDriver({
              truckNumber: truck,
              name,
              status,
              forDate: satDate,
            });
            setAdding(false);
          }}
        />
      ) : null}

      {onGone && gone.lastImport?.error ? <p className="form-error">{gone.lastImport.error}</p> : null}
      {onGone && gone.lastImport && !gone.lastImport.error ? (
        <p className="field-hint">
          {gone.lastImport.added
            ? `Imported ${gone.lastImport.added} drivers into the empty Gone archive.`
            : gone.lastImport.skipped
              ? "Import ran — Gone already has rows, so nothing was added."
              : "Import ran — no Gone rows found."}
        </p>
      ) : null}
      {!onGone && lastImport?.error ? <p className="form-error">{lastImport.error}</p> : null}
      {!onGone && lastImport && !lastImport.error ? (
        <p className="field-hint">
          {lastImport.added
            ? `Imported ${lastImport.added} drivers into empty yard lists.`
            : "Import ran — lists that already have drivers were left unchanged."}
          {lastImport.skippedGroups.length
            ? ` Skipped: ${lastImport.skippedGroups.join(", ")}.`
            : null}
        </p>
      ) : null}

      {!onGone && kind === "sat" ? (
        <div className="drv-copy-card">
          <div className="drv-copy-toolbar">
            <p className="drv-copy-label">Email paste block</p>
            <button type="button" className="text-btn amber" onClick={() => void onCopy()}>
              {copied ? "Copied" : "Copy list"}
            </button>
          </div>
          <textarea
            className="drv-copy-block"
            readOnly
            value={copyTextValue}
            aria-label="Saturday roster as plain text"
          />
          {copyError ? <p className="form-error">{copyError}</p> : null}
        </div>
      ) : null}

      {!count && !adding ? (
        <div className="empty">
          <h2>
            {onGone
              ? "No terminated drivers archived yet"
              : `No ${yardLabel} ${kind === "sat" ? "Saturday planning" : "hired"} drivers yet`}
          </h2>
          <div className="vac-add-actions">
            {onGone ? (
              <button
                type="button"
                className="text-btn amber"
                disabled={gone.importing}
                onClick={() => void gone.importFromSheet()}
              >
                Import Gone 2026
              </button>
            ) : kind === "sat" && fullCount ? (
              <button
                type="button"
                className="text-btn amber"
                disabled={resetting}
                onClick={() => void runResetToFull()}
              >
                {resetting ? "Resetting…" : "Reset to full roster"}
              </button>
            ) : (
              <button
                type="button"
                className="text-btn amber"
                disabled={importing}
                onClick={() => void importFromSheet()}
              >
                Import empty lists
              </button>
            )}
            <button type="button" className="text-btn" onClick={() => setAdding(true)}>
              + Add driver
            </button>
          </div>
        </div>
      ) : onGone ? (
        <div className="vac-table-wrap drv-table-wrap">
          <table className="vac-table drv-table drv-gone-table">
            <thead>
              <tr>
                <th className="drv-col-truck">Emp #</th>
                <th className="drv-col-name">Name</th>
                <th className="drv-col-hire">Hire date</th>
                <th className="drv-col-term">Termination date</th>
                <th className="drv-col-notes">Notes</th>
                <th className="drv-col-actions"> </th>
              </tr>
            </thead>
            <tbody>
              {goneEntries.map((entry) => (
                <tr key={entry.id} className="drv-row">
                  <td className="drv-col-truck">{entry.employeeNumber ?? "—"}</td>
                  <td className="drv-col-name">{entry.name}</td>
                  <td className="drv-col-hire">
                    <input
                      className="text-input drv-gone-date"
                      type="date"
                      value={entry.hireDate ?? ""}
                      aria-label={`Hire date for ${entry.name}`}
                      onChange={(event) =>
                        void gone.updateGone(entry.id, { hireDate: event.target.value || null })
                      }
                    />
                  </td>
                  <td className="drv-col-term">
                    <input
                      className="text-input drv-gone-date"
                      type="date"
                      value={entry.terminationDate ?? ""}
                      aria-label={`Termination date for ${entry.name}`}
                      onChange={(event) =>
                        void gone.updateGone(entry.id, {
                          terminationDate: event.target.value || null,
                        })
                      }
                    />
                  </td>
                  <td className="drv-col-notes">
                    <input
                      className="text-input drv-gone-notes"
                      value={entry.notes}
                      aria-label={`Notes for ${entry.name}`}
                      onChange={(event) =>
                        void gone.updateGone(entry.id, { notes: event.target.value })
                      }
                    />
                  </td>
                  <td className="drv-col-actions">
                    <button
                      type="button"
                      className="vac-pill-x drv-remove"
                      aria-label={`Delete ${entry.name} from Gone`}
                      onClick={() => setGoneDelete(entry)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="drv-add-row">
                <td colSpan={6}>
                  <button type="button" className="vac-add-link" onClick={() => setAdding(true)}>
                    + Add
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : kind === "sat" ? (
        <div className="drv-sat-board">
          <div className="drv-sat-select-bar">
            {selectedCount ? (
              <>
                <p className="drv-sat-select-count">
                  {selectedCount} selected
                </p>
                <button
                  type="button"
                  className="text-btn amber"
                  onClick={() => void deleteSelected()}
                >
                  Delete selected
                </button>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => setSelectedIds([])}
                >
                  Clear
                </button>
              </>
            ) : (
              <p className="drv-sat-select-hint">Tap names to select · × removes one</p>
            )}
          </div>
          <div
            className="drv-sat-grid"
            role="list"
            aria-label={`${yardLabel} Saturday roster`}
            aria-multiselectable="true"
            style={{ ["--drv-sat-rows" as string]: String(satRows) }}
          >
            {entries.map((entry, index) => {
              const selected = selectedSet.has(entry.id);
              return (
              <div
                key={entry.id}
                className={selected ? "drv-sat-cell is-selected" : "drv-sat-cell"}
                role="listitem"
                aria-selected={selected}
                onClick={() => toggleSelected(entry.id)}
              >
                <div className="drv-move drv-sat-cell-move">
                  <button
                    type="button"
                    className="drv-move-btn"
                    aria-label={`Move ${entry.name} up`}
                    disabled={index === 0}
                    onClick={(event) => {
                      event.stopPropagation();
                      void moveDriver(entry.id, -1);
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="drv-move-btn"
                    aria-label={`Move ${entry.name} down`}
                    disabled={index === entries.length - 1}
                    onClick={(event) => {
                      event.stopPropagation();
                      void moveDriver(entry.id, 1);
                    }}
                  >
                    ↓
                  </button>
                </div>
                <div className="drv-sat-cell-body">
                  <span className="drv-sat-emp">{entry.truckNumber ?? "—"}</span>
                  <span className="drv-sat-cell-name">{entry.name}</span>
                </div>
                <button
                  type="button"
                  className="vac-pill-x drv-remove"
                  aria-label={`Remove ${entry.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedIds((prev) => prev.filter((id) => id !== entry.id));
                    void removeDriver(entry.id);
                  }}
                >
                  ×
                </button>
              </div>
              );
            })}
          </div>
          <button type="button" className="vac-add-link drv-sat-add" onClick={() => setAdding(true)}>
            + Add
          </button>
        </div>
      ) : (
        <div className="vac-table-wrap drv-table-wrap">
          <table className="vac-table drv-table">
            <thead>
              <tr>
                <th className="drv-col-truck">Emp #</th>
                <th className="drv-col-name">Name</th>
                <th className="drv-col-status">Unavailable</th>
                <th className="drv-col-actions"> </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const effective = effectiveRosterStatus(entry, vacationNames);
                const out =
                  rosterStatusRemovesFromAvailable(effective.status) ||
                  Boolean(effective.onVacation);
                const storedOut = rosterStatusRemovesFromAvailable(entry.status);
                return (
                <tr
                  key={entry.id}
                  className={out ? "drv-row is-out" : "drv-row"}
                >
                  <td className="drv-col-truck">{entry.truckNumber ?? "—"}</td>
                  <td className="drv-col-name">
                    {entry.name}
                    {out ? <span className="drv-out-tag">Out</span> : null}
                    {effective.onVacation ? (
                      <span className="drv-vac-from" title="From the Vacation tab this week">
                        Vac
                      </span>
                    ) : null}
                  </td>
                  <td className="drv-col-status">
                    <div className="drv-status-cell">
                      <select
                        className={
                          storedOut || effective.onVacation
                            ? "drv-status-select is-out"
                            : "drv-status-select"
                        }
                        value={entry.status ?? ""}
                        aria-label={`Unavailability for ${entry.name}`}
                        onChange={(event) =>
                          void setDriverStatus(entry.id, event.target.value || null)
                        }
                      >
                        <option value="">{effective.onVacation ? "No mark" : "Available"}</option>
                        {ROSTER_UNAVAILABLE_REASONS.map((row) => (
                          <option key={row.token} value={row.token}>
                            {row.reason !== row.label
                              ? `${row.label} — ${row.reason}`
                              : row.label}
                          </option>
                        ))}
                        {entry.status && !ROSTER_UNAVAILABLE_REASONS.some((row) => row.token === entry.status) ? (
                          <option value={entry.status}>
                            {rosterStatusLabel(entry.status)}
                          </option>
                        ) : null}
                      </select>
                      {effective.onVacation &&
                      entry.status &&
                      entry.status.toLowerCase() !== "vac" ? (
                        <span className="drv-also-status">
                          Vac + {rosterStatusLabel(entry.status)}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="drv-col-actions">
                    <button
                      type="button"
                      className="vac-pill-x drv-remove"
                      aria-label={`Remove ${entry.name}`}
                      onClick={() => setRemoveDialog({ step: "choose", entry })}
                    >
                      ×
                    </button>
                  </td>
                </tr>
                );
              })}
              <tr className="drv-add-row">
                <td colSpan={4}>
                  <button type="button" className="vac-add-link" onClick={() => setAdding(true)}>
                    + Add
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {removeDialog?.step === "choose" ? (
        <ConfirmOverlay onDismiss={() => setRemoveDialog(null)}>
          <p>
            Remove <strong>{removeDialog.entry.name}</strong> from Full Roster?
          </p>
          <p className="field-hint">
            <strong>Termination</strong> means they left the company — archive them on
            Gone with a termination date. <strong>Edit (remove only)</strong> is a
            list correction and does not add them to Gone.
          </p>
          <div className="overlay-footer tight overlay-footer-stack">
            <button
              type="button"
              className="btn-danger grow"
              onClick={() =>
                setRemoveDialog({
                  step: "terminate",
                  entry: removeDialog.entry,
                  hireDate: "",
                  terminationDate: today,
                  notes: "",
                })
              }
            >
              Termination
            </button>
            <button type="button" className="text-btn" onClick={() => void confirmEditRemove()}>
              Edit (remove only)
            </button>
            <button type="button" className="btn-ghost" onClick={() => setRemoveDialog(null)}>
              Cancel
            </button>
          </div>
        </ConfirmOverlay>
      ) : null}

      {removeDialog?.step === "terminate" ? (
        <ConfirmOverlay onDismiss={() => setRemoveDialog(null)}>
          <p>
            Archive <strong>{removeDialog.entry.name}</strong> on Gone?
          </p>
          <label className="drv-gone-field">
            Hire date
            <input
              className="text-input drv-gone-date"
              type="date"
              value={removeDialog.hireDate}
              onChange={(event) =>
                setRemoveDialog({ ...removeDialog, hireDate: event.target.value })
              }
            />
          </label>
          <label className="drv-gone-field">
            Termination date
            <input
              className="text-input drv-gone-date"
              type="date"
              value={removeDialog.terminationDate}
              onChange={(event) =>
                setRemoveDialog({ ...removeDialog, terminationDate: event.target.value })
              }
            />
          </label>
          <label className="drv-gone-field">
            Notes
            <input
              className="text-input"
              value={removeDialog.notes}
              onChange={(event) =>
                setRemoveDialog({ ...removeDialog, notes: event.target.value })
              }
              placeholder="Laid Off / Quit / Term / Retired"
              autoComplete="off"
            />
          </label>
          <div className="overlay-footer tight">
            <button type="button" className="btn-ghost" onClick={() => setRemoveDialog(null)}>
              Cancel
            </button>
            <button type="button" className="btn-danger grow" onClick={() => void confirmTermination()}>
              Save on Gone
            </button>
          </div>
        </ConfirmOverlay>
      ) : null}

      {goneDelete ? (
        <ConfirmOverlay onDismiss={() => setGoneDelete(null)}>
          <p>
            Delete <strong>{goneDelete.name}</strong> from Gone? This does not put
            them back on Full Roster.
          </p>
          <div className="overlay-footer tight">
            <button type="button" className="btn-ghost" onClick={() => setGoneDelete(null)}>
              Keep
            </button>
            <button
              type="button"
              className="btn-danger grow"
              onClick={() => {
                const id = goneDelete.id;
                setGoneDelete(null);
                void gone.removeGone(id);
              }}
            >
              Delete Gone row
            </button>
          </div>
        </ConfirmOverlay>
      ) : null}
    </div>
  );
}
