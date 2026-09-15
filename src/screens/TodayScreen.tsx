import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { dailyCounts } from "../lib/analytics";
import {
  applyDailyEodToCards,
  displayLoadCount,
  isSheetEodCard,
} from "../lib/dailyEod";
import {
  chicagoToday,
  formatHeaderDate,
  weekStartingSunday,
} from "../lib/chicagoDate";
import { sortLoadsNewestFirst } from "../lib/sortLoads";
import { daySummaryCards } from "../lib/totals";
import { useDailyEod } from "../store/DailyEodContext";
import { useDrivers } from "../store/DriversContext";
import { useLoads } from "../store/LoadsContext";
import { BrandMark } from "../components/BrandMark";
import { DayPicker } from "../components/DayPicker";
import { DriversCard } from "../components/DriversCard";
import { StationCallsCard } from "../components/StationCallsCard";
import { SpecialtyBoardCard } from "../components/SpecialtyBoardCard";
import { ChicagoTrafficCard } from "../components/ChicagoTrafficCard";
import { LoadRow } from "../components/LoadRow";

type TodayScreenProps = {
  date: string;
  onDateChange: (iso: string) => void;
  justEditedId: string | null;
  onLog: (date: string) => void;
  onEdit: (id: string) => void;
  showDayPicker?: boolean;
};

export function TodayScreen({
  date,
  onDateChange,
  justEditedId,
  onLog,
  onEdit,
  showDayPicker = false,
}: TodayScreenProps) {
  const today = chicagoToday();
  const { loads, loadsOn } = useLoads();
  const { totalsOn } = useDailyEod();
  const { availabilityOn } = useDrivers();
  const dayLoads = useMemo(() => sortLoadsNewestFirst(loadsOn(date)), [date, loadsOn]);
  const snapshot = totalsOn(date);
  const viewingToday = date === today;
  const [loadsOpen, setLoadsOpen] = useState(false);

  useEffect(() => {
    setLoadsOpen(false);
  }, [date]);

  const countByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of dailyCounts(loads, weekStartingSunday(date))) {
      map.set(row.date, displayLoadCount(row.count, totalsOn(row.date)));
    }
    return map;
  }, [loads, date, totalsOn]);

  const summaryCards = applyDailyEodToCards(daySummaryCards(dayLoads), snapshot);
  const loadWord = dayLoads.length === 1 ? "load" : "loads";

  return (
    <div className="screen">
      <header className="page-header">
        <div className="page-header-brand">
          <BrandMark />
          <div>
            <p className="eyebrow">Load Tracker</p>
            <h1 className="page-title">{formatHeaderDate(date)}</h1>
          </div>
        </div>
        {justEditedId ? <span className="updated-badge">Updated</span> : null}
      </header>

      {showDayPicker ? (
        <DayPicker
          date={date}
          onChange={onDateChange}
          loadCountFor={(iso) => countByDate.get(iso) ?? 0}
          driverCountFor={(iso) => availabilityOn(iso)?.available ?? null}
        />
      ) : !viewingToday ? (
        <button type="button" className="text-btn amber" onClick={() => onDateChange(today)}>
          Jump to today
        </button>
      ) : null}

      <div className="tally-block">
        <div className="tally-row">
          {summaryCards.map((card) => {
            const fromSheet = Boolean(snapshot) && isSheetEodCard(card.key);
            return (
              <article
                key={card.key}
                className={[
                  card.emphasis ? "tally-card tally-loads" : "tally-card",
                  fromSheet ? "tally-card-sheet" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className="tally-label">{card.label}</span>
                <span className="tally-value">{card.count}</span>
              </article>
            );
          })}
        </div>
      </div>

      <button type="button" className="log-load-top" onClick={() => onLog(date)}>
        + Log load
      </button>

      <ChicagoTrafficCard />

      <DriversCard compact collapsible date={date} loadCount={displayLoadCount(dayLoads.length, snapshot)} />

      <StationCallsCard date={date} />

      <SpecialtyBoardCard date={date} />

      {justEditedId ? (
        <p className="recalc-note">
          Totals recalculate after every edit. Same load, new facts.
        </p>
      ) : null}

      {dayLoads.length === 0 ? (
        <div className="empty">
          <h2>No loads {viewingToday ? "yet today" : `on ${formatHeaderDate(date)}`}</h2>
          <p>
            Log the first haul for this Chicago calendar day with + Log load
            above. You can keep adding more without losing this date. Use the
            week list to change days.
          </p>
        </div>
      ) : (
        <section
          className={
            loadsOpen ? "totals-block day-loads-block" : "totals-block day-loads-block totals-block-collapsed"
          }
        >
          <button
            type="button"
            className="totals-toggle"
            aria-expanded={loadsOpen}
            onClick={() => setLoadsOpen((v) => !v)}
          >
            <span className="totals-toggle-copy">
              <span className="totals-toggle-title">Day loads</span>
              <span className="totals-toggle-count">
                {dayLoads.length} {loadWord}
                {loadsOpen ? "" : " · tap to expand"}
              </span>
            </span>
            <ChevronDown
              size={18}
              className={loadsOpen ? "totals-chevron open" : "totals-chevron"}
              aria-hidden
            />
          </button>
          {loadsOpen ? (
            <div className="feed day-loads-feed">
              {dayLoads.map((load) => (
                <LoadRow
                  key={load.id}
                  load={load}
                  onEdit={() => onEdit(load.id)}
                  highlight={load.id === justEditedId ? "just-edited" : null}
                />
              ))}
            </div>
          ) : null}
        </section>
      )}

    </div>
  );
}
