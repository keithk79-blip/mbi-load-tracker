import { useEffect, useMemo, useState } from "react";
import { BrandMark } from "../components/BrandMark";
import { CollapsibleRank } from "../components/CollapsibleRank";
import { DayPicker } from "../components/DayPicker";
import { LoadRow } from "../components/LoadRow";
import { SheetTotalsForm } from "../components/SheetTotalsForm";
import { dailyCounts } from "../lib/analytics";
import {
  applyDailyEodToSummary,
  displayLoadCount,
  isSheetEodCard,
} from "../lib/dailyEod";
import {
  chicagoToday,
  formatHeaderDate,
  formatShortDate,
  weekStartingSunday,
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
  rankAccordionLoads,
  rankCommodities,
  rankDestinations,
  rankPickups,
  type TotalsFilter,
} from "../lib/totals";
import { useAuth } from "../store/AuthContext";
import { attachCloudRefresh } from "../lib/cloudRefresh";
import { useDailyEod } from "../store/DailyEodContext";
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
    const pull = () => {
      void fetchStationCallStoreFromCloud().then((remote) => {
        if (!alive || !remote) return;
        const merged = mergeStationCallStores(readStationCallStore(), remote.days);
        writeStationCallStore(merged);
      });
    };
    pull();
    const stop = attachCloudRefresh(pull);
    return () => {
      alive = false;
      stop();
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
  const { totalsOn, upsertTotals } = useDailyEod();
  const { availabilityOn } = useDrivers();
  const [filter, setFilter] = useState<TotalsFilter | null>(null);
  const board = useStationCallBoard(date);
  const snapshot = totalsOn(date);

  const dayLoads = loadsOn(date);
  const countByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of dailyCounts(loads, weekStartingSunday(date))) {
      map.set(row.date, displayLoadCount(row.count, totalsOn(row.date)));
    }
    return map;
  }, [loads, date, totalsOn]);

  const byPickup = useMemo(() => rankPickups(dayLoads), [dayLoads]);
  const byDestination = useMemo(() => rankDestinations(dayLoads), [dayLoads]);
  const byCommodity = useMemo(() => rankCommodities(dayLoads), [dayLoads]);
  const eod = useMemo(
    () => applyDailyEodToSummary(endOfDaySummary(dayLoads, board), snapshot),
    [dayLoads, board, snapshot],
  );

  const matching = filter ? rankAccordionLoads(dayLoads, filter) : [];
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
        <div className="eod-head">
          <h2 className="section-title">End of day</h2>
        </div>
        <div className="eod-stat-row">
          {endOfDayCards(eod).map((card) => {
            const fromSheet = Boolean(snapshot) && isSheetEodCard(card.key);
            return (
              <article
                key={card.key}
                className={[
                  card.emphasis ? "eod-stat eod-stat-loads" : "eod-stat",
                  fromSheet ? "eod-stat-sheet" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className="eod-stat-label">{card.label}</span>
                <span className="eod-stat-value">{card.count}</span>
              </article>
            );
          })}
        </div>
        <SheetTotalsForm
          key={`${date}:${snapshot?.updatedAt ?? "new"}`}
          date={date}
          existing={snapshot}
          onSave={upsertTotals}
        />
        <div className="eod-table-wrap">
          <table className="eod-table">
            <thead>
              <tr>
                <th>Station</th>
                <th>Picked up</th>
                <th>Closed</th>
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
      </section>

      {dayLoads.length === 0 ? (
        <div className="empty compact">
          <h2>No loads {dayPhrase}</h2>
          <p>
            {snapshot
              ? "TRASH / LEACHATE / WF / LOADS / SUBS come from the Dispatch Board sheet. Log a haul if you want truck rows too."
              : "Log a haul and these rankings fill in live."}
          </p>
          <button type="button" className="btn-primary" onClick={() => onLog(date)}>
            + Log load
          </button>
        </div>
      ) : (
        <>
          <CollapsibleRank
            title="Transfer station"
            hint="Pickup location. Custom sites are tagged. Tap a row to expand those loads under it."
            rows={byPickup}
            filterKind="pickup"
            active={filter}
            onSelect={toggle}
            defaultOpen
            compact
            emptyText="Nothing logged this day."
            expandedPanel={
              filter?.kind === "pickup" ? (
                <RankLoadList loads={matching} onEdit={onEdit} />
              ) : null
            }
          />
          <CollapsibleRank
            title="Landfill"
            hint="Delivery / destination. Tap a row to expand those loads under it."
            rows={byDestination}
            filterKind="destination"
            active={filter}
            onSelect={toggle}
            defaultOpen={false}
            compact
            emptyText="Nothing logged this day."
            expandedPanel={
              filter?.kind === "destination" ? (
                <RankLoadList loads={matching} onEdit={onEdit} />
              ) : null
            }
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
            expandedPanel={
              filter?.kind === "commodity" ? (
                <RankLoadList loads={matching} onEdit={onEdit} />
              ) : null
            }
          />

          {!filter ? (
            <p className="field-hint">Tap a row to list those loads under it.</p>
          ) : null}

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

function RankLoadList({
  loads,
  onEdit,
}: {
  loads: ReturnType<typeof rankAccordionLoads>;
  onEdit: (id: string) => void;
}) {
  if (loads.length === 0) {
    return <p className="field-hint">No loads in this group.</p>;
  }
  return (
    <div className="feed rank-accordion-feed">
      {loads.map((load) => (
        <LoadRow key={load.id} load={load} onEdit={() => onEdit(load.id)} />
      ))}
    </div>
  );
}
