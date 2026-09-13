import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addDays,
  chicagoToday,
  dayNumber,
  formatShortDate,
  weekStartingSunday,
  weekdayLetter,
} from "../lib/chicagoDate";

type DayPickerProps = {
  date: string;
  onChange: (iso: string) => void;
  showCalendar?: boolean;
  /** Per-ISO load counts. Must be keyed by each chip's own date, never the selected date. */
  loadCountFor?: (iso: string) => number;
  /** Per-ISO locked/live driver snapshot. Null when that day has no tally. */
  driverCountFor?: (iso: string) => number | null;
};

export function DayPicker({
  date,
  onChange,
  showCalendar = true,
  loadCountFor,
  driverCountFor,
}: DayPickerProps) {
  const today = chicagoToday();
  const week = weekStartingSunday(date);
  const weekLabel = `${formatShortDate(week[0])} – ${formatShortDate(week[6])}`;

  return (
    <div className="day-picker">
      <div className="week-nav">
        <button
          type="button"
          className="icon-btn"
          aria-label="Previous week"
          onClick={() => onChange(addDays(week[0], -7))}
        >
          <ChevronLeft size={20} />
        </button>
        <span className="week-label">{weekLabel}</span>
        <button
          type="button"
          className="icon-btn"
          aria-label="Next week"
          onClick={() => onChange(addDays(week[0], 7))}
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="day-strip" role="tablist" aria-label="Day">
        {week.map((iso) => {
          const loads = loadCountFor ? loadCountFor(iso) : null;
          const drivers = driverCountFor ? driverCountFor(iso) : null;
          return (
            <button
              key={iso}
              type="button"
              className={iso === date ? "day-chip day-chip-active" : "day-chip"}
              onClick={() => onChange(iso)}
            >
              <span className="day-num">{dayNumber(iso)}</span>
              <span className="day-wd">{weekdayLetter(iso)}</span>
              {loads !== null ? (
                <span className="day-loads">
                  {loads} {loads === 1 ? "load" : "loads"}
                </span>
              ) : null}
              {drivers !== null ? (
                <span className="day-drivers">{drivers} drv</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="day-picker-row">
        {date !== today ? (
          <button
            type="button"
            className="text-btn amber"
            onClick={() => onChange(today)}
          >
            Jump to today
          </button>
        ) : (
          <span className="field-hint tight">America/Chicago</span>
        )}
        {showCalendar ? (
          <label className="date-pick inline">
            Calendar
            <input
              type="date"
              value={date}
              onChange={(e) => {
                if (e.target.value) onChange(e.target.value);
              }}
            />
          </label>
        ) : null}
      </div>
    </div>
  );
}
