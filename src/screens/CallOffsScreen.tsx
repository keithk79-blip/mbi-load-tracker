import { useMemo, useState } from "react";
import { BrandMark } from "../components/BrandMark";
import { DriverNameInput } from "../components/DriverNameInput";
import { addDays, chicagoToday } from "../lib/chicagoDate";
import {
  CALL_OFF_REASON_PRESETS,
  formatSheetStyleDate,
  kindForLogEntry,
  logEntrySubtracts,
  type CallOffLogEntry,
} from "../lib/callOffLog";
import { CALL_OFF_KIND_OPTIONS } from "../lib/driverAvailability";
import { useCallOffLog } from "../store/CallOffLogContext";
import "./calloffs-screen.css";

type FilterId = "upcoming" | "today" | "yesterday" | "all";

function kindLabel(reason: string): string {
  const kind = kindForLogEntry({ reason });
  return CALL_OFF_KIND_OPTIONS.find((row) => row.kind === kind)?.label ?? "Note";
}

export function CallOffsScreen() {
  const today = chicagoToday();
  const yesterday = addDays(today, -1);
  const { rows, cloud, error, addRow, removeRow, loadSheet } = useCallOffLog();
  const [filter, setFilter] = useState<FilterId>("all");
  const [name, setName] = useState("");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("P-Day");
  const [formError, setFormError] = useState<string | null>(null);

  const visible = useMemo(() => {
    return rows.filter((row) => {
      const last = row.end ?? row.start;
      if (filter === "today") return row.start <= today && last >= today;
      if (filter === "yesterday") return row.start <= yesterday && last >= yesterday;
      if (filter === "upcoming") return last >= today;
      return true;
    });
  }, [rows, filter, today, yesterday]);

  const todayCount = rows.filter((row) => {
    const last = row.end ?? row.start;
    return row.start <= today && last >= today && logEntrySubtracts(row);
  }).length;

  async function onAdd() {
    if (!name.trim()) {
      setFormError("Enter a Full Roster driver name.");
      return;
    }
    if (!start) {
      setFormError("Pick a call-off date.");
      return;
    }
    const entry = await addRow({
      name,
      start,
      end: end || null,
      reason,
    });
    if (!entry) {
      setFormError("Could not save that row.");
      return;
    }
    setName("");
    setEnd("");
    setReason("P-Day");
    setFormError(null);
  }

  return (
    <div className="screen calloffs-screen">
      <header className="page-header">
        <div className="page-header-brand">
          <BrandMark />
          <div>
            <p className="eyebrow">Dispatcher log</p>
            <h1 className="page-title">Call-Off's</h1>
          </div>
        </div>
        <p className="field-hint tight">
          {rows.length} row{rows.length === 1 ? "" : "s"} · {todayCount} off today
          {cloud ? " · synced" : " · this device"}
        </p>
      </header>

      <p className="field-hint">
        Same sheet as before: Name, Call Off, Through Date, Reason. P-Day / Call Off /
        Ok'd Off subtract from Available. Park-by and late notes do not.
      </p>

      <form
        className="calloffs-add"
        onSubmit={(event) => {
          event.preventDefault();
          void onAdd();
        }}
      >
        <div className="calloffs-add-grid">
          <DriverNameInput value={name} onChange={setName} placeholder="Driver name" aria-label="Driver name" />
          <input
            className="text-input"
            type="date"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            aria-label="Call off date"
          />
          <input
            className="text-input"
            type="date"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            aria-label="Through date"
          />
        </div>
        <input
          className="text-input"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Reason"
          aria-label="Reason"
        />
        <div className="calloffs-reason-row" role="group" aria-label="Reason presets">
          {CALL_OFF_REASON_PRESETS.map((item) => (
            <button
              key={item}
              type="button"
              className={reason === item ? "day-chip day-chip-active" : "day-chip"}
              onClick={() => setReason(item)}
            >
              {item}
            </button>
          ))}
        </div>
        {formError ? <p className="form-error">{formError}</p> : null}
        <div className="vac-add-actions">
          <button type="submit" className="text-btn amber">
            Add row
          </button>
          <button
            type="button"
            className="text-btn"
            onClick={() => void loadSheet()}
          >
            Load original sheet
          </button>
        </div>
      </form>

      <div className="vac-year-row" role="tablist" aria-label="Call-off filter">
        {(
          [
            ["all", `All (${rows.length})`],
            ["upcoming", "Upcoming"],
            ["today", `Today (${formatSheetStyleDate(today)})`],
            ["yesterday", `Yesterday (${formatSheetStyleDate(yesterday)})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={filter === id ? "day-chip day-chip-active" : "day-chip"}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <p className="field-hint">{error}</p> : null}

      <div className="calloffs-table-wrap">
        <table className="calloffs-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Call Off</th>
              <th>Through Date</th>
              <th>Reason</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <SheetRow
                key={row.id}
                row={row}
                today={today}
                onRemove={() => void removeRow(row.id)}
              />
            ))}
            {!visible.length ? (
              <tr>
                <td colSpan={5}>
                  <p className="oot-empty">
                    No rows yet. Hit Load original sheet to pull in the current log.
                  </p>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SheetRow({
  row,
  today,
  onRemove,
}: {
  row: CallOffLogEntry;
  today: string;
  onRemove: () => void;
}) {
  const last = row.end ?? row.start;
  const current = row.start <= today && last >= today;
  const past = last < today;
  return (
    <tr className={current ? "is-today" : past ? "is-past" : undefined}>
      <td>{row.name}</td>
      <td>{formatSheetStyleDate(row.start)}</td>
      <td>{row.end ? formatSheetStyleDate(row.end) : ""}</td>
      <td>
        {row.reason}
        <span className={`calloffs-kind calloff-chip calloff-chip-${kindForLogEntry(row)}`}>
          {logEntrySubtracts(row) ? kindLabel(row.reason) : "Note"}
        </span>
      </td>
      <td className="calloffs-actions">
        <button type="button" className="text-btn" onClick={onRemove} aria-label={`Remove ${row.name}`}>
          ×
        </button>
      </td>
    </tr>
  );
}
