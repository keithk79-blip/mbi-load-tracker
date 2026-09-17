import { useEffect, useState } from "react";
import {
  ROSTER_UNAVAILABLE_REASONS,
  rosterStatusLabel,
  type DriverRosterEntry,
} from "../lib/driverRoster";
import { payTierFromHireDate, payTierLabel } from "../lib/driverPay";
import { formatPayCents, type WeekPay } from "../lib/loadPay";
import { yearsOfService, yearsOfServiceLabel } from "../lib/rosterHireDate";
import type { DriverAllotment } from "../lib/rosterAllotment";

type FullRosterDriverCardProps = {
  entry: DriverRosterEntry;
  index: number;
  count: number;
  today: string;
  asOf: string;
  out: boolean;
  storedOut: boolean;
  onVacation: boolean;
  allot: DriverAllotment;
  week: WeekPay;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  onStatus: (status: string | null) => void;
  onTruck: (truck: string) => void;
  onProfile: (patch: { hireDate?: string | null; phone?: string | null }) => void;
};

export function FullRosterDriverCard({
  entry,
  index,
  count,
  today,
  asOf,
  out,
  storedOut,
  onVacation,
  allot,
  week,
  onMove,
  onRemove,
  onStatus,
  onTruck,
  onProfile,
}: FullRosterDriverCardProps) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [truck, setTruck] = useState(entry.assignedTruck ?? "");
  const [phone, setPhone] = useState(entry.phone ?? "");
  const [hireDate, setHireDate] = useState(entry.hireDate ?? "");

  useEffect(() => {
    setTruck(entry.assignedTruck ?? "");
  }, [entry.assignedTruck]);
  useEffect(() => {
    setPhone(entry.phone ?? "");
  }, [entry.phone]);
  useEffect(() => {
    setHireDate(entry.hireDate ?? "");
  }, [entry.hireDate]);

  const yos = yearsOfService(entry.hireDate, today);
  const tier = payTierFromHireDate(entry.hireDate, asOf);

  const saveTruck = () => {
    const next = truck.trim();
    if ((entry.assignedTruck ?? "") !== next) onTruck(next);
  };

  const saveProfile = () => {
    onProfile({
      phone: phone.trim() || null,
      hireDate: hireDate.trim() || null,
    });
    setEditing(false);
  };

  return (
    <article className={out ? "drv-pay-card is-out" : "drv-pay-card"}>
      <header className="drv-pay-head">
        <button
          type="button"
          className="drv-pay-chevron"
          aria-expanded={open}
          aria-label={open ? `Collapse ${entry.name}` : `Expand ${entry.name}`}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "⌃" : "⌄"}
        </button>
        <div className="drv-pay-who">
          <p className="drv-pay-name">
            <span className="drv-pay-emp">{entry.truckNumber ?? "—"}</span> {entry.name}
            {out ? <span className="drv-out-tag">Out</span> : null}
            {onVacation ? (
              <span className="drv-vac-from" title="From the Vacation tab this week">
                Vac
              </span>
            ) : null}
          </p>
          {entry.phone ? <p className="drv-pay-phone">{entry.phone}</p> : null}
        </div>
        {yos !== null ? (
          <span
            className="drv-yos-tag"
            title={`${payTierLabel(tier)} · started ${entry.hireDate}`}
            aria-label={`Years of service: ${yos}. ${payTierLabel(tier)}`}
          >
            {yearsOfServiceLabel(yos)}
          </span>
        ) : (
          <span className="drv-yos-tag is-missing" title="Add a start date to set pay tier">
            No start
          </span>
        )}
        <button
          type="button"
          className="drv-pay-icon"
          aria-label={`Edit ${entry.name}`}
          onClick={() => setEditing((value) => !value)}
        >
          ✎
        </button>
        <button
          type="button"
          className="vac-pill-x drv-remove"
          aria-label={`Remove ${entry.name}`}
          onClick={onRemove}
        >
          ×
        </button>
      </header>

      {open ? (
        <div className="drv-pay-body">
          {editing ? (
            <div className="drv-pay-edit">
              <label className="drv-pay-field">
                <span>Phone</span>
                <input
                  className="text-input"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="(312) 555-0147"
                  autoComplete="off"
                />
              </label>
              <label className="drv-pay-field">
                <span>Start date</span>
                <input
                  className="text-input"
                  type="date"
                  value={hireDate}
                  onChange={(event) => setHireDate(event.target.value)}
                />
              </label>
              <div className="vac-add-actions">
                <button type="button" className="text-btn amber" onClick={saveProfile}>
                  Save
                </button>
                <button type="button" className="text-btn" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          <div className="drv-full-cell-meta">
            <div className="drv-move drv-full-cell-move">
              <button
                type="button"
                className="drv-move-btn"
                aria-label={`Move ${entry.name} up`}
                disabled={index === 0}
                onClick={() => onMove(-1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="drv-move-btn"
                aria-label={`Move ${entry.name} down`}
                disabled={index === count - 1}
                onClick={() => onMove(1)}
              >
                ↓
              </button>
            </div>
            <input
              className="text-input drv-assigned-truck"
              value={truck}
              onChange={(event) => setTruck(event.target.value)}
              onBlur={saveTruck}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              placeholder="Truck #"
              autoComplete="off"
              aria-label={`Truck number for ${entry.name}`}
            />
            <div className="drv-status-cell">
              <select
                className={
                  storedOut || onVacation ? "drv-status-select is-out" : "drv-status-select"
                }
                value={entry.status ?? ""}
                aria-label={`Unavailability for ${entry.name}`}
                onChange={(event) => onStatus(event.target.value || null)}
              >
                <option value="">{onVacation ? "No mark" : "Available"}</option>
                {ROSTER_UNAVAILABLE_REASONS.map((row) => (
                  <option key={row.token} value={row.token}>
                    {row.reason !== row.label ? `${row.label} — ${row.reason}` : row.label}
                  </option>
                ))}
                {entry.status &&
                !ROSTER_UNAVAILABLE_REASONS.some((row) => row.token === entry.status) ? (
                  <option value={entry.status}>{rosterStatusLabel(entry.status)}</option>
                ) : null}
              </select>
            </div>
            <div className="drv-allotment" aria-label={`Allotment for ${entry.name}`}>
              <span
                className={
                  allot.pDayLeft
                    ? "drv-allot-tag drv-allot-pday"
                    : "drv-allot-tag drv-allot-pday is-empty"
                }
                title={`Personal days left this year (${allot.pDayUsed} used)`}
              >
                P-Day {allot.pDayLeft}
              </span>
              <span
                className={
                  allot.callOffLeft
                    ? "drv-allot-tag drv-allot-calloff"
                    : "drv-allot-tag drv-allot-calloff is-empty"
                }
                title={`Call-offs left this year (${allot.callOffUsed} used)`}
              >
                Call-off {allot.callOffLeft}
              </span>
            </div>
          </div>

          <div className="drv-pay-week" aria-label={`Pay this week for ${entry.name}`}>
            {week.days.map((day) => (
              <div key={day.date} className="drv-pay-day">
                <span className="drv-pay-dow">{day.weekday}</span>
                <span className={day.cents ? "drv-pay-amt" : "drv-pay-amt is-zero"}>
                  {formatPayCents(day.cents)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}
