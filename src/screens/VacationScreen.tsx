import { useEffect, useMemo, useRef, useState } from "react";
import { BrandMark } from "../components/BrandMark";
import { chicagoToday, yearOfISO } from "../lib/chicagoDate";
import {
  VACATION_YARDS,
  entriesForWeek,
  formatWeekRange,
  holidayLabelForWeek,
  monthKeyForWeek,
  monthLabelForKey,
  rosterNamesFromStore,
  sundaysForVacationYear,
  vacationStatusLabel,
  vacationWeekKey,
  vacationYardLabel,
  weekBelongsToYear,
  weekContainsDate,
  weekFillLabel,
  weekIsOverCapacity,
  yearHasWeeks,
  yearsInStore,
  type VacationEntry,
  type VacationStatus,
  type VacationWeek,
  type VacationWeekKind,
} from "../lib/vacationBoard";
import { useDrivers } from "../store/DriversContext";
import { useVacation } from "../store/VacationContext";

const STATUS_OPTIONS: { id: VacationStatus; label: string }[] = [
  { id: "pending", label: vacationStatusLabel("pending") },
  { id: "approved", label: vacationStatusLabel("approved") },
  { id: "paid", label: vacationStatusLabel("paid") },
];

const HOLIDAY_PRESETS = [
  "New Years",
  "Memorial Day",
  "4th of July",
  "Labor Day",
  "Thanksgiving",
  "Christmas",
  "Blocked",
] as const;

function statusClass(status: VacationStatus): string {
  return `vac-pill vac-pill-${status}`;
}

function DriverPill({
  entry,
  onCycle,
  onRemove,
}: {
  entry: VacationEntry;
  onCycle: () => void;
  onRemove: () => void;
}) {
  return (
    <span className={statusClass(entry.status)}>
      <button
        type="button"
        className="vac-pill-main"
        onClick={onCycle}
        title={`${entry.name}${entry.note ? ` · ${entry.note}` : ""} · ${vacationStatusLabel(entry.status)}. Tap to cycle status.`}
        aria-label={`${entry.name}${entry.note ? `, ${entry.note}` : ""}, ${vacationStatusLabel(entry.status)}. Tap to cycle status.`}
      >
        <span className="vac-pill-name">{entry.name}</span>
        {entry.note ? <span className="vac-pill-note">{entry.note}</span> : null}
      </button>
      <button
        type="button"
        className="vac-pill-x"
        aria-label={`Remove ${entry.name}`}
        onClick={onRemove}
      >
        ×
      </button>
    </span>
  );
}

function AddDriverForm({
  suggestions,
  onCancel,
  onSave,
}: {
  suggestions: string[];
  onCancel: () => void;
  onSave: (name: string, status: VacationStatus, note: string) => void;
}) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<VacationStatus>("approved");
  const inputRef = useRef<HTMLInputElement>(null);
  const query = name.trim().toLowerCase();
  const matches = query
    ? suggestions.filter((item) => item.toLowerCase().includes(query)).slice(0, 8)
    : [];

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <form
      className="vac-add-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        onSave(name.trim(), status, note.trim());
      }}
    >
      <input
        ref={inputRef}
        className="text-input vac-add-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Driver name"
        autoComplete="off"
      />
      {matches.length ? (
        <div className="vac-suggest">
          {matches.map((item) => (
            <button
              key={item}
              type="button"
              className="vac-suggest-btn"
              onClick={() => setName(item)}
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}
      <input
        className="text-input vac-add-note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Note (optional)"
        autoComplete="off"
      />
      <div className="vac-status-row">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`vac-status-btn vac-status-${opt.id}${status === opt.id ? " selected" : ""}`}
            onClick={() => setStatus(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>
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

function WeekSettings({
  week,
  year,
  onClose,
  onSave,
}: {
  week: VacationWeek;
  year: number;
  onClose: () => void;
  onSave: (patch: {
    kind: VacationWeekKind;
    capacity: number | null;
    label: string;
  }) => void;
}) {
  const [kind, setKind] = useState<VacationWeekKind>(week.kind);
  const [capacity, setCapacity] = useState(
    String(week.capacity ?? (week.kind === "open" ? 8 : "")),
  );
  const [label, setLabel] = useState(week.label);

  return (
    <form
      className="vac-week-edit"
      onSubmit={(event) => {
        event.preventDefault();
        const cap = Number(capacity);
        onSave({
          kind,
          capacity: kind === "open" && Number.isFinite(cap) ? Math.max(0, Math.floor(cap)) : null,
          label: kind === "open" ? "" : label.trim() || (kind === "blocked" ? "Blocked" : holidayLabelForWeek(week.weekOf, year) ?? "Holiday"),
        });
      }}
    >
      <div className="vac-status-row">
        {(
          [
            ["open", "Open"],
            ["holiday", "Holiday"],
            ["blocked", "Blocked"],
          ] as const
        ).map(([id, text]) => (
          <button
            key={id}
            type="button"
            className={`vac-status-btn${kind === id ? " selected" : ""}`}
            onClick={() => {
              setKind(id);
              if (id === "holiday" && !label) {
                setLabel(holidayLabelForWeek(week.weekOf, year) ?? "");
              }
              if (id === "blocked") setLabel("Blocked");
            }}
          >
            {text}
          </button>
        ))}
      </div>
      {kind === "open" ? (
        <label className="vac-cap-label">
          Capacity
          <input
            className="text-input vac-cap-input"
            inputMode="numeric"
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
          />
        </label>
      ) : (
        <div className="vac-suggest">
          {HOLIDAY_PRESETS.map((item) => (
            <button
              key={item}
              type="button"
              className={`vac-suggest-btn${label === item ? " selected" : ""}`}
              onClick={() => {
                setLabel(item);
                setKind(item === "Blocked" ? "blocked" : "holiday");
              }}
            >
              {item}
            </button>
          ))}
          <input
            className="text-input vac-add-note"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Label"
          />
        </div>
      )}
      <div className="vac-add-actions">
        <button type="submit" className="text-btn amber">
          Save
        </button>
        <button type="button" className="text-btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function VacationScreen() {
  const today = chicagoToday();
  const currentYear = yearOfISO(today);
  const { store, yard, setYard, addDriver, cycleDriverStatus, removeDriver, editWeek, createYear } =
    useVacation();
  const { ootNames } = useDrivers();
  const [year, setYear] = useState(currentYear);
  const [addingWeek, setAddingWeek] = useState<string | null>(null);
  const [editingWeek, setEditingWeek] = useState<string | null>(null);
  const [newYear, setNewYear] = useState("");
  const [yearError, setYearError] = useState<string | null>(null);
  const tableRef = useRef<HTMLTableSectionElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  function scrollWeekIntoView(behavior: ScrollBehavior = "auto") {
    const node = wrapRef.current?.querySelector("[data-current-week='true']");
    const wrap = wrapRef.current;
    if (!node || !wrap) return;
    const top =
      node.getBoundingClientRect().top -
      wrap.getBoundingClientRect().top +
      wrap.scrollTop -
      48;
    wrap.scrollTo({ top: Math.max(0, top), behavior });
  }

  const knownYears = useMemo(
    () => yearsInStore(store, [currentYear, 2025, 2026, year], yard),
    [store, currentYear, year, yard],
  );
  const yearExists = yearHasWeeks(store, year, yard);
  const suggestions = useMemo(
    () => rosterNamesFromStore(store, ootNames, yard),
    [store, ootNames, yard],
  );

  const rows = useMemo(() => {
    const sundays = sundaysForVacationYear(year);
    const out: Array<
      | { type: "month"; key: string; label: string }
      | { type: "week"; week: VacationWeek; entries: VacationEntry[]; current: boolean }
    > = [];
    let lastMonth = "";
    for (const weekOf of sundays) {
      const week = store.weeks[vacationWeekKey(yard, weekOf)];
      if (!week || !weekBelongsToYear(weekOf, year)) continue;
      const month = monthKeyForWeek(weekOf);
      if (month !== lastMonth) {
        out.push({ type: "month", key: month, label: monthLabelForKey(month) });
        lastMonth = month;
      }
      out.push({
        type: "week",
        week,
        entries: entriesForWeek(store, weekOf, yard),
        current: weekContainsDate(weekOf, today),
      });
    }
    return out;
  }, [store, year, yard, today]);

  useEffect(() => {
    if (year !== currentYear || !yearExists) return;
    const id = requestAnimationFrame(() => scrollWeekIntoView("auto"));
    return () => cancelAnimationFrame(id);
  }, [year, currentYear, yearExists]);

  function jumpThisWeek() {
    setYear(currentYear);
    requestAnimationFrame(() => scrollWeekIntoView("smooth"));
  }

  async function onCreateYear() {
    const parsed = Number(newYear.trim());
    if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 2100) {
      setYearError("Enter a year like 2027.");
      return;
    }
    const created = await createYear(parsed);
    if (!created) {
      setYearError(`${parsed} already has weeks.`);
      return;
    }
    setYearError(null);
    setNewYear("");
    setYear(parsed);
  }

  return (
    <div className="screen vac-screen">
      <div className="vac-yard-switch" role="tablist" aria-label="Vacation yard">
        {VACATION_YARDS.map((item) => {
          const selected = yard === item;
          return (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={selected}
              className={selected ? "vac-yard-btn is-active" : "vac-yard-btn"}
              onClick={() => {
                setYard(item);
                setYear(2026);
                setAddingWeek(null);
                setEditingWeek(null);
              }}
            >
              {vacationYardLabel(item, 2026)}
            </button>
          );
        })}
      </div>

      <header className="page-header">
        <div className="page-header-brand">
          <BrandMark />
          <div>
            <p className="eyebrow">Vacation calendar</p>
            <h1 className="page-title">{vacationYardLabel(yard, year)}</h1>
          </div>
        </div>
        <button type="button" className="text-btn amber" onClick={jumpThisWeek}>
          This week
        </button>
      </header>

      <div className="vac-toolbar">
        <div className="vac-year-row" role="tablist" aria-label="Calendar year">
          {knownYears.map((item) => (
            <button
              key={item}
              type="button"
              className={year === item ? "day-chip day-chip-active" : "day-chip"}
              onClick={() => setYear(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <form
          className="vac-year-create"
          onSubmit={(event) => {
            event.preventDefault();
            void onCreateYear();
          }}
        >
          <input
            className="text-input vac-year-input"
            inputMode="numeric"
            placeholder="2027"
            value={newYear}
            onChange={(event) => {
              setNewYear(event.target.value);
              setYearError(null);
            }}
            aria-label="New year"
          />
          <button type="submit" className="text-btn amber">
            + Year
          </button>
        </form>
      </div>
      {yearError ? <p className="form-error">{yearError}</p> : null}

      <div className="vac-legend" aria-label="Status colors">
        {STATUS_OPTIONS.map((opt) => (
          <span key={opt.id} className="vac-legend-item">
            <i className={`vac-dot vac-dot-${opt.id}`} /> {opt.label}
          </span>
        ))}
        <span className="vac-legend-note">Tap a name to cycle color. × removes.</span>
      </div>

      {!yearExists ? (
        <div className="empty">
          <h2>{vacationYardLabel(yard, year)} isn’t created yet</h2>
          <p>
            Next year’s calendar can be seeded later — empty week rows with
            holiday labels, no driver names required. Rockford and Chicago
            stay on separate boards.
          </p>
          <button
            type="button"
            className="text-btn amber"
            onClick={() => void createYear(year).then((ok) => ok && setYear(year))}
          >
            Create {vacationYardLabel(yard, year)} weeks
          </button>
        </div>
      ) : (
        <div className="vac-table-wrap" ref={wrapRef}>
          <table className="vac-table">
            <thead>
              <tr>
                <th className="vac-col-week">Week of</th>
                <th className="vac-col-cap">Capacity</th>
                <th className="vac-col-drivers">Drivers</th>
              </tr>
            </thead>
            <tbody ref={tableRef}>
              {rows.map((row) => {
                if (row.type === "month") {
                  return (
                    <tr key={`m-${row.key}`} className="vac-month-row">
                      <th colSpan={3}>{row.label}</th>
                    </tr>
                  );
                }
                const { week, entries, current } = row;
                const filled = entries.length;
                const over = weekIsOverCapacity(week, filled);
                const adding = addingWeek === week.weekOf;
                const editing = editingWeek === week.weekOf;
                return (
                  <tr
                    key={vacationWeekKey(week.yard, week.weekOf)}
                    id={`vac-week-${week.weekOf}`}
                    data-current-week={current ? "true" : undefined}
                    className={`vac-week-row${current ? " is-current" : ""}${week.kind !== "open" ? " is-closed" : ""}`}
                  >
                    <td className="vac-col-week">
                      <div className="vac-week-date">{formatWeekRange(week.weekOf)}</div>
                      {current ? <div className="vac-now">This week</div> : null}
                    </td>
                    <td className="vac-col-cap">
                      {editing ? (
                        <WeekSettings
                          week={week}
                          year={year}
                          onClose={() => setEditingWeek(null)}
                          onSave={(patch) => {
                            void editWeek(week.weekOf, patch);
                            setEditingWeek(null);
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className={`vac-cap-chip${week.kind !== "open" ? " is-holiday" : ""}${over ? " is-over" : ""}`}
                          onClick={() => {
                            setEditingWeek(week.weekOf);
                            setAddingWeek(null);
                          }}
                        >
                          {weekFillLabel(week, filled)}
                        </button>
                      )}
                    </td>
                    <td className="vac-col-drivers">
                      <div className="vac-driver-row">
                        {entries.map((entry) => (
                          <DriverPill
                            key={entry.id}
                            entry={entry}
                            onCycle={() => void cycleDriverStatus(entry.id)}
                            onRemove={() => void removeDriver(entry.id)}
                          />
                        ))}
                        {adding ? (
                          <AddDriverForm
                            suggestions={suggestions}
                            onCancel={() => setAddingWeek(null)}
                            onSave={(name, status, note) => {
                              void addDriver(week.weekOf, name, { status, note });
                              setAddingWeek(null);
                            }}
                          />
                        ) : (
                          <button
                            type="button"
                            className="vac-add-link"
                            onClick={() => {
                              setAddingWeek(week.weekOf);
                              setEditingWeek(null);
                            }}
                          >
                            + Add
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
