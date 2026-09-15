import { useMemo, useState } from "react";
import {
  CUSTOM,
  CUSTOM_ID,
  FREQUENT_STATION_IDS,
  STATIONS,
  commoditiesFor,
  destinationsFor,
  getStation,
  sameDestination,
} from "../data/stations";
import { applyPickupCascade, pickupLabel } from "../lib/cascade";
import { rankPickupStations } from "../lib/pickupRank";
import { useLoads } from "../store/LoadsContext";
import { Chip } from "./Chip";

export type FormState = {
  truck: string;
  stationId: string;
  pickup: string;
  commodity: string;
  destination: string;
};

type LoadFormProps = {
  value: FormState;
  onChange: (next: FormState) => void;
  original?: FormState;
  onChangeTruck: () => void;
  driverName?: string | null;
};

export function LoadForm({
  value,
  onChange,
  original,
  onChangeTruck,
  driverName,
}: LoadFormProps) {
  const { loads } = useLoads();
  const rankedStations = useMemo(
    () => rankPickupStations(STATIONS, loads),
    [loads],
  );
  const visibleCount = FREQUENT_STATION_IDS.length;
  const rest = rankedStations.slice(visibleCount);
  const [showAllStations, setShowAllStations] = useState(() => {
    if (!value.stationId || value.stationId === CUSTOM_ID) return false;
    return !rankedStations
      .slice(0, visibleCount)
      .some((station) => station.id === value.stationId);
  });

  const visibleStations = showAllStations
    ? rankedStations
    : rankedStations.slice(0, visibleCount);

  const commodities = commoditiesFor(value.stationId);
  const destinations = destinationsFor(value.stationId, value.commodity);
  const isCustom = value.stationId === CUSTOM_ID;

  const cascadeNote = useMemo(() => {
    if (!value.stationId || isCustom) return null;
    const station = getStation(value.stationId);
    if (!station) return null;
    return `${station.name} commodities refresh when pickup changes.`;
  }, [isCustom, value.stationId]);

  const selectStation = (stationId: string) => {
    const cascaded = applyPickupCascade(
      stationId,
      value.commodity,
      value.destination,
    );
    const pickup =
      stationId === CUSTOM_ID
        ? value.stationId === CUSTOM_ID
          ? value.pickup
          : ""
        : (getStation(stationId)?.name ?? "");
    onChange({
      ...value,
      stationId,
      pickup,
      commodity: cascaded.commodity,
      destination: cascaded.destination,
    });
  };

  const invalidCommodity =
    Boolean(original?.commodity) &&
    original!.commodity !== value.commodity &&
    value.stationId !== CUSTOM_ID &&
    original!.commodity !== "" &&
    !commodities.includes(original!.commodity);

  const invalidDestination =
    Boolean(original?.destination) &&
    original!.destination !== value.destination &&
    value.stationId !== CUSTOM_ID &&
    original!.destination !== "" &&
    !destinations.some((item) => sameDestination(item, original!.destination));

  return (
    <div className="form-stack">
      <section className="field">
        <div className="field-label">Truck #</div>
        <div className="truck-field">
          <div className="truck-value">
            {value.truck || "—"}
            {driverName ? (
              <span className="truck-driver-inline"> · {driverName}</span>
            ) : null}
          </div>
          <button type="button" className="text-btn amber" onClick={onChangeTruck}>
            Change...
          </button>
        </div>
      </section>

      <section className="field">
        <div className="field-label">Pickup</div>
        <div className="chip-row">
          {visibleStations.map((station) => (
            <Chip
              key={station.id}
              label={station.name}
              selected={value.stationId === station.id}
              onClick={() => selectStation(station.id)}
            />
          ))}
          {!showAllStations ? (
            <Chip
              label={`+ ${rest.length} more`}
              muted
              onClick={() => setShowAllStations(true)}
            />
          ) : null}
          <Chip
            label="Custom..."
            selected={isCustom}
            onClick={() => selectStation(CUSTOM_ID)}
          />
        </div>
        {isCustom ? (
          <input
            className="text-input"
            placeholder="e.g. Landfill, yard, customer site"
            value={value.pickup}
            onChange={(e) => onChange({ ...value, pickup: e.target.value })}
            autoComplete="off"
          />
        ) : cascadeNote ? (
          <p className="field-hint">{cascadeNote}</p>
        ) : (
          <p className="field-hint">Pick a transfer station or Custom.</p>
        )}
      </section>

      <section className="field">
        <div className="field-label">Commodity</div>
        {isCustom ? (
          <>
            <div className="chip-row">
              {CUSTOM.exampleCommodities.map((item) => (
                <Chip
                  key={item}
                  label={item}
                  selected={value.commodity === item}
                  onClick={() => onChange({ ...value, commodity: item })}
                />
              ))}
            </div>
            <input
              className="text-input"
              placeholder="Commodity (e.g. Leachate tanker)"
              value={value.commodity}
              onChange={(e) => onChange({ ...value, commodity: e.target.value })}
              autoComplete="off"
            />
          </>
        ) : (
          <div className="chip-row">
            {invalidCommodity ? (
              <Chip label={original!.commodity} invalid />
            ) : null}
            {commodities.map((item) => (
              <Chip
                key={item}
                label={item}
                selected={value.commodity === item}
                muted={!value.stationId}
                onClick={() => {
                  if (!value.stationId) return;
                  const cascaded = applyPickupCascade(
                    value.stationId,
                    item,
                    value.destination,
                  );
                  onChange({
                    ...value,
                    commodity: item,
                    destination: cascaded.destination,
                  });
                }}
              />
            ))}
            {!value.stationId ? (
              <p className="field-hint">Select a pickup first.</p>
            ) : null}
          </div>
        )}
      </section>

      <section className="field">
        <div className="field-label">Destination</div>
        {isCustom ? (
          <>
            <div className="chip-row">
              {CUSTOM.exampleDestinations.map((item) => (
                <Chip
                  key={item}
                  label={item}
                  selected={value.destination === item}
                  onClick={() =>
                    onChange({
                      ...value,
                      destination: item === "Other..." ? "" : item,
                    })
                  }
                />
              ))}
            </div>
            <input
              className="text-input"
              placeholder="Destination (CID, Kankakee, Reworld...)"
              value={value.destination}
              onChange={(e) =>
                onChange({ ...value, destination: e.target.value })
              }
              autoComplete="off"
            />
          </>
        ) : (
          <div className="chip-row">
            {invalidDestination ? (
              <Chip label={original!.destination} invalid />
            ) : null}
            {destinations.map((item) => (
              <Chip
                key={item}
                label={item}
                selected={sameDestination(value.destination, item)}
                muted={!value.stationId}
                onClick={() =>
                  value.stationId && onChange({ ...value, destination: item })
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function formComplete(value: FormState): boolean {
  return Boolean(
    value.truck.trim() &&
      value.stationId &&
      pickupLabel(value.stationId, value.pickup) &&
      value.commodity.trim() &&
      value.destination.trim() &&
      value.destination !== "Other...",
  );
}

export function sameForm(a: FormState, b: FormState): boolean {
  return (
    a.truck === b.truck &&
    a.stationId === b.stationId &&
    a.pickup.trim() === b.pickup.trim() &&
    a.commodity.trim() === b.commodity.trim() &&
    a.destination.trim() === b.destination.trim()
  );
}

export function routeLine(value: FormState): string {
  const pickup = pickupLabel(value.stationId, value.pickup) || "—";
  const dest = value.destination.trim() || "—";
  const commodity = value.commodity.trim() || "—";
  return `${pickup} → ${dest} · ${commodity}`;
}
