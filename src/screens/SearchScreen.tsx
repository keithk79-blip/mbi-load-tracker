import { useMemo, useState } from "react";
import { BrandMark } from "../components/BrandMark";
import { DayPicker } from "../components/DayPicker";
import { LoadRow } from "../components/LoadRow";
import { TruckEntry } from "../components/TruckEntry";
import { chicagoToday, formatShortDate } from "../lib/chicagoDate";
import { fullRosterDriversForTruck } from "../lib/driverRoster";
import { useDriverRoster } from "../store/DriverRosterContext";
import { useLoads } from "../store/LoadsContext";

type SearchScreenProps = {
  editingId?: string | null;
  onEdit: (id: string) => void;
  onLogForTruck: (truck: string, date: string) => void;
};

export function SearchScreen({
  editingId,
  onEdit,
  onLogForTruck,
}: SearchScreenProps) {
  const today = chicagoToday();
  const { loadsOn } = useLoads();
  const { store: rosterStore } = useDriverRoster();
  const [digits, setDigits] = useState("");
  const [truck, setTruck] = useState<string | null>(null);
  const [date, setDate] = useState(today);
  const [showPad, setShowPad] = useState(true);

  const loads = useMemo(() => {
    if (!truck) return [];
    return loadsOn(date).filter((load) => load.truck === truck);
  }, [date, loadsOn, truck]);
  const rosterDrivers = useMemo(
    () => (truck ? fullRosterDriversForTruck(rosterStore, truck) : []),
    [rosterStore, truck],
  );

  const find = () => {
    if (!digits) return;
    setTruck(digits);
    setShowPad(false);
  };

  return (
    <div className="screen search-screen">
      <header className="page-header">
        <div className="page-header-brand">
          <BrandMark />
          <div>
            <p className="eyebrow">Search</p>
            <h1 className="page-title">Trucks</h1>
          </div>
        </div>
      </header>

      {showPad || !truck ? (
        <>
          <TruckEntry
            value={digits}
            onChange={setDigits}
            onSubmit={find}
            submitLabel="Find"
            autoFocus
            hint="Type a truck number or broker code, or use the pad."
          />
        </>
      ) : (
        <button
          type="button"
          className="truck-display compact"
          onClick={() => setShowPad(true)}
        >
          <span className="truck-digits">{truck}</span>
          <span className="tap-hint">Tap to search another unit</span>
        </button>
      )}

      {truck && !showPad ? (
        <>
          <section className="truck-summary">
            <div className="truck-summary-badge">TRUCK {truck}</div>
            <div className="truck-summary-copy">
              <p className="truck-summary-meta">
                {loads.length} {loads.length === 1 ? "load" : "loads"} ·{" "}
                {formatShortDate(date)}
              </p>
              {rosterDrivers.length ? (
                <p className="truck-roster-driver">
                  Full Roster ·{" "}
                  {rosterDrivers
                    .map((entry) =>
                      entry.truckNumber
                        ? `${entry.name} (emp #${entry.truckNumber})`
                        : entry.name,
                    )
                    .join(" · ")}
                </p>
              ) : (
                <p className="truck-roster-driver muted">
                  No Full Roster driver assigned to this truck
                </p>
              )}
            </div>
          </section>

          <DayPicker date={date} onChange={setDate} />

          {loads.length === 0 ? (
            <div className="empty compact">
              <h2>No loads for truck {truck}</h2>
              <p>
                Nothing logged on {formatShortDate(date)}. Log a haul for this
                unit, or pick another day.
              </p>
            </div>
          ) : (
            <div className="feed">
              {loads.map((load) => (
                <LoadRow
                  key={load.id}
                  load={load}
                  onEdit={() => onEdit(load.id)}
                  highlight={load.id === editingId ? "editing" : null}
                />
              ))}
            </div>
          )}

          <button
            type="button"
            className="btn-primary"
            onClick={() => onLogForTruck(truck, date)}
          >
            + Log load for {truck}
          </button>
        </>
      ) : null}
    </div>
  );
}
