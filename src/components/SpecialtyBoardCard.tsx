import { useMemo, useState } from "react";
import { ChevronDown, Minus, Plus } from "lucide-react";
import { formatHeaderDate } from "../lib/chicagoDate";
import {
  SPECIALTY_STATIONS,
  destSummary,
  slotsForStation,
  specialtyDestHint,
  specialtyDestinationsFor,
} from "../lib/specialtyBoard";
import { useSpecialty } from "../store/SpecialtyContext";
import { Chip } from "./Chip";

export function SpecialtyBoardCard({ date }: { date: string }) {
  const { boardOn, addOpen, removeOpen, cloud } = useSpecialty();
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  const board = useMemo(() => boardOn(date), [boardOn, date]);
  const totalOpen = board.length;

  return (
    <article className={`specialty-card${open ? "" : " specialty-card-collapsed"}`}>
      <button
        type="button"
        className="specialty-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="specialty-toggle-copy">
          <span className="specialty-toggle-title">Specialty loads</span>
          <span className="specialty-toggle-meta">
            {totalOpen} open · walking floors · {formatHeaderDate(date)}
            {cloud ? " · synced" : " · this device only"}
            {open ? "" : " · tap to expand"}
          </span>
        </span>
        <ChevronDown
          size={18}
          className={open ? "totals-chevron open" : "totals-chevron"}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="specialty-body">
          <p className="specialty-hint">
            + destination · - or tap dest chip to remove
          </p>
          <ul className="specialty-list">
            {SPECIALTY_STATIONS.map((station) => {
              const slots = slotsForStation(board, station.id);
              const summary = destSummary(slots);
              const count = slots.length;
              const picking = addingFor === station.id;
              return (
                <li key={station.id} className="specialty-row">
                  <div className="specialty-row-main">
                    <span className="specialty-station">{station.name}</span>
                    <span className={`specialty-count${count ? " has-open" : ""}`}>
                      {count}
                    </span>
                    <div className="specialty-stepper">
                      <button
                        type="button"
                        className="specialty-btn"
                        aria-label={`Remove specialty load at ${station.name}`}
                        disabled={count === 0}
                        onClick={() => void removeOpen(date, station.id)}
                      >
                        <Minus size={16} strokeWidth={2.6} />
                      </button>
                      <button
                        type="button"
                        className="specialty-btn"
                        aria-label={`Add specialty load at ${station.name}`}
                        onClick={() =>
                          setAddingFor((prev) =>
                            prev === station.id ? null : station.id,
                          )
                        }
                      >
                        <Plus size={16} strokeWidth={2.6} />
                      </button>
                    </div>
                  </div>

                  {summary.length > 0 ? (
                    <div className="specialty-dests">
                      {summary.map((row) => (
                        <button
                          key={row.destination}
                          type="button"
                          className="specialty-dest-chip"
                          title={`Remove one ${row.destination}`}
                          onClick={() => void removeOpen(date, station.id, row.destination)}
                        >
                          {row.destination}
                          {row.count > 1 ? ` x${row.count}` : ""}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {picking ? (
                    <div className="specialty-picker">
                      <p className="field-hint tight">{specialtyDestHint(station.id)}</p>
                      <div className="chip-row">
                        {specialtyDestinationsFor(station.id).map((dest) => (
                          <Chip
                            key={dest}
                            label={dest}
                            onClick={() => {
                              void addOpen(date, station.id, dest);
                              setAddingFor(null);
                            }}
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        className="text-btn amber"
                        onClick={() => setAddingFor(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </article>
  );
}
