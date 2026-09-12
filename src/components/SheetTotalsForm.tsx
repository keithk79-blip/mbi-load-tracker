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
  const [loads, setLoads] = useState(asField(existing?.loads ?? null));
  const [subs, setSubs] = useState(asField(existing?.subs ?? null));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const nextTrash = parseField(trash);
    const nextLeachate = parseField(leachate);
    const nextWalking = parseField(walkingFloor);
    const nextLoads = parseField(loads);
    const nextSubs = parseField(subs);
    if (
      nextTrash === null ||
      nextLeachate === null ||
      nextWalking === null ||
      nextLoads === null ||
      nextSubs === null
    ) {
      setError("Enter five non-negative whole numbers from the Dispatch Board footer.");
      return;
    }
    setSaving(true);
    setError(null);
    const message = await onSave({
      date,
      trash: nextTrash,
      leachate: nextLeachate,
      walkingFloor: nextWalking,
      loads: nextLoads,
      subs: nextSubs,
      source: "sheet-import",
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
      <button
        type="button"
        className="sheet-totals-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {existing ? "Edit sheet totals" : "Enter sheet totals"}
      </button>
      {open ? (
        <form
          className="sheet-totals-fields"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <p className="sheet-totals-hint">
            Dispatch Board Loads footer — MSW + Tank + Walking-Floor = Total
            Loads. Subs is separate. Saves these five numbers only. Does not
            create truck rows.
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
              value={loads}
              onChange={(event) => setLoads(event.target.value)}
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
              {saving ? "Saving…" : "Save sheet totals"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
