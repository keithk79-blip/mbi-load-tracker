import { useMemo, useState } from "react";
import { BrandMark } from "../components/BrandMark";
import { DriverNameInput } from "../components/DriverNameInput";
import { chicagoToday } from "../lib/chicagoDate";
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

type FilterId = "upcoming" | "today" | "all";

function kindLabel(reason: string): string {
  const kind = kindForLogEntry({ reason });
  return CALL_OFF_KIND_OPTIONS.find((row) => row.kind === kind)?.label ?? "Note";
}

function RowEditor({
  row,
  today,
  onSave,
  onRemove,
}: {
  row: CallOffLogEntry;
  today: string;
  onSave: (patch: Partial<Pick<CallOffLogEntry, "name" | "start" | "end" | "reason">>) => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(row.name);
  const [start, setStart] = useState(row.start);
  const [end, setEnd] = useState(row.end ?? "");
  const [reason, setReason] = useState(row.reason);
  const past = (row.end ?? row.start) < today;
  const current = row.start <= today && (row.end ?? row.start) >= today;

  function commit() {
    const nextName = name.trim() || row.name;
    const nextStart = start || row.start;
    const nextEnd = end && end !== nextStart ? end : null;
    if (
      nextName === row.name &&
      nextStart === row.start &&
      nextEnd === row.end &&
      reason.trim() === row.reason
    ) {
      return;
    }
    onSave({ name: nextName, start: nextStart, end: nextEnd, reason });
  }

  return (
    <tr className={current ? "is-today" : past ? "is-past" : undefined}>
      <td>
        <DriverNameInput value={name} onChange={setName} aria-label={`${row.name} name`} />
      </td>
      <td>
        <input
          type="date"
          value={start}
          aria-label={`${row.name} call off date`}
          onChange={(event) => setStart(event.target.value)}
          onBlur={commit}
        />
      </td>
      <td>
        <input
          type="date"
          value={end}
          aria-label={`${row.name} through date`}
          onChange={(event) => setEnd(event.target.value)}
          onBlur={commit}
        />
      </td>
      <td>
        <input
          value={reason}
          aria-label={`${row.name} reason`}
          onChange={(event) => setReason(event.target.value)}
          onBlur={commit}
        />
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

export function CallOffsScreen() {
  const today = chicagoToday();
  const { rows, cloud, error, addRow, editRow, removeRow } = useCallOffLog();
  const [filter, setFilter] = useState<FilterId>("upcoming");
  const [name, setName] = useState("");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("P-Day");
  const [formError, setFormError] = useState<string | null>(null);

  const visible = useMemo(() => {
    return rows.filter((row) => {
      const last = row.end ?? row.start;
      if (filter === "today") return row.start <= today && last >= today;
      if (filter === "upcoming") return last >= today;
      return true;
    });
  }, [rows, filter, today]);

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
            <h1 className="page-title">Call-Off&apos;s</h1>
          </div>
        </div>
        <p className="field-hint tight">
          {todayCount} full-day off{todayCount === 1 ? "" : "s"} on {formatSheetStyleDate(today)}
          {cloud ? " · synced" : " · this device"}
        </p>
      </header>

      <p className="field-hint">
        Full Roster is the hired count. P-Day, Call Off, Ok&apos;d Off, vacation, FMLA,
        court, bereavement, and last day mark that name on Available and subtract the tally.
        Late start / park-by notes stay on the roster.
      </p>

      <div className="calloffs-legend" aria-label="How rows hit Available">
        <span className="calloffs-legend-item">
          <i className="calloff-chip calloff-chip-p-day calloffs-kind">P-Day</i> subtracts
        </span>
        <span className="calloffs-legend-item">
          <i className="calloff-chip calloff-chip-okd-off calloffs-kind">Ok&apos;d Off</i> subtracts
        </span>
        <span className="calloffs-legend-item">
          <i className="calloff-chip calloff-chip-call-off calloffs-kind">Call Off</i> subtracts
        </span>
        <span className="calloffs-legend-item">Park / late notes do not</span>
      </div>

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
        </div>
      </form>

      <div className="vac-year-row" role="tablist" aria-label="Call-off filter">
        {(
          [
            ["upcoming", "Upcoming"],
            ["today", "Today"],
            ["all", "All"],
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
              <RowEditor
                key={row.id}
                row={row}
                today={today}
                onSave={(patch) => void editRow(row.id, patch)}
                onRemove={() => void removeRow(row.id)}
              />
            ))}
            {!visible.length ? (
              <tr>
                <td colSpan={5}>
                  <p className="oot-empty">No rows in this view.</p>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
