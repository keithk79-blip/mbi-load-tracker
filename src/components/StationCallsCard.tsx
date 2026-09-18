import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { formatHeaderDate } from "../lib/chicagoDate";
import { attachCloudRefresh } from "../lib/cloudRefresh";
import { getSupabase } from "../lib/supabase";
import { useAuth } from "../store/AuthContext";
import {
  STATION_CALL_HOURS,
  stationCallYards,
  addStationCallYard,
  removeStationCallYard,
  adjacentStationId,
  boardForDate,
  commitStationCell,
  commitStationNote,
  fetchStationCallStoreFromCloud,
  fetchStationNotesFromCloud,
  loadStationNotes,
  mergeStationNoteStores,
  noteForStation,
  parseNumericCell,
  pushStationCallDay,
  pushStationNote,
  readLegacyNotesFromStationCallStorage,
  readStationCallStore,
  readStationNoteStore,
  reconcileStationCallCloud,
  reconcileStationNotesCloud,
  setStationClose,
  setStationHour,
  setStationNote,
  startForStation,
  stationCellFilled,
  writeStationCallStore,
  writeStationNoteStore,
  type StationCellValue,
  type StationHourKey,
  type StationNoteStore,
} from "../lib/stationCalls";

/** Editable columns only: hour keys plus Close. Start is a read-only span. */
type StationCallCol = StationHourKey | "close";
type NotePopMode = "peek" | "edit";

function allowHoverPeek(pointerType: string): boolean {
  if (pointerType !== "mouse" && pointerType !== "pen") return false;
  if (typeof window === "undefined") return false;
  // Phones: tap opens the editor. Hover media is none / pointer is coarse.
  if (window.matchMedia("(pointer: coarse)").matches) return false;
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) return true;
  // Desktop VMs and some remote sessions omit hover media; a mouse still peeks.
  return pointerType === "mouse" && navigator.maxTouchPoints === 0;
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
  value: StationCellValue | null | undefined;
  onCommit: (next: StationCellValue | null) => void;
  ariaLabel: string;
  stationId: string;
  col: StationCallCol;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft !== null ? draft : value === null || value === undefined ? "" : String(value);
  const isZero = draft === null && parseNumericCell(value) === 0;
  const committedRef = useRef(false);

  const commit = (raw?: string) => {
    if (committedRef.current) return;
    committedRef.current = true;
    const next = commitStationCell(raw ?? draft ?? shown);
    if (next === null) setDraft("");
    else setDraft(null);
    onCommit(next);
  };

  const persistEmpty = () => {
    setDraft("");
    if (committedRef.current) return;
    committedRef.current = true;
    onCommit(null);
  };

  return (
    <input
      className={`station-call-input${isZero ? " is-zero" : ""}`}
      type="text"
      inputMode="text"
      autoComplete="off"
      spellCheck={false}
      aria-label={ariaLabel}
      data-station={stationId}
      data-col={col}
      value={shown}
      onChange={(e) => {
        committedRef.current = false;
        const next = e.target.value;
        setDraft(next);
        if (next.trim() === "") persistEmpty();
      }}
      onFocus={(e) => e.target.select()}
      onBlur={() => {
        committedRef.current = false;
        commit();
        committedRef.current = false;
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Backspace" || e.key === "Delete") {
          const input = e.target as HTMLInputElement;
          const allSelected =
            input.selectionStart === 0 &&
            input.selectionEnd === input.value.length &&
            input.value.length > 0;
          if (allSelected) {
            e.preventDefault();
            committedRef.current = false;
            persistEmpty();
            return;
          }
        }
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

function StationNameCell({
  stationId,
  label,
  note,
  open,
  onPeek,
  onEdit,
  onClose,
  onCommit,
  onRemove,
}: {
  stationId: string;
  label: string;
  note: string | null | undefined;
  open: NotePopMode | null;
  onPeek: () => void;
  onEdit: () => void;
  onClose: () => void;
  onCommit: (next: string | null) => void;
  onRemove?: () => void;
}) {
  const filled = stationCellFilled(note);
  const shown = filled ? note : "";
  const [draft, setDraft] = useState(shown);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const hideTimer = useRef<number | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const cancelHide = () => {
    if (hideTimer.current != null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const schedulePeekHide = () => {
    cancelHide();
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = null;
      if (open === "peek") onClose();
    }, 180);
  };

  const beginEdit = () => {
    cancelHide();
    if (open !== "edit") setDraft(shown);
    onEdit();
  };

  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(280, window.innerWidth - 16);
    const estimated = open === "edit" ? 188 : 96;
    let left = r.right + 6;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8);
    }
    let top = r.top;
    if (top + estimated > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - estimated - 8);
    }
    setPos({ top, left });
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open, place, shown]);

  useEffect(() => {
    if (open !== "edit") return;
    const id = window.requestAnimationFrame(() => {
      const el = areaRef.current;
      if (!el) return;
      el.focus();
      const end = el.value.length;
      el.setSelectionRange(end, end);
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const node = event.target as Node | null;
      if (node && btnRef.current?.contains(node)) return;
      if (node && popRef.current?.contains(node)) return;
      if (open === "edit") onCommit(commitStationNote(draft));
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (open === "edit") onCommit(commitStationNote(draft));
      onClose();
    };
    const onScrollOrResize = () => {
      if (open === "peek") {
        onClose();
        return;
      }
      place();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, draft, onClose, onCommit, place]);

  useEffect(() => () => cancelHide(), []);

  const pop =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={popRef}
            className={`station-call-note-pop${open === "edit" ? " is-edit" : " is-peek"}`}
            role={open === "edit" ? "dialog" : "tooltip"}
            aria-label={`${label} note`}
            style={{ top: pos.top, left: pos.left }}
            onPointerEnter={() => {
              cancelHide();
            }}
            onPointerLeave={(event) => {
              if (event.pointerType !== "mouse") return;
              if (open === "peek") schedulePeekHide();
            }}
            onClick={() => {
              if (open === "peek") beginEdit();
            }}
          >
            <p className="station-call-note-pop-title">{label}</p>
            {open === "edit" ? (
              <>
                <textarea
                  ref={areaRef}
                  className="station-call-note-input"
                  value={draft}
                  rows={4}
                  placeholder="Add a note…"
                  aria-label={`${label} note text`}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Escape") {
                      e.preventDefault();
                      onCommit(commitStationNote(draft));
                      onClose();
                    }
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      onCommit(commitStationNote(draft));
                      onClose();
                    }
                  }}
                />
                <div className="station-call-note-pop-actions">
                  <button
                    type="button"
                    className="station-call-note-done"
                    onClick={() => {
                      onCommit(commitStationNote(draft));
                      onClose();
                    }}
                  >
                    Done
                  </button>
                </div>
              </>
            ) : (
              <p className="station-call-note-peek">{shown}</p>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <th scope="row" className={filled ? "has-station-note" : undefined}>
      <div className="station-call-row-label">
        {onRemove ? (
          <button
            type="button"
            className="station-call-remove"
            aria-label={`Remove ${label}`}
            title="Remove row"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRemove();
            }}
          >
            ×
          </button>
        ) : null}
        <button
          ref={btnRef}
          type="button"
          className={`station-call-name${filled ? " has-note" : ""}`}
          data-station={stationId}
          aria-haspopup="dialog"
          aria-expanded={open === "edit"}
          aria-label={filled ? `${label}, has note` : `${label}, add note`}
          onPointerEnter={(event) => {
            if (!allowHoverPeek(event.pointerType)) return;
            if (!filled) return;
            if (open === "edit") return;
            cancelHide();
            onPeek();
          }}
          onPointerLeave={(event) => {
            if (event.pointerType !== "mouse") return;
            if (open === "peek") schedulePeekHide();
          }}
          onClick={beginEdit}
        >
          {label}
        </button>
      </div>
      {pop}
    </th>
  );
}

export function StationCallsCard({ date }: { date: string }) {
  const { configured, session, user } = useAuth();
  const cloud = configured && !!session;
  const [store, setStore] = useState(() => readStationCallStore());
  const [notes, setNotes] = useState<StationNoteStore>(() => loadStationNotes());
  const [extraTick, setExtraTick] = useState(0);
  const yards = useMemo(() => {
    void extraTick;
    return stationCallYards();
  }, [extraTick]);
  const board = useMemo(() => boardForDate(store, date), [store, date]);
  const [noteOpen, setNoteOpen] = useState<{
    date: string;
    id: string;
    mode: NotePopMode;
  } | null>(null);
  const activeNote = noteOpen?.date === date ? noteOpen : null;

  useEffect(() => {
    if (!cloud) return;
    let alive = true;

    const hydrate = async () => {
      const localDays = readStationCallStore();
      const localNotes = readStationNoteStore();
      const localLegacy = readLegacyNotesFromStationCallStorage();
      const [remoteDays, remoteNotes] = await Promise.all([
        fetchStationCallStoreFromCloud(),
        fetchStationNotesFromCloud(),
      ]);
      if (!alive) return;

      if (remoteDays) {
        const { merged, toPush } = reconcileStationCallCloud(localDays, remoteDays.days);
        for (const { date: d, board } of toPush) {
          await pushStationCallDay(d, board, user?.id ?? null);
        }
        writeStationCallStore(merged);
        if (alive) setStore(merged);
      }

      const legacy = mergeStationNoteStores(localLegacy, remoteDays?.legacyNotes ?? {});
      if (remoteNotes) {
        const { merged, toPush } = reconcileStationNotesCloud(
          localNotes,
          remoteNotes,
          legacy,
        );
        for (const { stationId, row } of toPush) {
          await pushStationNote(stationId, row, user?.id ?? null);
        }
        writeStationNoteStore(merged);
        if (alive) setNotes(merged);
      } else {
        const seeded = reconcileStationNotesCloud(localNotes, {}, legacy).merged;
        writeStationNoteStore(seeded);
        if (alive) setNotes(seeded);
      }
    };

    void hydrate();

    const supabase = getSupabase();
    if (!supabase) {
      return () => {
        alive = false;
      };
    }
    const channel = supabase
      .channel("station-call-crew")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "station_call_days" },
        () => {
          void hydrate();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "station_call_notes" },
        () => {
          void hydrate();
        },
      )
      .subscribe();
    const stopRefresh = attachCloudRefresh(hydrate);
    return () => {
      alive = false;
      stopRefresh();
      void supabase.removeChannel(channel);
    };
  }, [cloud, user?.id]);

  const persistDays = useCallback(
    (next: ReturnType<typeof readStationCallStore>) => {
      writeStationCallStore(next);
      setStore(next);
      if (cloud) {
        void pushStationCallDay(date, boardForDate(next, date), user?.id ?? null);
      }
    },
    [cloud, date, user?.id],
  );

  const persistNotes = useCallback(
    (next: StationNoteStore, stationId: string) => {
      writeStationNoteStore(next);
      setNotes(next);
      const row = next[stationId];
      if (cloud && row) {
        void pushStationNote(stationId, row, user?.id ?? null);
      }
    },
    [cloud, user?.id],
  );

  const onHour = useCallback(
    (stationId: string, hour: StationHourKey, value: StationCellValue | null) => {
      persistDays(setStationHour(store, date, stationId, hour, value));
    },
    [persistDays, store, date],
  );

  const onClose = useCallback(
    (stationId: string, value: StationCellValue | null) => {
      persistDays(setStationClose(store, date, stationId, value));
    },
    [persistDays, store, date],
  );

  const onNote = useCallback(
    (stationId: string, value: string | null) => {
      const prev = noteForStation(notes, stationId);
      if (prev === value) return;
      if (!stationCellFilled(prev) && !stationCellFilled(value)) return;
      persistNotes(setStationNote(notes, stationId, value), stationId);
    },
    [persistNotes, notes],
  );

  return (
    <article className="station-calls-card">
      <div className="station-calls-head">
        <div>
          <p className="section-title">Load Count By Hour</p>
          <p className="station-calls-sub">
            {formatHeaderDate(date)} · Start from prior Close · hour cells blank until you call
            {cloud ? " · synced" : " · this device only"}
            {" · hover or tap a station name for a note"}
          </p>
        </div>
      </div>
      <div className="station-calls-scroll">
        <table className="station-calls-table">
          <thead>
            <tr>
              <StationNameCell
                stationId="__date__"
                label=""
                note={noteForStation(notes, "__date__")}
                open={activeNote?.id === "__date__" ? activeNote.mode : null}
                onPeek={() =>
                  setNoteOpen((cur) =>
                    cur?.date === date && cur.mode === "edit"
                      ? cur
                      : { date, id: "__date__", mode: "peek" },
                  )
                }
                onEdit={() => setNoteOpen({ date, id: "__date__", mode: "edit" })}
                onClose={() =>
                  setNoteOpen((cur) =>
                    cur?.date === date && cur.id === "__date__" ? null : cur,
                  )
                }
                onCommit={(next) => onNote("__date__", next)}
              />
              <th>Start</th>
              {STATION_CALL_HOURS.map((h) => (
                <th key={h.key}>{h.label}</th>
              ))}
              <th>Close</th>
            </tr>
          </thead>
          <tbody>
            {yards.map((yard) => {
              const row = board[yard.id];
              const start = startForStation(store, date, yard.id);
              const note = noteForStation(notes, yard.id);
              return (
                <tr key={yard.id}>
                  <StationNameCell
                    stationId={yard.id}
                    label={yard.label}
                    note={note}
                    open={activeNote?.id === yard.id ? activeNote.mode : null}
                    onPeek={() =>
                      setNoteOpen((cur) =>
                        cur?.date === date && cur.mode === "edit"
                          ? cur
                          : { date, id: yard.id, mode: "peek" },
                      )
                    }
                    onEdit={() => setNoteOpen({ date, id: yard.id, mode: "edit" })}
                    onClose={() =>
                      setNoteOpen((cur) =>
                        cur?.date === date && cur.id === yard.id ? null : cur,
                      )
                    }
                    onCommit={(next) => onNote(yard.id, next)}
                    onRemove={() => {
                      if (!window.confirm(`Remove ${yard.label} from Load Count By Hour?`)) return;
                      if (removeStationCallYard(yard.id)) setExtraTick((n) => n + 1);
                    }}
                  />
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
      <button
        type="button"
        className="station-calls-add-btn"
        onClick={() => {
          const newLabel = window.prompt("Customer / station name");
          if (!newLabel) return;
          const yard = addStationCallYard(newLabel);
          if (!yard) {
            window.alert("That name is already on the list.");
            return;
          }
          setExtraTick((n) => n + 1);
        }}
      >
        + Add Row
      </button>
    </article>
  );
}

