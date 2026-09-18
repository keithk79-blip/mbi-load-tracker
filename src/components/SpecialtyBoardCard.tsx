import { useMemo, useState } from "react";
import { ChevronDown, Minus, Plus } from "lucide-react";
import { formatHeaderDate } from "../lib/chicagoDate";
import {
  CUSTOM_SPECIALTY_DEFAULT_NAMES,
  CUSTOM_SPECIALTY_LOAD_TYPES,
  customSpecialtyDisplayName,
  formatCustomSpecialtyChip,
  isCustomSpecialtyId,
  readCustomSpecialtyNameField,
  writeCustomSpecialtyName,
  type CustomSpecialtyId,
  type CustomSpecialtyLoadType,
} from "../lib/customSpecialty";
import {
  SPECIALTY_STATIONS,
  destSummary,
  slotsForStation,
  specialtyDestHint,
  specialtyDestinationsFor,
  type SpecialtyDayBoard,
  type SpecialtyStation,
} from "../lib/specialtyBoard";
import { useSpecialty } from "../store/SpecialtyContext";
import { Chip } from "./Chip";
import "./specialty-board.css";

export function SpecialtyBoardCard({ date }: { date: string }) {
  const { boardOn, addOpen, removeOpen, cloud } = useSpecialty();
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  const board = useMemo(() => boardOn(date), [boardOn, date]);
  const totalOpen = board.length;
  const regularStations = useMemo(
    () => SPECIALTY_STATIONS.filter((station) => !isCustomSpecialtyId(station.id)),
    [],
  );
  const extraStations = useMemo(
    () => SPECIALTY_STATIONS.filter((station) => isCustomSpecialtyId(station.id)),
    [],
  );

  return (
    <article className={`specialty-card${open ? "" : " specialty-card-collapsed"}`}>
      <button
        type="button"
        className="specialty-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="specialty-toggle-copy">
          <span className="specialty-toggle-title">Specialty loads</span>
          <span className="specialty-toggle-meta">
            {totalOpen} open · walking floors · {formatHeaderDate(date)}
            {cloud ? " · synced" : " · this device only"}
            {open ? "" : " · tap to expand"}
          </span>
        </span>
        <ChevronDown
          size={18}
          className={open ? "totals-chevron open" : "totals-chevron"}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="specialty-body">
          <p className="specialty-hint">
            + dest or commodity · − or tap chip to remove
          </p>
          <ul className="specialty-list">
            {regularStations.map((station) => (
              <StationRow
                key={station.id}
                station={station}
                board={board}
                picking={addingFor === station.id}
                onTogglePicker={() =>
                  setAddingFor((prev) => (prev === station.id ? null : station.id))
                }
                onCancelPicker={() => setAddingFor(null)}
                onAdd={(dest) => {
                  void addOpen(date, station.id, dest);
                  setAddingFor(null);
                }}
                onRemove={() => void removeOpen(date, station.id)}
                onRemoveDest={(dest) => void removeOpen(date, station.id, dest)}
              />
            ))}
          </ul>
          <p className="specialty-extra-label">Extra names</p>
          <ul className="specialty-extra-list">
            {extraStations.map((station) => (
              <StationRow
                key={station.id}
                station={station}
                board={board}
                picking={addingFor === station.id}
                onTogglePicker={() =>
                  setAddingFor((prev) => (prev === station.id ? null : station.id))
                }
                onCancelPicker={() => setAddingFor(null)}
                onAdd={(dest) => {
                  void addOpen(date, station.id, dest);
                  setAddingFor(null);
                }}
                onRemove={() => void removeOpen(date, station.id)}
                onRemoveDest={(dest) => void removeOpen(date, station.id, dest)}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

function StationRow({
  station,
  board,
  picking,
  onTogglePicker,
  onCancelPicker,
  onAdd,
  onRemove,
  onRemoveDest,
}: {
  station: SpecialtyStation;
  board: SpecialtyDayBoard;
  picking: boolean;
  onTogglePicker: () => void;
  onCancelPicker: () => void;
  onAdd: (dest: string) => void;
  onRemove: () => void;
  onRemoveDest: (dest: string) => void;
}) {
  const slots = slotsForStation(board, station.id);
  const summary = destSummary(slots);
  const count = slots.length;
  const custom = isCustomSpecialtyId(station.id);
  const label = custom ? customSpecialtyDisplayName(station.id) : station.name;

  return (
    <li
      className={[
        "specialty-row",
        custom ? "is-custom" : "",
        picking ? "is-picking" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={custom ? "specialty-row-main specialty-extra-main" : "specialty-row-main"}>
        {custom ? (
          <CustomSpecialtyNameInput id={station.id as CustomSpecialtyId} />
        ) : (
          <span className="specialty-station">{station.name}</span>
        )}
        {custom ? (
          <div className="specialty-extra-controls">
            <span className={`specialty-count${count ? " has-open" : ""}`}>{count}</span>
            <div className="specialty-stepper">
              <StepperButtons label={label} count={count} onRemove={onRemove} onAdd={onTogglePicker} />
            </div>
          </div>
        ) : (
          <>
            <span className={`specialty-count${count ? " has-open" : ""}`}>{count}</span>
            <div className="specialty-stepper">
              <StepperButtons label={label} count={count} onRemove={onRemove} onAdd={onTogglePicker} />
            </div>
          </>
        )}
      </div>

      {summary.length > 0 ? (
        <div className="specialty-dests">
          {summary.map((row) => (
            <button
              key={row.destination}
              type="button"
              className="specialty-dest-chip"
              title={`Remove one ${row.destination}`}
              onClick={() => onRemoveDest(row.destination)}
            >
              {row.destination}
              {row.count > 1 ? ` x${row.count}` : ""}
            </button>
          ))}
        </div>
      ) : null}

      {picking && custom ? (
        <CustomSpecialtyPicker
          stationId={station.id as CustomSpecialtyId}
          onCancel={onCancelPicker}
          onAdd={onAdd}
        />
      ) : picking ? (
        <div className="specialty-picker">
          <p className="field-hint tight">{specialtyDestHint(station.id)}</p>
          <div className="chip-row">
            {specialtyDestinationsFor(station.id).map((dest) => (
              <Chip key={dest} label={dest} onClick={() => onAdd(dest)} />
            ))}
          </div>
          <button type="button" className="text-btn amber" onClick={onCancelPicker}>
            Cancel
          </button>
        </div>
      ) : null}
    </li>
  );
}

function StepperButtons({
  label,
  count,
  onRemove,
  onAdd,
}: {
  label: string;
  count: number;
  onRemove: () => void;
  onAdd: () => void;
}) {
  return (
    <>
      <button
        type="button"
        className="specialty-btn"
        aria-label={`Remove specialty load at ${label}`}
        disabled={count === 0}
        onClick={onRemove}
      >
        <Minus size={16} strokeWidth={2.6} />
      </button>
      <button
        type="button"
        className="specialty-btn"
        aria-label={`Add specialty load at ${label}`}
        onClick={onAdd}
      >
        <Plus size={16} strokeWidth={2.6} />
      </button>
    </>
  );
}

function CustomSpecialtyNameInput({ id }: { id: CustomSpecialtyId }) {
  const example = CUSTOM_SPECIALTY_DEFAULT_NAMES[id];
  const [value, setValue] = useState(() => readCustomSpecialtyNameField(id));

  return (
    <input
      className="text-input specialty-name-input"
      value={value}
      placeholder={example}
      aria-label={`Pickup name for ${id}`}
      onFocus={(event) => {
        if (value === example) event.currentTarget.select();
      }}
      onChange={(event) => {
        const next = event.target.value;
        setValue(next);
        writeCustomSpecialtyName(id, next);
      }}
      onBlur={() => {
        const next = value.replace(/\s+/g, " ").trim();
        if (next === value) return;
        setValue(next);
        writeCustomSpecialtyName(id, next);
      }}
    />
  );
}

function CustomSpecialtyPicker({
  stationId,
  onCancel,
  onAdd,
}: {
  stationId: CustomSpecialtyId;
  onCancel: () => void;
  onAdd: (chip: string) => void;
}) {
  const [loadType, setLoadType] = useState<CustomSpecialtyLoadType>("Walking-floor");
  const [dest, setDest] = useState("");
  return (
    <form
      className="specialty-picker specialty-extra-picker"
      onSubmit={(event) => {
        event.preventDefault();
        onAdd(formatCustomSpecialtyChip(loadType, dest));
      }}
    >
      <p className="field-hint tight">{specialtyDestHint(stationId)}</p>
      <div className="specialty-type-row">
        {CUSTOM_SPECIALTY_LOAD_TYPES.map((item) => (
          <button
            key={item}
            type="button"
            className={`specialty-type-chip${loadType === item ? " is-selected" : ""}`}
            aria-pressed={loadType === item}
            onClick={() => setLoadType(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <input
        className="text-input specialty-dest-input"
        value={dest}
        onChange={(event) => setDest(event.target.value)}
        placeholder="Delivery destination"
        aria-label="Custom delivery destination"
      />
      <div className="vac-add-actions specialty-picker-actions">
        <button type="submit" className="text-btn amber specialty-add-open">
          Add open
        </button>
        <button type="button" className="text-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
