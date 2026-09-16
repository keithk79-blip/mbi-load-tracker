import { useState } from "react";
import type { DailyEodInput, DailyEodTotals } from "../lib/dailyEod";
import {
  dispatchBoardToEodInput,
  extractSpreadsheetId,
  readDispatchBoardUrl,
  writeDispatchBoardUrl,
} from "../lib/dispatchBoard";
import { fetchDispatchBoardTotals } from "../lib/dispatchBoardClient";

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
  const [boardUrl, setBoardUrl] = useState(readDispatchBoardUrl);
  const [trash, setTrash] = useState(asField(existing?.trash ?? null));
  const [leachate, setLeachate] = useState(asField(existing?.leachate ?? null));
  const [walkingFloor, setWalkingFloor] = useState(
    asField(existing?.walkingFloor ?? null),
  );
  const [subs, setSubs] = useState(asField(existing?.subs ?? null));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pulling, setPulling] = useState(false);

  const nextTrash = parseField(trash);
  const nextLeachate = parseField(leachate);
  const nextWalking = parseField(walkingFloor);
  const nextSubs = parseField(subs);
  const totalLoads =
    nextTrash !== null && nextLeachate !== null && nextWalking !== null
      ? nextTrash + nextLeachate + nextWalking
      : null;

  const saveValues = async (input: DailyEodInput) => {
    setSaving(true);
    setError(null);
    const message = await onSave(input);
    setSaving(false);
    if (message) {
      setError(message);
      return false;
    }
    setOpen(false);
    return true;
  };

  const save = async () => {
    if (
      nextTrash === null ||
      nextLeachate === null ||
      nextWalking === null ||
      totalLoads === null ||
      nextSubs === null
    ) {
      setError("Enter MSW, tank, walking-floor, and subs from the Loads footer.");
      return;
    }
    await saveValues({
      date,
      trash: nextTrash,
      leachate: nextLeachate,
      walkingFloor: nextWalking,
      loads: totalLoads,
      subs: nextSubs,
      source: "sheet-import",
    });
  };

  const pullBoard = async () => {
    const url = boardUrl.trim();
    if (!extractSpreadsheetId(url)) {
      setError("Paste today’s Dispatch Board Google Sheets link.");
      setOpen(true);
      return;
    }
    writeDispatchBoardUrl(url);
    setPulling(true);
    setError(null);
    try {
      const totals = await fetchDispatchBoardTotals(url);
      if (totals.date && totals.date !== date) {
        setError(
          `That board is ${totals.date}. Switch the day picker to that date, or paste that day’s board.`,
        );
        setOpen(true);
        return;
      }
      setTrash(String(totals.trash));
      setLeachate(String(totals.leachate));
      setWalkingFloor(String(totals.walkingFloor));
      setSubs(String(totals.subs));
      setOpen(true);
      await saveValues(dispatchBoardToEodInput(date, totals));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setOpen(true);
    } finally {
      setPulling(false);
    }
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
          {existing ? "Edit sheet totals" : "Enter sheet totals"}
        </button>
        <button
          type="button"
          className="sheet-totals-toggle"
          onClick={() => void pullBoard()}
          disabled={pulling || saving}
        >
          {pulling ? "Pulling board…" : "Pull Dispatch Board"}
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
            Loads tab footer: Total MSW + Tank + Walking-Floor = Total Loads.
            Pull the board to match that total. Does not create truck rows.
          </p>
          <label className="sheet-totals-field sheet-totals-url">
            <span>Dispatch Board link</span>
            <input
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={boardUrl}
              placeholder="https://docs.google.com/spreadsheets/d/…"
              onChange={(event) => setBoardUrl(event.target.value)}
            />
          </label>
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
              {saving ? "Saving…" : "Save sheet totals"}
            </button>
          </div>
        </form>
      ) : error ? (
        <p className="sheet-totals-error">{error}</p>
      ) : null}
    </div>
  );
}
