import { useEffect, useState } from "react";
import { useDispatchTallies } from "../store/DispatchTalliesContext";

function TallyChip({
  label,
  value,
  sub,
  onSet,
  onStepDown,
  onStepUp,
}: {
  label: string;
  value: number;
  sub?: string;
  onSet: (n: number) => void;
  onStepDown: () => void;
  onStepUp: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  const commit = () => {
    const n = Number(draft);
    if (Number.isFinite(n) && n >= 0) onSet(Math.floor(n));
    else setDraft(String(value));
    setEditing(false);
  };

  return (
    <div className="tally-chip">
      <span className="tally-chip-label">{label}</span>
      <div className="tally-chip-main">
        <button
          type="button"
          className="tally-step"
          onClick={onStepDown}
          aria-label={`Subtract one from ${label}`}
        >
          −
        </button>
        {editing ? (
          <input
            className="tally-chip-input"
            type="number"
            inputMode="numeric"
            min={0}
            value={draft}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                setDraft(String(value));
                setEditing(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="tally-chip-value"
            onClick={() => setEditing(true)}
            aria-label={`Set ${label}`}
          >
            {value}
          </button>
        )}
        <button
          type="button"
          className="tally-step"
          onClick={onStepUp}
          aria-label={`Add one to ${label}`}
        >
          +
        </button>
      </div>
      {sub ? <span className="tally-chip-sub">{sub}</span> : null}
    </div>
  );
}

export function DispatchTalliesRow({
  date,
  bataviaDispatchedToday,
  evanstonDispatchedToday,
}: {
  date: string;
  bataviaDispatchedToday: number;
  evanstonDispatchedToday: number;
}) {
  const { talliesOn, setBataviaPreload, decrementBataviaPreload, setEvanstonAsking } =
    useDispatchTallies();
  const tallies = talliesOn(date);

  return (
    <div className="tally-chip-row">
      <TallyChip
        label="Batavia Preloads"
        value={tallies.bataviaPreload}
        sub={`${bataviaDispatchedToday} dispatched today`}
        onSet={(n) => void setBataviaPreload(date, n)}
        onStepDown={() => void decrementBataviaPreload(date)}
        onStepUp={() => void setBataviaPreload(date, tallies.bataviaPreload + 1)}
      />
      <TallyChip
        label="Evanston Asking"
        value={tallies.evanstonAsking}
        sub={`${evanstonDispatchedToday} dispatched today`}
        onSet={(n) => void setEvanstonAsking(date, n)}
        onStepDown={() => void setEvanstonAsking(date, Math.max(0, tallies.evanstonAsking - 1))}
        onStepUp={() => void setEvanstonAsking(date, tallies.evanstonAsking + 1)}
      />
    </div>
  );
}
