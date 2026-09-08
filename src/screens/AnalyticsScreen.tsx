import { useMemo } from "react";
import { BrandMark } from "../components/BrandMark";
import { CollapsibleRank } from "../components/CollapsibleRank";
import { StationPie } from "../components/StationPie";
import {
  chicagoYearLabel,
  dailyCounts,
  loadsYearToDate,
  peakDailyCount,
  pickupPieSlices,
} from "../lib/analytics";
import {
  chicagoToday,
  formatHeaderDate,
  formatMonthDayYear,
  formatShortDate,
  lastNDays,
  startOfYear,
  weekdayLetter,
} from "../lib/chicagoDate";
import { rankCommodities, rankDestinations, rankPickups } from "../lib/totals";
import { useDrivers } from "../store/DriversContext";
import { useLoads } from "../store/LoadsContext";

const TREND_DAYS = 21;

export function AnalyticsScreen() {
  const today = chicagoToday();
  const { loads } = useLoads();
  const { availabilityOn } = useDrivers();

  const ytdLoads = useMemo(() => loadsYearToDate(loads, today), [loads, today]);
  const trendDates = useMemo(() => lastNDays(today, TREND_DAYS), [today]);
  const trend = useMemo(() => dailyCounts(loads, trendDates), [loads, trendDates]);
  const peak = peakDailyCount(trend);
  const byPickup = useMemo(() => rankPickups(ytdLoads), [ytdLoads]);
  const byDestination = useMemo(() => rankDestinations(ytdLoads), [ytdLoads]);
  const byCommodity = useMemo(() => rankCommodities(ytdLoads), [ytdLoads]);
  const pickupPie = useMemo(() => pickupPieSlices(byPickup), [byPickup]);

  const year = chicagoYearLabel(today);
  const ytdWord = ytdLoads.length === 1 ? "load" : "loads";
  const recentWithLoads = [...trend].reverse();

  return (
    <div className="screen">
      <header className="page-header">
        <div className="page-header-brand">
          <BrandMark />
          <div>
            <p className="eyebrow">AnalyticsYTD</p>
            <h1 className="page-title">{year} year to date</h1>
          </div>
        </div>
      </header>

      <article className="grand-total">
        <div>
          <p className="grand-headline">
            {ytdLoads.length} {ytdWord} year to date
          </p>
          <p className="grand-sub">
            {formatMonthDayYear(startOfYear(today))} – {formatHeaderDate(today)} ·
            America/Chicago
          </p>
        </div>
        <span className="grand-value">{ytdLoads.length}</span>
      </article>

      {loads.length === 0 ? (
        <div className="empty compact">
          <h2>No loads to chart</h2>
          <p>
            Day-to-day and year-to-date fill from whatever is already in this
            device store — local or the shared crew cache.
          </p>
        </div>
      ) : (
        <>
          <section className="totals-block">
            <h2>Transfer station share</h2>
            <p className="totals-hint">
              Year-to-date pickup mix for this Chicago calendar year. Stations
              with no loads are omitted.
            </p>
            {pickupPie.length === 0 ? (
              <p className="field-hint">No YTD pickups to chart.</p>
            ) : (
              <StationPie slices={pickupPie} total={ytdLoads.length} />
            )}
          </section>

          <section className="totals-block">
            <h2>Day to day</h2>
            <p className="totals-hint">
              Last {TREND_DAYS} Chicago calendar days. Bar height is that day’s
              load count. Available drivers are locked per day (Saturday uses
              the sat-yard sum). Sundays have no driver tally.
            </p>
            <div
              className="d2d-chart"
              role="img"
              aria-label={`Daily load counts for the last ${TREND_DAYS} days`}
            >
              {trend.map((day) => {
                const height =
                  peak === 0 ? 0 : Math.max(day.count > 0 ? 8 : 0, (day.count / peak) * 100);
                const isToday = day.date === today;
                return (
                  <div
                    key={day.date}
                    className={isToday ? "d2d-col d2d-col-today" : "d2d-col"}
                    title={`${formatHeaderDate(day.date)}: ${day.count}`}
                  >
                    <span className="d2d-n">{day.count || ""}</span>
                    <div className="d2d-bar-wrap">
                      <div className="d2d-bar" style={{ height: `${height}%` }} />
                    </div>
                    <span className="d2d-wd">{weekdayLetter(day.date)}</span>
                  </div>
                );
              })}
            </div>
            <ol className="d2d-list">
              {recentWithLoads.map((day) => {
                const avail = availabilityOn(day.date);
                const per =
                  avail && avail.available > 0
                    ? (day.count / avail.available).toFixed(2)
                    : null;
                return (
                  <li key={day.date}>
                    <span className="d2d-list-date">
                      {day.date === today ? "Today" : formatShortDate(day.date)}
                      <span className="d2d-list-wd">{weekdayLetter(day.date)}</span>
                    </span>
                    <span className="d2d-list-count">
                      {day.count} {day.count === 1 ? "load" : "loads"}
                      {avail
                        ? ` · ${avail.available} drv${per ? ` · ${per}/drv` : ""}${avail.locked ? " · locked" : ""}`
                        : ""}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>

          <CollapsibleRank
            title="Transfer station"
            hint="Year-to-date pickups, highest first."
            rows={byPickup}
            filterKind="pickup"
            defaultOpen
            emptyText="No pickups in this Chicago year."
          />
          <CollapsibleRank
            title="Landfill"
            hint="Year-to-date destinations."
            rows={byDestination}
            filterKind="destination"
            defaultOpen={false}
            emptyText="No destinations in this Chicago year."
          />
          <CollapsibleRank
            title="Commodity"
            hint="Year-to-date commodities."
            rows={byCommodity}
            filterKind="commodity"
            defaultOpen={false}
            emptyText="No commodities in this Chicago year."
          />
        </>
      )}
    </div>
  );
}
