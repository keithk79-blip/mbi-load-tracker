import { useEffect, useMemo, useState } from "react";
import { BrandMark } from "../components/BrandMark";
import { CollapsibleRank } from "../components/CollapsibleRank";
import { DayPicker } from "../components/DayPicker";
import { LoadRow } from "../components/LoadRow";
import { dailyCounts } from "../lib/analytics";
import {
  chicagoToday,
  formatHeaderDate,
  formatShortDate,
  weekStartingMonday,
} from "../lib/chicagoDate";
import {
  boardForDate,
  fetchStationCallStoreFromCloud,
  mergeStationCallStores,
  readStationCallStore,
  subscribeStationCallStore,
  writeStationCallStore,
} from "../lib/stationCalls";
import {
  endOfDayCards,
  endOfDaySummary,
  filterCaption,
  filterLoads,
  rankCommodities,
  rankDestinations,
  rankPickups,
  type TotalsFilter,
} from "../lib/totals";
import { useAuth } from "../store/AuthContext";
import { useDrivers } from "../store/DriversContext";
import { useLoads } from "../store/LoadsContext";

type TotalsScreenProps = {
  date: string;
  onDateChange: (iso: string) => void;
  onEdit: (id: string) => void;
  onLog: (date: string) => void;
  embedded?: boolean;
};

function useStationCallBoard(date: string) {
  const { configured, session } = useAuth();
  const cloud = configured && !!session;
  const [store, setStore] = useState(readStationCallStore);

  useEffect(() => subscribeStationCallStore(() => setStore(readStationCallStore())), []);

  useEffect(() => {
    if (!cloud) return;
    let alive = true;
    void fetchStationCallStoreFromCloud().then((remote) => {
      if (!alive || !remote) return;
      const merged = mergeStationCallStores(readStationCallStore(), remote);
      writeStationCallStore(merged);
    });
    return () => {
      alive = false;
    };
  }, [cloud]);

  return boardForDate(store, date);
}

export function TotalsScreen({
  date,
  onDateChange,
  onEdit,
  onLog,
  embedded = false,
}: TotalsScreenProps) {
  const today = chicagoToday();
  const { loads, loadsOn, exportCsv, hasSampleLoads, clearSampleLoads } = useLoads();
  const { availabilityOn } = useDrivers();
  const [filter, setFilter] = useState<TotalsFilter | null>(null);
  const board = useStationCallBoard(date);

  const dayLoads = loadsOn(date);
  const countByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of dailyCounts(loads, weekStartingMonday(date))) {
      map.set(row.date, row.count);
    }
    return map;
  }, [loads, date]);

  const byPickup = useMemo(() => rankPickups(dayLoads), [dayLoads]);
  const byDestination = useMemo(() => rankDestinations(dayLoads), [dayLoads]);
  const byCommodity = useMemo(() => rankCommodities(dayLoads), [dayLoads]);
  const eod = useMemo(() => endOfDaySummary(dayLoads, board), [dayLoads, board]);

  const matching = filter ? filterLoads(dayLoads, filter) : [];
  const dayPhrase = date === today ? "today" : `on ${formatShortDate(date)}`;

  const toggle = (next: TotalsFilter) => {
    setFilter((prev) =>
      prev && prev.kind === next.kind && prev.key === next.key ? null : next,
    );
  };

  const changeDate = (iso: string) => {
    onDateChange(iso);
    setFilter(null);
  };

  return (
    <div className={embedded ? "screen screen-panel" : "screen"}>
      <header className="page-header">
        <div className="page-header-brand">
          {!embedded ? <BrandMark /> : null}
          <div>
            <p className="eyebrow">Day totals</p>
            <h1 className="page-title">{formatHeaderDate(date)}</h1>
          </div>
        </div>
        {!embedded ? (
          <button
            type="button"
            className="text-btn amber"
            onClick={() => exportCsv(date)}
            disabled={dayLoads.length === 0}
          >
            Export CSV
          </button>
        ) : null}
      </header>

      <DayPicker
        date={date}
        onChange={changeDate}
        loadCountFor={(iso) => countByDate.get(iso) ?? 0}
        driverCountFor={(iso) => availabilityOn(iso)?.available ?? null}
      />

      <section className="eod-block">
        <h2 className="section-title">End of day</h2>
        <p className="eod-sub">
          {formatHeaderDate(date)} · trash, leachate, walking-floor, overall, SUBS, pickups, and Close left
        </p>
        <div className="eod-stat-row">
          {endOfDayCards(eod).map((card) => (
            <article
              key={card.key}
              className={card.emphasis ? "eod-stat eod-stat-loads" : "eod-stat"}
            >
              <span className="eod-stat-label">{card.label}</span>
              <span className="eod-stat-value">{card.count}</span>
            </article>
          ))}
        </div>
        <div className="eod-table-wrap">
          <table className="eod-table">
            <thead>
              <tr>
                <th>Station</th>
                <th>Picked up</th>
                <th>Left</th>
              </tr>
            </thead>
            <tbody>
              {eod.stations.map((row) => (
                <tr key={row.id}>
                  <th scope="row">{row.label}</th>
                  <td>{row.pickedUp}</td>
                  <td>{row.left === null ? "—" : row.left}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="eod-legend">
          Left is the Close column from Load Count By Hour for this Chicago day.
        </p>
      </section>

      {dayLoads.length === 0 ? (
        <div className="empty compact">
          <h2>No loads {dayPhrase}</h2>
          <p>Log a haul and these rankings fill in live.</p>
          <button type="button" className="btn-primary" onClick={() => onLog(date)}>
            + Log load
          </button>
        </div>
      ) : (
        <>
          <CollapsibleRank
            title="Transfer station"
            hint="Pickup location. Custom sites are tagged. Tap a row to list those loads."
            rows={byPickup}
            filterKind="pickup"
            active={filter}
            onSelect={toggle}
            defaultOpen
            compact
            emptyText="Nothing logged this day."
          />
          <CollapsibleRank
            title="Landfill"
            hint="Delivery / destination. Tap a row to list those loads."
            rows={byDestination}
            filterKind="destination"
            active={filter}
            onSelect={toggle}
            defaultOpen={false}
            compact
            emptyText="Nothing logged this day."
          />
          <CollapsibleRank
            title="Commodity"
            hint="Trash, recycle, yard, wood, leachate, and the rest."
            rows={byCommodity}
            filterKind="commodity"
            active={filter}
            onSelect={toggle}
            defaultOpen={false}
            compact
            emptyText="Nothing logged this day."
          />

          {filter ? (
            <section className="totals-block matching-block">
              <div className="matching-head">
                <h2>{filterCaption(filter)}</h2>
                <button
                  type="button"
                  className="text-btn amber"
                  onClick={() => setFilter(null)}
                >
                  Clear
                </button>
              </div>
              <p className="totals-hint">
                {matching.length} {matching.length === 1 ? "load" : "loads"} · tap
                Edit to change a row. Totals refresh on save.
              </p>
              <div className="feed">
                {matching.map((load) => (
                  <LoadRow
                    key={load.id}
                    load={load}
                    onEdit={() => onEdit(load.id)}
                  />
                ))}
              </div>
            </section>
          ) : (
            <p className="field-hint">Tap a row to list those loads.</p>
          )}

          <button type="button" className="btn-primary" onClick={() => onLog(date)}>
            + Log load
          </button>
        </>
      )}

      {!embedded && hasSampleLoads ? (
        <button
          type="button"
          className="text-btn danger block-btn"
          onClick={clearSampleLoads}
        >
          Clear sample loads
        </button>
      ) : null}
    </div>
  );
}
