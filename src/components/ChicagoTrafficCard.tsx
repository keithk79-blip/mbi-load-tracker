import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Construction,
  RefreshCw,
  Timer,
} from "lucide-react";
import {
  corridorChipsLabel,
  fetchChicagoTraffic,
  formatRelativeUpdated,
  totalAlerts,
  truncateTrafficError,
  type ChicagoTrafficSnapshot,
  type TrafficAlert,
} from "../lib/chicagoTraffic";

const REFRESH_MS = 4 * 60 * 1000;

function AlertRow({
  alert,
  icon,
}: {
  alert: TrafficAlert;
  icon: "incident" | "construction" | "travel";
}) {
  const Icon =
    icon === "incident" ? AlertTriangle : icon === "construction" ? Construction : Timer;
  const tone =
    icon === "incident"
      ? "traffic-row incident"
      : icon === "construction"
        ? "traffic-row construction"
        : `traffic-row travel cng-${(alert.congestion || "light").toLowerCase()}`;

  return (
    <li className={tone}>
      <Icon size={15} strokeWidth={2.4} className="traffic-row-icon" aria-hidden />
      <div className="traffic-row-copy">
        <span className="traffic-row-title">{alert.title}</span>
        {alert.detail ? <span className="traffic-row-detail">{alert.detail}</span> : null}
      </div>
    </li>
  );
}

export function ChicagoTrafficCard() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [snap, setSnap] = useState<ChicagoTrafficSnapshot | null>(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else if (!snap) setLoading(true);
    try {
      const next = await fetchChicagoTraffic();
      setSnap(next);
    } catch (err) {
      setSnap((prev) =>
        prev ?? {
          incidents: [],
          construction: [],
          travelTimes: [],
          updatedAt: null,
          fetchedAt: Date.now(),
          errors: [truncateTrafficError(err instanceof Error ? err.message : String(err))],
        },
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [snap]);

  useEffect(() => {
    void load(false);
    const id = window.setInterval(() => void load(false), REFRESH_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount + interval only
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const count = snap ? totalAlerts(snap) : 0;
  const failDetail = snap?.errors[0] ? truncateTrafficError(snap.errors[0]) : "";
  const allFailed = !!snap && snap.errors.length > 0 && count === 0;
  const empty = !!snap && count === 0 && !allFailed && !loading;

  const meta = useMemo(() => {
    void tick;
    const when = formatRelativeUpdated(snap?.fetchedAt ?? snap?.updatedAt ?? null);
    const bits = [
      corridorChipsLabel(),
      "SigAlert · Chicago",
      when,
    ];
    if (snap && count > 0) bits.unshift(`${count} alert${count === 1 ? "" : "s"}`);
    if (!open) bits.push("tap to expand");
    return bits.join(" · ");
  }, [snap, count, open, tick]);

  return (
    <article className={`traffic-card${open ? "" : " traffic-card-collapsed"}`}>
      <button
        type="button"
        className="traffic-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="traffic-toggle-copy">
          <span className="traffic-toggle-title">Chicago traffic</span>
          <span className="traffic-toggle-meta">{meta}</span>
        </span>
        <span className="traffic-toggle-actions">
          <span
            role="button"
            tabIndex={0}
            className={`traffic-refresh${refreshing ? " spinning" : ""}`}
            title="Refresh traffic"
            aria-label="Refresh traffic"
            onClick={(e) => {
              e.stopPropagation();
              void load(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                void load(true);
              }
            }}
          >
            <RefreshCw size={15} strokeWidth={2.4} aria-hidden />
          </span>
          <ChevronDown
            size={18}
            className={open ? "totals-chevron open" : "totals-chevron"}
            aria-hidden
          />
        </span>
      </button>

      {open ? (
        <div className="traffic-body">
          {loading && !snap ? (
            <p className="traffic-status">Loading corridor alerts…</p>
          ) : allFailed ? (
            <p className="traffic-status error">
              Could not reach SigAlert{failDetail ? `: ${failDetail}` : "."} Try
              again in a minute.
            </p>
          ) : empty ? (
            <p className="traffic-empty">No major corridor alerts right now.</p>
          ) : (
            <>
              {snap && snap.errors.length > 0 && count > 0 ? (
                <p className="traffic-status warn">
                  Partial update — {failDetail || snap.errors.join(", ")}.
                </p>
              ) : null}

              {snap && snap.incidents.length > 0 ? (
                <section className="traffic-section">
                  <h3 className="traffic-section-title">
                    <AlertTriangle size={14} aria-hidden /> Incidents
                  </h3>
                  <ul className="traffic-list">
                    {snap.incidents.map((a) => (
                      <AlertRow key={`i-${a.id}`} alert={a} icon="incident" />
                    ))}
                  </ul>
                </section>
              ) : null}

              {snap && snap.construction.length > 0 ? (
                <section className="traffic-section">
                  <h3 className="traffic-section-title">
                    <Construction size={14} aria-hidden /> Construction
                  </h3>
                  <ul className="traffic-list">
                    {snap.construction.map((a) => (
                      <AlertRow key={`c-${a.id}`} alert={a} icon="construction" />
                    ))}
                  </ul>
                </section>
              ) : null}

              {snap && snap.travelTimes.length > 0 ? (
                <section className="traffic-section">
                  <h3 className="traffic-section-title">
                    <Timer size={14} aria-hidden /> Travel times
                  </h3>
                  <ul className="traffic-list">
                    {snap.travelTimes.map((a) => (
                      <AlertRow key={`t-${a.id}`} alert={a} icon="travel" />
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}

          <p className="traffic-attrib">Data: SigAlert</p>
        </div>
      ) : null}
    </article>
  );
}
