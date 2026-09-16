import { useState } from "react";
import type { DailyEodInput, DailyEodTotals } from "../lib/dailyEod";

type SheetTotalsFormProps = {
  date: string;
  existing: DailyEodTotals | null;
  onSave: (input: DailyEodInput) => Promise<string | null>;
};

function asField(value: number | null): string {
  return value === null ? "" : String(value);
}

function parseField(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

export function SheetTotalsForm({ date, existing, onSave }: SheetTotalsFormProps) {
  const [open, setOpen] = useState(false);
  const [trash, setTrash] = useState(asField(existing?.trash ?? null));
  const [leachate, setLeachate] = useState(asField(existing?.leachate ?? null));
  const [walkingFloor, setWalkingFloor] = useState(
    asField(existing?.walkingFloor ?? null),
  );
  const [subs, setSubs] = useState(asField(existing?.subs ?? null));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const nextTrash = parseField(trash);
  const nextLeachate = parseField(leachate);
  const nextWalking = parseField(walkingFloor);
  const nextSubs = parseField(subs);
  const totalLoads =
    nextTrash !== null && nextLeachate !== null && nextWalking !== null
      ? nextTrash + nextLeachate + nextWalking
      : null;

  const save = async () => {
    if (
      nextTrash === null ||
      nextLeachate === null ||
      nextWalking === null ||
      totalLoads === null ||
      nextSubs === null
    ) {
      setError("Enter MSW, tank, walking-floor, and subs.");
      return;
    }
    setSaving(true);
    setError(null);
    const message = await onSave({
      date,
      trash: nextTrash,
      leachate: nextLeachate,
      walkingFloor: nextWalking,
      loads: totalLoads,
      subs: nextSubs,
      source: "manual",
    });
    setSaving(false);
    if (message) {
      setError(message);
      return;
    }
    setOpen(false);
  };

  return (
    <div className="sheet-totals-form">
      <div className="sheet-totals-toolbar">
        <button
          type="button"
          className="sheet-totals-toggle"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {existing ? "Edit day totals" : "Enter day totals"}
        </button>
      </div>
      {open ? (
        <form
          className="sheet-totals-fields"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <p className="sheet-totals-hint">
            Loads footer: Total MSW + Tank + Walking-Floor = Total Loads.
            Type the four counts. Does not create truck rows.
          </p>
          <label className="sheet-totals-field">
            <span>Total MSW</span>
            <input
              inputMode="numeric"
              type="number"
              min={0}
              step={1}
              value={trash}
              onChange={(event) => setTrash(event.target.value)}
            />
          </label>
          <label className="sheet-totals-field">
            <span>Tank loads</span>
            <input
              inputMode="numeric"
              type="number"
              min={0}
              step={1}
              value={leachate}
              onChange={(event) => setLeachate(event.target.value)}
            />
          </label>
          <label className="sheet-totals-field">
            <span>Walking-floor</span>
            <input
              inputMode="numeric"
              type="number"
              min={0}
              step={1}
              value={walkingFloor}
              onChange={(event) => setWalkingFloor(event.target.value)}
            />
          </label>
          <label className="sheet-totals-field">
            <span>Total loads</span>
            <input
              inputMode="numeric"
              type="number"
              min={0}
              step={1}
              value={totalLoads === null ? "" : String(totalLoads)}
              readOnly
              tabIndex={-1}
            />
          </label>
          <label className="sheet-totals-field">
            <span>Sub loads</span>
            <input
              inputMode="numeric"
              type="number"
              min={0}
              step={1}
              value={subs}
              onChange={(event) => setSubs(event.target.value)}
            />
          </label>
          {error ? <p className="sheet-totals-error">{error}</p> : null}
          <div className="sheet-totals-actions">
            <button type="submit" className="btn-primary sheet-totals-save" disabled={saving}>
              {saving ? "Saving…" : "Save day totals"}
            </button>
          </div>
        </form>
      ) : error ? (
        <p className="sheet-totals-error">{error}</p>
      ) : null}
    </div>
  );
}
