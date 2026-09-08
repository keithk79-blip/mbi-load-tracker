import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import {
  formComplete,
  LoadForm,
  routeLine,
  sameForm,
  type FormState,
} from "../components/LoadForm";
import { BrandMark } from "../components/BrandMark";
import { TruckEntry } from "../components/TruckEntry";
import { pickupLabel } from "../lib/cascade";
import {
  formatCreatedStamp,
  formatHeaderDate,
  isValidISODate,
} from "../lib/chicagoDate";
import { findNearDuplicate } from "../lib/duplicates";
import { resolveSpecialtyBoardLane } from "../lib/specialtyBoard";
import { useSpecialty } from "../store/SpecialtyContext";
import { useLoads } from "../store/LoadsContext";
import type { Load } from "../types";

type EditLoadScreenProps = {
  load: Load;
  onCancel: () => void;
  onSaved: (id: string, date?: string) => void;
  onDeleted: () => void;
};

function loadToForm(load: Load): FormState {
  return {
    truck: load.truck,
    stationId: load.stationId,
    pickup: load.pickup,
    commodity: load.commodity,
    destination: load.destination,
  };
}

export function EditLoadScreen({
  load,
  onCancel,
  onSaved,
  onDeleted,
}: EditLoadScreenProps) {
  const { saveLoad, deleteLoad, loads } = useLoads();
  const { opensFor, consumeOpens } = useSpecialty();
  const original = useMemo(() => loadToForm(load), [load]);
  const [form, setForm] = useState<FormState>(original);
  const [date, setDate] = useState(load.date);
  const [pickingDate, setPickingDate] = useState(false);
  const [changingTruck, setChangingTruck] = useState(false);
  const [truckDigits, setTruckDigits] = useState(form.truck);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [duplicate, setDuplicate] = useState<Load | null>(null);
  const [specialtyWarn, setSpecialtyWarn] = useState<{
    opens: number;
    pickup: string;
    destination: string;
    specialtyId: string;
  } | null>(null);

  const dirty = !sameForm(form, original) || date !== load.date;
  const canSave = formComplete(form) && dirty;

  const finishSave = () => {
    const pickup = pickupLabel(form.stationId, form.pickup);
    const destination = form.destination.trim();
    const now = new Date().toISOString();
    saveLoad({
      ...load,
      truck: form.truck.trim(),
      pickup,
      commodity: form.commodity.trim(),
      destination,
      stationId: form.stationId,
      date,
      updatedAt: now,
      seeded: false,
    });

    const specialtyId = resolveSpecialtyBoardLane(
      form.stationId,
      pickup,
      destination,
      form.commodity,
    );
    const routeChanged =
      load.stationId !== form.stationId ||
      load.destination.trim().toLowerCase() !== destination.toLowerCase() ||
      load.date !== date ||
      load.pickup.trim().toLowerCase() !== pickup.toLowerCase() ||
      load.commodity.trim().toLowerCase() !== form.commodity.trim().toLowerCase();

    if (specialtyId && routeChanged) {
      void consumeOpens(date, specialtyId, destination, 1);
    }

    setDuplicate(null);
    setSpecialtyWarn(null);
    onSaved(load.id, date);
  };

  const commit = (opts?: { forceDuplicate?: boolean; forceSpecialty?: boolean }) => {
    if (!canSave) return;
    const forceDuplicate = opts?.forceDuplicate ?? false;
    const forceSpecialty = opts?.forceSpecialty ?? false;
    const pickup = pickupLabel(form.stationId, form.pickup);
    const destination = form.destination.trim();
    const now = new Date().toISOString();

    if (!forceDuplicate) {
      const match = findNearDuplicate(loads, {
        id: load.id,
        truck: form.truck.trim(),
        pickup,
        commodity: form.commodity.trim(),
        destination,
        createdAt: now,
      });
      if (match) {
        setSpecialtyWarn(null);
        setDuplicate(match);
        return;
      }
    }

    const specialtyId = resolveSpecialtyBoardLane(
      form.stationId,
      pickup,
      destination,
      form.commodity,
    );
    const routeChanged =
      load.stationId !== form.stationId ||
      load.destination.trim().toLowerCase() !== destination.toLowerCase() ||
      load.date !== date ||
      load.pickup.trim().toLowerCase() !== pickup.toLowerCase() ||
      load.commodity.trim().toLowerCase() !== form.commodity.trim().toLowerCase();

    if (!forceSpecialty && specialtyId && routeChanged) {
      const opens = opensFor(date, specialtyId, destination);
      if (opens < 1) {
        setDuplicate(null);
        setSpecialtyWarn({ opens, pickup, destination, specialtyId });
        return;
      }
    }

    finishSave();
  };

  if (changingTruck) {
    return (
      <div className="screen overlay-screen">
        <header className="overlay-header">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setChangingTruck(false)}
            aria-label="Back"
          >
            <ArrowLeft size={22} />
          </button>
          <BrandMark size="sm" />
          <div>
            <p className="eyebrow">Edit load</p>
            <h1 className="overlay-title">Change truck</h1>
          </div>
        </header>
        <TruckEntry
          value={truckDigits}
          onChange={setTruckDigits}
          onSubmit={() => {
            if (!truckDigits) return;
            setForm((prev) => ({ ...prev, truck: truckDigits }));
            setChangingTruck(false);
          }}
          submitLabel="Use"
          autoFocus
          hint="Type the new unit number or broker code, or use the pad."
        />
      </div>
    );
  }

  return (
    <div className="screen overlay-screen">
      <header className="overlay-header">
        <button type="button" className="icon-btn" onClick={onCancel} aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <BrandMark size="sm" />
        <div>
          <p className="eyebrow">Truck {form.truck}</p>
          <h1 className="overlay-title">Edit load</h1>
          {pickingDate ? (
            <input
              type="date"
              className="overlay-date-input"
              value={date}
              aria-label="Load date"
              onChange={(e) => {
                const next = e.target.value;
                if (isValidISODate(next)) setDate(next);
              }}
              onBlur={() => setPickingDate(false)}
              autoFocus
            />
          ) : (
            <button
              type="button"
              className="overlay-sub overlay-sub-btn"
              onClick={() => setPickingDate(true)}
              title="Change date"
            >
              Logged {formatHeaderDate(date)}
              {load.createdAt !== load.updatedAt ? " · previously edited" : ""}
            </button>
          )}
        </div>
      </header>

      {dirty ? (
        <div className="change-card">
          {date !== load.date ? (
            <p>
              <span className="change-label">Day:</span>{" "}
              <s>{formatHeaderDate(load.date)}</s>
              {" → "}
              {formatHeaderDate(date)}
            </p>
          ) : null}
          {!sameForm(form, original) ? (
            <>
              <p>
                <span className="change-label">Was:</span>{" "}
                <s>{routeLine(original)}</s>
              </p>
              <p className="change-now">
                <span className="change-label">Now:</span> {routeLine(form)}
              </p>
            </>
          ) : null}
        </div>
      ) : null}

      <LoadForm
        value={form}
        onChange={setForm}
        original={original}
        onChangeTruck={() => {
          setTruckDigits(form.truck);
          setChangingTruck(true);
        }}
      />

      {confirmDelete ? (
        <div className="delete-confirm">
          <p>Delete this load? Totals drop it immediately. This cannot be undone.</p>
          <div className="overlay-footer tight">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setConfirmDelete(false)}
            >
              Keep
            </button>
            <button
              type="button"
              className="btn-danger grow"
              onClick={() => {
                deleteLoad(load.id);
                onDeleted();
              }}
            >
              Delete load
            </button>
          </div>
        </div>
      ) : duplicate ? (
        <div className="delete-confirm warn-confirm">
          <p>
            Truck {duplicate.truck} already has this same pickup, commodity, and
            destination logged {formatCreatedStamp(duplicate.createdAt) || "just now"}
            {duplicate.displayName ? ` by ${duplicate.displayName}` : ""}. This
            can double-count a dispatch.
          </p>
          <div className="overlay-footer">
            <button type="button" className="btn-ghost" onClick={() => setDuplicate(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary grow"
              onClick={() => commit({ forceDuplicate: true })}
            >
              Save anyway
            </button>
          </div>
        </div>
      ) : specialtyWarn ? (
        <div className="delete-confirm warn-confirm">
          <p className="specialty-warn-title">No Available Loads</p>
          <p>
            No specialty opens for {specialtyWarn.pickup} → {specialtyWarn.destination}{" "}
            on this day. Save this edit to the daily tally anyway?
          </p>
          <div className="overlay-footer">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setSpecialtyWarn(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary grow"
              onClick={() =>
                commit({ forceDuplicate: true, forceSpecialty: true })
              }
            >
              Save anyway
            </button>
          </div>
        </div>
      ) : (
        <div className="overlay-footer">
          <button
            type="button"
            className="text-btn danger"
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </button>
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary grow"
            disabled={!canSave}
            onClick={() => commit()}
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}
