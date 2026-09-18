import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { RankRow, TotalsFilter } from "../lib/totals";

type CollapsibleRankProps = {
  title: string;
  hint?: string;
  rows: RankRow[];
  filterKind: TotalsFilter["kind"];
  active?: TotalsFilter | null;
  onSelect?: (filter: TotalsFilter) => void;
  defaultOpen?: boolean;
  emptyText?: string;
  /** Compact numbers/table — no full-width bars. */
  compact?: boolean;
  /** Loads for the selected row, rendered as an accordion under that row. */
  expandedPanel?: ReactNode;
};

export function CollapsibleRank({
  title,
  hint,
  rows,
  filterKind,
  active = null,
  onSelect,
  defaultOpen = true,
  emptyText = "Nothing logged in this group.",
  compact = false,
  expandedPanel,
}: CollapsibleRankProps) {
  const [open, setOpen] = useState(defaultOpen);
  const max = rows[0]?.count ?? 0;
  const keys = rows.length;

  return (
    <section className={open ? "totals-block" : "totals-block totals-block-collapsed"}>
      <button
        type="button"
        className="totals-toggle"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="totals-toggle-copy">
          <span className="totals-toggle-title">{title}</span>
          <span className="totals-toggle-count">
            {keys} {keys === 1 ? "group" : "groups"}
          </span>
        </span>
        <ChevronDown
          size={20}
          className={open ? "totals-chevron open" : "totals-chevron"}
          aria-hidden
        />
      </button>

      {open ? (
        <>
          {hint ? <p className="totals-hint">{hint}</p> : null}
          {rows.length === 0 ? (
            <p className="field-hint">{emptyText}</p>
          ) : (
            <ul className="rank-list">
              {rows.map((row) => {
                const selected =
                  active?.kind === filterKind && active.key === row.key;
                const pct = max === 0 ? 0 : Math.max(8, (row.count / max) * 100);
                return (
                  <li
                    key={row.key}
                    className={selected ? "rank-item rank-item-open" : "rank-item"}
                  >
                    {onSelect ? (
                      <button
                        type="button"
                        className={
                          selected
                            ? `rank-row rank-row-active${compact ? " rank-row-compact" : ""}`
                            : `rank-row${compact ? " rank-row-compact" : ""}`
                        }
                        aria-expanded={selected}
                        onClick={() => onSelect({ kind: filterKind, key: row.key })}
                      >
                        <RankInner row={row} pct={pct} showBar={!compact} />
                      </button>
                    ) : (
                      <div
                        className={`rank-row rank-row-static${compact ? " rank-row-compact" : ""}`}
                      >
                        <RankInner row={row} pct={pct} showBar={!compact} />
                      </div>
                    )}
                    {selected && expandedPanel ? (
                      <div className="rank-accordion">{expandedPanel}</div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}

function RankInner({
  row,
  pct,
  showBar,
}: {
  row: RankRow;
  pct: number;
  showBar: boolean;
}) {
  return (
    <>
      <div className="rank-row-top">
        <span className="rank-label">
          {row.label}
          {row.custom ? <span className="custom-pill">Custom</span> : null}
        </span>
        <strong className="rank-count">{row.count}</strong>
      </div>
      {showBar ? (
        <div className="rank-track" aria-hidden>
          <div className="rank-fill" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </>
  );
}
