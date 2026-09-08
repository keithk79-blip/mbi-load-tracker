import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatHeaderDate } from "../lib/chicagoDate";
import { getSupabase } from "../lib/supabase";
import { useAuth } from "../store/AuthContext";
import {
  STATION_CALL_HOURS,
  STATION_CALL_YARDS,
  adjacentStationId,
  boardFillScore,
  boardForDate,
  fetchStationCallStoreFromCloud,
  mergeBoardCells,
  mergeStationCallStores,
  pushStationCallDay,
  readStationCallStore,
  setStationClose,
  setStationHour,
  startForStation,
  writeStationCallStore,
  type StationHourKey,
} from "../lib/stationCalls";

/** Editable columns only: hour keys plus Close. Start is a read-only span. */
type StationCallCol = StationHourKey | "close";

function parseCell(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function focusStationCallCell(stationId: string, col: StationCallCol): boolean {
  const next = document.querySelector<HTMLInputElement>(
    `input.station-call-input[data-station="${CSS.escape(stationId)}"][data-col="${CSS.escape(col)}"]`,
  );
  if (!next) return false;
  next.focus();
  next.select();
  return true;
}

function CellInput({
  value,
  onCommit,
  ariaLabel,
  stationId,
  col,
}: {
  value: number | null | undefined;
  onCommit: (next: number | null) => void;
  ariaLabel: string;
  stationId: string;
  col: StationCallCol;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft !== null ? draft : value === null || value === undefined ? "" : String(value);
  const isZero = draft === null && value === 0;
  const committedRef = useRef(false);

  const commit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    const next = parseCell(draft ?? shown);
    setDraft(null);
    onCommit(next);
  };

  return (
    <input
      className={`station-call-input${isZero ? " is-zero" : ""}`}
      inputMode="numeric"
      aria-label={ariaLabel}
      data-station={stationId}
      data-col={col}
      value={shown}
      onChange={(e) => {
        committedRef.current = false;
        setDraft(e.target.value);
      }}
      onFocus={(e) => e.target.select()}
      onBlur={() => {
        commit();
        committedRef.current = false;
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        commit();
        const nextStation = adjacentStationId(stationId, e.shiftKey ? -1 : 1);
        if (!nextStation) {
          (e.target as HTMLInputElement).blur();
          return;
        }
        requestAnimationFrame(() => {
          focusStationCallCell(nextStation, col);
        });
      }}
    />
  );
}

export function StationCallsCard({ date }: { date: string }) {
  const { configured, session, user } = useAuth();
  const cloud = configured && !!session;
  const [store, setStore] = useState(() => readStationCallStore());
  const board = useMemo(() => boardForDate(store, date), [store, date]);

  useEffect(() => {
    if (!cloud) return;
    let alive = true;

    const hydrate = async () => {
      const remote = await fetchStationCallStoreFromCloud();
      if (!alive || !remote) return;
      const local = readStationCallStore();
      const merged = mergeStationCallStores(local, remote);
      for (const [d, localBoard] of Object.entries(local)) {
        const remoteBoard = remote[d];
        const missing = !remoteBoard;
        const richer =
          !!remoteBoard && boardFillScore(localBoard) > boardFillScore(remoteBoard);
        if (missing || richer) {
          const toPush = remoteBoard
            ? mergeBoardCells(localBoard, remoteBoard)
            : localBoard;
          await pushStationCallDay(d, toPush, user?.id ?? null);
        }
      }
      writeStationCallStore(merged);
      if (alive) setStore(merged);
    };

    void hydrate();

    const supabase = getSupabase();
    if (!supabase) {
      return () => {
        alive = false;
      };
    }
    const channel = supabase
      .channel("station-call-days-crew")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "station_call_days" },
        () => {
          void hydrate();
        },
      )
      .subscribe();
    return () => {
      alive = false;
      void supabase.removeChannel(channel);
    };
  }, [cloud, user?.id]);

  const persist = useCallback(
    (next: ReturnType<typeof readStationCallStore>) => {
      writeStationCallStore(next);
      setStore(next);
      if (cloud) {
        void pushStationCallDay(date, boardForDate(next, date), user?.id ?? null);
      }
    },
    [cloud, date, user?.id],
  );

  const onHour = useCallback(
    (stationId: string, hour: StationHourKey, value: number | null) => {
      persist(setStationHour(store, date, stationId, hour, value));
    },
    [persist, store, date],
  );

  const onClose = useCallback(
    (stationId: string, value: number | null) => {
      persist(setStationClose(store, date, stationId, value));
    },
    [persist, store, date],
  );

  return (
    <article className="station-calls-card">
      <div className="station-calls-head">
        <div>
          <p className="section-title">Load Count By Hour</p>
          <p className="station-calls-sub">
            {formatHeaderDate(date)} · Start from prior Close · hour cells blank until you call
            {cloud ? " · synced" : " · this device only"}
          </p>
        </div>
      </div>
      <div className="station-calls-scroll">
        <table className="station-calls-table">
          <thead>
            <tr>
              <th className="station-calls-corner">{date.slice(5).replace("-", "/")}</th>
              <th>Start</th>
              {STATION_CALL_HOURS.map((h) => (
                <th key={h.key}>{h.label}</th>
              ))}
              <th>Close</th>
            </tr>
          </thead>
          <tbody>
            {STATION_CALL_YARDS.map((yard) => {
              const row = board[yard.id];
              const start = startForStation(store, date, yard.id);
              return (
                <tr key={yard.id}>
                  <th scope="row">{yard.label}</th>
                  <td>
                    <span className={`station-call-start${start === 0 ? " is-zero" : ""}`}>
                      {start}
                    </span>
                  </td>
                  {STATION_CALL_HOURS.map((h) => (
                    <td key={h.key}>
                      <CellInput
                        value={row.hours[h.key]}
                        stationId={yard.id}
                        col={h.key}
                        ariaLabel={`${yard.label} ${h.label}`}
                        onCommit={(next) => onHour(yard.id, h.key, next)}
                      />
                    </td>
                  ))}
                  <td>
                    <CellInput
                      value={row.close}
                      stationId={yard.id}
                      col="close"
                      ariaLabel={`${yard.label} Close`}
                      onCommit={(next) => onClose(yard.id, next)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </article>
  );
}
