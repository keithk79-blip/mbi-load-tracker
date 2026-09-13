import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import {
  formComplete,
  LoadForm,
  type FormState,
} from "../components/LoadForm";
import { BrandMark } from "../components/BrandMark";
import { QuantityStepper } from "../components/QuantityStepper";
import { TruckEntry } from "../components/TruckEntry";
import { pickupLabel } from "../lib/cascade";
import { chicagoToday, formatCreatedStamp } from "../lib/chicagoDate";
import { findNearDuplicate } from "../lib/duplicates";
import { batchCreatedAt, clampLoadQty } from "../lib/quantity";
import { resolveSpecialtyBoardMatch } from "../lib/specialtyBoard";
import { useSpecialty } from "../store/SpecialtyContext";
import { snapshotDriverNameForTruck } from "../lib/loadDriver";
import { newLoadId } from "../lib/storage";
import { useDriverRoster } from "../store/DriverRosterContext";
import { useLoads } from "../store/LoadsContext";
import type { Load } from "../types";

type LogLoadScreenProps = {
  initialTruck?: string;
  date?: string;
  onCancel: () => void;
  onSaved: (id: string, date: string) => void;
};

export function LogLoadScreen({
  initialTruck = "",
  date,
  onCancel,
  onSaved,
}: LogLoadScreenProps) {
  const targetDate = date || chicagoToday();
  const { saveLoad, loads } = useLoads();
  const { store: rosterStore } = useDriverRoster();
  const { opensFor, consumeOpens } = useSpecialty();
  const [duplicate, setDuplicate] = useState<Load | null>(null);
  const [specialtyWarn, setSpecialtyWarn] = useState<{
    opens: number;
    stationId: string;
    destination: string;
    pickup: string;
  } | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [truck, setTruck] = useState(initialTruck);
  const [step, setStep] = useState<"truck" | "form">(
    initialTruck ? "form" : "truck",
  );
  const [form, setForm] = useState<FormState>({
    truck: initialTruck,
    stationId: "",
    pickup: "",
    commodity: "",
    destination: "",
  });

  const qty = clampLoadQty(quantity);
  const loggingDriverName = snapshotDriverNameForTruck(rosterStore, form.truck);

  const commitTruck = (nextTruck: string) => {
    setTruck(nextTruck);
    setForm((prev) => ({ ...prev, truck: nextTruck }));
    setStep("form");
  };

  const finishSave = async () => {
    const now = new Date().toISOString();
    const pickup = pickupLabel(form.stationId, form.pickup);
    const destination = form.destination.trim();
    const candidate = {
      truck: form.truck.trim(),
      pickup,
      commodity: form.commodity.trim(),
      destination,
      createdAt: now,
    };

    let lastId = "";
    for (let i = 0; i < qty; i++) {
      const createdAt = batchCreatedAt(now, i);
      const id = newLoadId();
      lastId = id;
      saveLoad({
        id,
        ...candidate,
        createdAt,
        stationId: form.stationId,
        date: targetDate,
        updatedAt: createdAt,
        driverName: snapshotDriverNameForTruck(rosterStore, candidate.truck),
      });
    }

    const lane = resolveSpecialtyBoardMatch(
      form.stationId,
      pickup,
      destination,
      form.commodity,
    );
    if (lane) {
      await consumeOpens(targetDate, lane.specialtyId, lane.chips, qty);
    }

    setDuplicate(null);
    setSpecialtyWarn(null);
    onSaved(lastId, targetDate);
  };

  const commit = (opts?: {
    forceDuplicate?: boolean;
    forceSpecialty?: boolean;
  }) => {
    if (!formComplete(form)) return;
    const forceDuplicate = opts?.forceDuplicate ?? false;
    const forceSpecialty = opts?.forceSpecialty ?? false;
    const now = new Date().toISOString();
    const pickup = pickupLabel(form.stationId, form.pickup);
    const destination = form.destination.trim();

    if (!forceDuplicate) {
      const match = findNearDuplicate(loads, {
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

    const lane = resolveSpecialtyBoardMatch(
      form.stationId,
      pickup,
      destination,
      form.commodity,
    );
    if (!forceSpecialty && lane) {
      const opens = opensFor(targetDate, lane.specialtyId, lane.chips);
      if (opens < qty) {
        setDuplicate(null);
        setSpecialtyWarn({
          opens,
          stationId: lane.specialtyId,
          destination: lane.chip,
          pickup,
        });
        return;
      }
    }

    void finishSave();
  };

  if (step === "truck") {
    return (
      <div className="screen overlay-screen">
        <header className="overlay-header">
          <button type="button" className="icon-btn" onClick={onCancel} aria-label="Back">
            <ArrowLeft size={22} />
          </button>
          <BrandMark size="sm" />
          <div>
            <p className="eyebrow">New load</p>
            <h1 className="overlay-title">Truck</h1>
          </div>
        </header>
        <TruckEntry
          value={truck}
          onChange={setTruck}
          onSubmit={() => truck && commitTruck(truck)}
          submitLabel="Next"
          autoFocus
          hint="Type the unit number or broker code, or use the pad."
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
          <p className="eyebrow">
            Truck {form.truck}
            {loggingDriverName ? ` · ${loggingDriverName}` : ""}
          </p>
          <h1 className="overlay-title">Log load</h1>
          <p className="overlay-sub">
            {targetDate === chicagoToday() ? "Today" : targetDate}
          </p>
        </div>
      </header>

      <LoadForm
        value={form}
        onChange={setForm}
        onChangeTruck={() => setStep("truck")}
      />

      {duplicate ? (
        <div className="delete-confirm warn-confirm">
          <p>
            Truck {duplicate.truck} already has this same pickup, commodity, and
            destination logged {formatCreatedStamp(duplicate.createdAt) || "just now"}
            {duplicate.displayName ? ` by ${duplicate.displayName}` : ""}. This
            can double-count a dispatch.
            {qty > 1 ? ` Save anyway will still add ${qty} loads.` : ""}
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
      ) : null}

      {specialtyWarn ? (
        <div className="delete-confirm warn-confirm">
          <p className="specialty-warn-title">No Available Loads</p>
          <p>
            {specialtyWarn.opens === 0
              ? `No specialty opens for ${specialtyWarn.pickup} → ${specialtyWarn.destination} on this day.`
              : `Only ${specialtyWarn.opens} specialty open${specialtyWarn.opens === 1 ? "" : "s"} for ${specialtyWarn.pickup} → ${specialtyWarn.destination}, but you are logging ${qty}.`}{" "}
            Add {qty === 1 ? "this load" : `these ${qty} loads`} to the daily tally
            anyway?
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
      ) : null}

      <div className="overlay-footer overlay-footer-stack">
        <QuantityStepper value={qty} onChange={setQuantity} />
        <div className="overlay-footer-actions">
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary grow"
            disabled={!formComplete(form)}
            onClick={() => commit()}
          >
            {qty === 1 ? "Save" : `Save ${qty} loads`}
          </button>
        </div>
      </div>
    </div>
  );
}
