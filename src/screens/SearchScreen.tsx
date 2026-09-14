import { useMemo, useState } from "react";
import { BrandMark } from "../components/BrandMark";
import { DayPicker } from "../components/DayPicker";
import { LoadRow } from "../components/LoadRow";
import { TruckEntry } from "../components/TruckEntry";
import { chicagoToday, formatShortDate } from "../lib/chicagoDate";
import { loggedDriverNamesForTruck } from "../lib/loadDriver";
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
  const [digits, setDigits] = useState("");
  const [nameQuery, setNameQuery] = useState("");
  const [truck, setTruck] = useState<string | null>(null);
  const [date, setDate] = useState(today);
  const [showPad, setShowPad] = useState(true);

  const dayLoads = useMemo(() => loadsOn(date), [date, loadsOn]);

  const nameHits = useMemo(() => {
    const needle = nameQuery.trim().toLowerCase();
    if (!needle) return [];
    return dayLoads.filter((load) => (load.driverName ?? "").toLowerCase().includes(needle));
  }, [dayLoads, nameQuery]);

  const loads = useMemo(() => {
    if (!truck) return [];
    return dayLoads.filter((load) => load.truck === truck);
  }, [dayLoads, truck]);
  const loggedDrivers = useMemo(
    () => (truck ? loggedDriverNamesForTruck(loads, truck) : []),
    [loads, truck],
  );

  const find = () => {
    if (!digits) return;
    setTruck(digits);
    setNameQuery("");
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
          <label className="field">
            <div className="field-label">Search by driver</div>
            <input
              className="text-input"
              value={nameQuery}
              autoComplete="off"
              placeholder="Type a driver name"
              aria-label="Search loads by driver name"
              onChange={(e) => {
                setNameQuery(e.target.value);
                setTruck(null);
              }}
            />
          </label>

          {nameQuery.trim() ? (
            nameHits.length === 0 ? (
              <div className="empty compact">
                <h2>No loads for that name</h2>
                <p>
                  Nothing on {formatShortDate(date)} matches “{nameQuery.trim()}”.
                  Check the day or the spelling.
                </p>
              </div>
            ) : (
              <>
                <p className="field-hint">
                  {nameHits.length} {nameHits.length === 1 ? "load" : "loads"} ·{" "}
                  {formatShortDate(date)}
                </p>
                <DayPicker date={date} onChange={setDate} />
                <div className="feed">
                  {nameHits.map((load) => (
                    <LoadRow
                      key={load.id}
                      load={load}
                      onEdit={() => onEdit(load.id)}
                      highlight={load.id === editingId ? "editing" : null}
                    />
                  ))}
                </div>
              </>
            )
          ) : (
            <TruckEntry
              value={digits}
              onChange={setDigits}
              onSubmit={find}
              submitLabel="Find"
              autoFocus
              hint="Type a truck number or broker code."
            />
          )}
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
              {loggedDrivers.length ? (
                <p className="truck-roster-driver">
                  Logged · {loggedDrivers.join(" · ")}
                </p>
              ) : null}
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
