import { useMemo, useState } from "react";
import { chicagoToday } from "../lib/chicagoDate";
import {
  CURRENT_CONTRACT_START,
} from "../data/customerLaneSeed";
import {
  LANE_COMMODITIES,
  customerNames,
  currentLanesByCustomer,
  isLaneStub,
  lanesForCustomer,
  type CustomerLane,
} from "../lib/customerLanes";
import { useCustomerLanes } from "../store/CustomerLanesContext";

function moneyField(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(/[$,]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function formatTier(n: number | null): string {
  if (n === null) return "—";
  return n % 1 === 0 ? `$${n.toFixed(0)}` : `$${n.toFixed(2)}`;
}

export function CustomersScreen() {
  const { store, saveLane, deleteLane } = useCustomerLanes();
  const today = chicagoToday();
  const [filter, setFilter] = useState<string>("all");
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState("");
  const [openCustomer, setOpenCustomer] = useState<string | null>(null);
  const [laneForm, setLaneForm] = useState<{
    customer: string;
    id?: string;
    destination: string;
    commodity: string;
    effectiveDate: string;
    t1: string;
    t2: string;
    t3: string;
    t4: string;
    t5: string;
  } | null>(null);

  const names = useMemo(() => customerNames(store), [store]);
  const current = useMemo(() => currentLanesByCustomer(store, today), [store, today]);

  const visibleNames = names.filter((name) => {
    if (filter === "all") return true;
    return current.some(
      (lane) =>
        lane.customer === name &&
        (filter === "Trash (MSW)"
          ? /trash|msw/i.test(lane.commodity)
          : filter === "Walking Floor"
            ? /walking|wf/i.test(lane.commodity)
            : /leachate/i.test(lane.commodity)),
    );
  });

  const saveForm = async () => {
    if (!laneForm) return;
    const dest = laneForm.destination.trim();
    if (!dest) return;
    await saveLane({
      id: laneForm.id,
      customer: laneForm.customer,
      destination: dest,
      commodity: laneForm.commodity,
      effectiveDate: laneForm.effectiveDate,
      tier1: moneyField(laneForm.t1),
      tier2: moneyField(laneForm.t2),
      tier3: moneyField(laneForm.t3),
      tier4: moneyField(laneForm.t4),
      tier5: moneyField(laneForm.t5),
    });
    setLaneForm(null);
  };

  return (
    <section className="screen customers-screen">
      <header className="screen-header">
        <p className="eyebrow">Lanes · 5-year contract book</p>
        <h1>Customers</h1>
        <p className="field-hint">
          Per-load pay by customer, destination, and driver tier. A new contract is a new
          start date — old loads keep the old book.
        </p>
      </header>

      <div className="vac-year-row" role="tablist" aria-label="Commodity">
        {[
          { id: "all", label: "All" },
          { id: "Trash (MSW)", label: "Trash / MSW" },
          { id: "Walking Floor", label: "Walking-floor" },
          { id: "Leachate (tanker)", label: "Leachate" },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            className={filter === item.id ? "day-chip day-chip-active" : "day-chip"}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="vac-add-actions">
        <button type="button" className="text-btn amber" onClick={() => setAddingCustomer(true)}>
          + Add customer
        </button>
      </div>

      {addingCustomer ? (
        <form
          className="drv-add-form"
          onSubmit={(event) => {
            event.preventDefault();
            const name = newCustomer.trim();
            if (!name) return;
            void saveLane({
              customer: name,
              destination: "",
              commodity: "Trash (MSW)",
              effectiveDate: CURRENT_CONTRACT_START,
            });
            setNewCustomer("");
            setAddingCustomer(false);
            setOpenCustomer(name);
          }}
        >
          <input
            className="text-input"
            value={newCustomer}
            onChange={(event) => setNewCustomer(event.target.value)}
            placeholder="Customer name"
            autoComplete="off"
          />
          <div className="vac-add-actions">
            <button type="submit" className="text-btn amber">
              Add
            </button>
            <button type="button" className="text-btn" onClick={() => setAddingCustomer(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <div className="cust-list">
        {visibleNames.map((name) => {
          const rows = lanesForCustomer(store, name);
          const live = current.filter((lane) => lane.customer === name && !isLaneStub(lane));
          const open = openCustomer === name;
          return (
            <article key={name} className="cust-card">
              <header className="cust-head">
                <button
                  type="button"
                  className="cust-toggle"
                  onClick={() => setOpenCustomer(open ? null : name)}
                >
                  <strong>{name}</strong>
                  <span className="field-hint">
                    {live.length
                      ? `${live.length} ${live.length === 1 ? "lane" : "lanes"}`
                      : "No dests yet"}
                  </span>
                </button>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() =>
                    setLaneForm({
                      customer: name,
                      destination: "",
                      commodity: "Trash (MSW)",
                      effectiveDate: today,
                      t1: "",
                      t2: "",
                      t3: "",
                      t4: "",
                      t5: "",
                    })
                  }
                >
                  + Lane
                </button>
              </header>
              {open ? (
                <div className="cust-body">
                  {live.length === 0 ? (
                    <p className="field-hint">Add a destination and the five tier rates.</p>
                  ) : (
                    live.map((lane) => (
                      <LaneRow
                        key={lane.id}
                        lane={lane}
                        history={rows.filter(
                          (row) =>
                            row.destination === lane.destination &&
                            row.commodity === lane.commodity,
                        )}
                        onEdit={() =>
                          setLaneForm({
                            customer: name,
                            id: lane.id,
                            destination: lane.destination,
                            commodity: lane.commodity,
                            effectiveDate: lane.effectiveDate,
                            t1: lane.tier1 != null ? String(lane.tier1) : "",
                            t2: lane.tier2 != null ? String(lane.tier2) : "",
                            t3: lane.tier3 != null ? String(lane.tier3) : "",
                            t4: lane.tier4 != null ? String(lane.tier4) : "",
                            t5: lane.tier5 != null ? String(lane.tier5) : "",
                          })
                        }
                        onRenew={() =>
                          setLaneForm({
                            customer: name,
                            destination: lane.destination,
                            commodity: lane.commodity,
                            effectiveDate: today,
                            t1: lane.tier1 != null ? String(lane.tier1) : "",
                            t2: lane.tier2 != null ? String(lane.tier2) : "",
                            t3: lane.tier3 != null ? String(lane.tier3) : "",
                            t4: lane.tier4 != null ? String(lane.tier4) : "",
                            t5: lane.tier5 != null ? String(lane.tier5) : "",
                          })
                        }
                        onDelete={() => void deleteLane(lane.id)}
                      />
                    ))
                  )}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {laneForm ? (
        <form
          className="cust-form"
          onSubmit={(event) => {
            event.preventDefault();
            void saveForm();
          }}
        >
          <h2>{laneForm.id ? "Edit lane" : "Add lane"} · {laneForm.customer}</h2>
          <label className="drv-pay-field">
            <span>Destination</span>
            <input
              className="text-input"
              value={laneForm.destination}
              onChange={(event) =>
                setLaneForm({ ...laneForm, destination: event.target.value })
              }
              placeholder="DeKalb"
              autoComplete="off"
            />
          </label>
          <label className="drv-pay-field">
            <span>Commodity</span>
            <select
              className="text-input"
              value={laneForm.commodity}
              onChange={(event) =>
                setLaneForm({ ...laneForm, commodity: event.target.value })
              }
            >
              {LANE_COMMODITIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="drv-pay-field">
            <span>Contract start</span>
            <input
              className="text-input"
              type="date"
              value={laneForm.effectiveDate}
              onChange={(event) =>
                setLaneForm({ ...laneForm, effectiveDate: event.target.value })
              }
            />
          </label>
          <div className="cust-tiers">
            {(["t1", "t2", "t3", "t4", "t5"] as const).map((key, i) => (
              <label key={key} className="drv-pay-field">
                <span>Tier {i + 1}</span>
                <input
                  className="text-input"
                  inputMode="decimal"
                  value={laneForm[key]}
                  onChange={(event) =>
                    setLaneForm({ ...laneForm, [key]: event.target.value })
                  }
                  placeholder="0.00"
                />
              </label>
            ))}
          </div>
          <div className="vac-add-actions">
            <button type="submit" className="text-btn amber">
              Save lane
            </button>
            <button type="button" className="text-btn" onClick={() => setLaneForm(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function LaneRow({
  lane,
  history,
  onEdit,
  onRenew,
  onDelete,
}: {
  lane: CustomerLane;
  history: CustomerLane[];
  onEdit: () => void;
  onRenew: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="cust-lane">
      <div className="cust-lane-top">
        <strong>{lane.destination}</strong>
        <span className="field-hint">{lane.commodity}</span>
      </div>
      <div className="cust-rate-row" aria-label="Tier rates">
        {[lane.tier1, lane.tier2, lane.tier3, lane.tier4, lane.tier5].map((n, i) => (
          <span key={i} className="cust-rate">
            T{i + 1} {formatTier(n)}
          </span>
        ))}
      </div>
      <p className="field-hint">
        In force {lane.effectiveDate}
        {history.length > 1 ? ` · ${history.length} contract books` : null}
      </p>
      <div className="vac-add-actions">
        <button type="button" className="text-btn" onClick={onEdit}>
          Edit
        </button>
        <button type="button" className="text-btn" onClick={onRenew}>
          New contract
        </button>
        <button type="button" className="text-btn" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}
