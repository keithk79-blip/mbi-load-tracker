import { useEffect, useMemo, useRef, useState } from "react";
import { BrandMark } from "../components/BrandMark";
import { addDays, chicagoToday, formatMonthDayYear, weekdayOfISO } from "../lib/chicagoDate";
import {
  DRIVER_ROSTER_KINDS,
  DRIVER_ROSTER_YARDS,
  driverRosterYardLabel,
  entriesForRoster,
  formatRosterCopyList,
  rosterEntryCount,
  satDateForYard,
  type DriverRosterKind,
} from "../lib/driverRoster";
import { useDriverRoster } from "../store/DriverRosterContext";

function upcomingSaturday(today: string): string {
  const dow = weekdayOfISO(today);
  return dow === 6 ? today : addDays(today, 6 - dow);
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
        placeholder="Truck #"
        inputMode="numeric"
        autoComplete="off"
        aria-label="Truck number"
      />
      <input
        ref={nameRef}
        className="text-input drv-add-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Driver name"
        autoComplete="off"
        aria-label="Driver name"
      />
      {kind === "full" ? (
        <input
          className="text-input drv-add-status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          placeholder="Status (oot, vac…)"
          autoComplete="off"
          aria-label="Status"
        />
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

export function DriverScreen() {
  const {
    store,
    kind,
    yard,
    setKind,
    setYard,
    importing,
    lastImport,
    importFromSheet,
    addDriver,
    removeDriver,
    moveDriver,
    setSatDate,
  } = useDriverRoster();
  const [adding, setAdding] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const entries = useMemo(() => entriesForRoster(store, kind, yard), [store, kind, yard]);
  const count = rosterEntryCount(store, kind, yard);
  const satDate = satDateForYard(store, yard);
  const copyTextValue = formatRosterCopyList(entries);
  const yardLabel = driverRosterYardLabel(yard);
  const kindLabel = kind === "sat" ? "Sat Roster" : "Full Roster";

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
        {DRIVER_ROSTER_KINDS.map((item) => {
          const selected = kind === item;
          const label = item === "full" ? "Full Roster" : "Sat Roster";
          return (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={selected}
              className={selected ? "vac-yard-btn is-active" : "vac-yard-btn"}
              onClick={() => {
                setKind(item);
                setAdding(false);
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <header className="page-header">
        <div className="page-header-brand">
          <BrandMark />
          <div>
            <p className="eyebrow">{kindLabel}</p>
            <h1 className="page-title">{yardLabel}</h1>
          </div>
        </div>
        <div className="drv-header-meta">
          <p className="drv-count">
            {count} {count === 1 ? "driver" : "drivers"}
          </p>
          <button
            type="button"
            className="text-btn amber"
            disabled={importing}
            onClick={() => void importFromSheet()}
          >
            {importing ? "Importing…" : "Import from sheet"}
          </button>
        </div>
      </header>

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
              }}
            >
              {driverRosterYardLabel(item)}
            </button>
          ))}
        </div>
      </div>

      {kind === "sat" ? (
        <div className="drv-sat-bar">
          <label className="drv-sat-date">
            Planning Saturday
            <input
              className="text-input drv-sat-input"
              type="date"
              value={satDate ?? upcomingSaturday(chicagoToday())}
              onChange={(event) => void setSatDate(event.target.value || null)}
            />
          </label>
          {satDate ? (
            <p className="drv-sat-note">{formatMonthDayYear(satDate)}</p>
          ) : (
            <p className="drv-sat-note">Optional week label — does not write back to the sheet.</p>
          )}
        </div>
      ) : null}

      <div className="vac-legend" aria-label="Roster help">
        {kind === "sat" ? (
          <span className="vac-legend-note">
            Copy list is one driver per line as <code>truck name</code> (name only if no truck).
            Paste into email as-is.
          </span>
        ) : (
          <span className="vac-legend-note">
            Truck # and name. Status (oot, fmla, vac, wc) is optional. × removes. Edits save
            immediately.
          </span>
        )}
      </div>

      {lastImport?.error ? <p className="form-error">{lastImport.error}</p> : null}
      {lastImport && !lastImport.error ? (
        <p className="field-hint">
          {lastImport.added
            ? `Imported ${lastImport.added} drivers into empty yard lists.`
            : "Import ran — lists that already have drivers were left unchanged."}
          {lastImport.skippedGroups.length
            ? ` Skipped: ${lastImport.skippedGroups.join(", ")}.`
            : null}
        </p>
      ) : null}

      {kind === "sat" ? (
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
          <h2>No {yardLabel} {kind === "sat" ? "Saturday" : "full"} drivers yet</h2>
          <p>
            Import from the Chicago available-drivers workbook, or add names here. Today’s
            available-driver count still reads Burnham L13 / Sat-sum from the sheet.
          </p>
          <div className="vac-add-actions">
            <button
              type="button"
              className="text-btn amber"
              disabled={importing}
              onClick={() => void importFromSheet()}
            >
              Import from sheet
            </button>
            <button type="button" className="text-btn" onClick={() => setAdding(true)}>
              + Add driver
            </button>
          </div>
        </div>
      ) : (
        <div className="vac-table-wrap drv-table-wrap">
          <table className="vac-table drv-table">
            <thead>
              <tr>
                {kind === "sat" ? <th className="drv-col-move"> </th> : null}
                <th className="drv-col-truck">Truck</th>
                <th className="drv-col-name">Name</th>
                {kind === "full" ? <th className="drv-col-status">Status</th> : null}
                <th className="drv-col-actions"> </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => (
                <tr key={entry.id} className="drv-row">
                  {kind === "sat" ? (
                    <td className="drv-col-move">
                      <div className="drv-move">
                        <button
                          type="button"
                          className="drv-move-btn"
                          aria-label={`Move ${entry.name} up`}
                          disabled={index === 0}
                          onClick={() => void moveDriver(entry.id, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="drv-move-btn"
                          aria-label={`Move ${entry.name} down`}
                          disabled={index === entries.length - 1}
                          onClick={() => void moveDriver(entry.id, 1)}
                        >
                          ↓
                        </button>
                      </div>
                    </td>
                  ) : null}
                  <td className="drv-col-truck">{entry.truckNumber ?? "—"}</td>
                  <td className="drv-col-name">{entry.name}</td>
                  {kind === "full" ? (
                    <td className="drv-col-status">
                      {entry.status ? <span className="drv-status">{entry.status}</span> : "—"}
                    </td>
                  ) : null}
                  <td className="drv-col-actions">
                    <button
                      type="button"
                      className="vac-pill-x drv-remove"
                      aria-label={`Remove ${entry.name}`}
                      onClick={() => void removeDriver(entry.id)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="drv-add-row">
                <td colSpan={kind === "full" ? 4 : 4}>
                  {adding ? (
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
                  ) : (
                    <button type="button" className="vac-add-link" onClick={() => setAdding(true)}>
                      + Add
                    </button>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
