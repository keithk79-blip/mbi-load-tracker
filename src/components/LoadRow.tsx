import { formatCreatedStamp } from "../lib/chicagoDate";
import type { Load } from "../types";
import { CommodityTag } from "./CommodityTag";

type LoadRowProps = {
  load: Load;
  onEdit: () => void;
  highlight?: "editing" | "just-edited" | null;
};

export function LoadRow({ load, onEdit, highlight = null }: LoadRowProps) {
  const createdStamp = formatCreatedStamp(load.createdAt);
  return (
    <article
      className={`load-row ${highlight === "editing" ? "load-row-editing" : ""}`}
    >
      <div className="load-row-main">
        <div className="load-row-top">
          <span className="load-truck">
            {load.truck}
            {load.driverName ? (
              <span className="load-driver"> {load.driverName}</span>
            ) : null}
          </span>
          <span className="load-route">
            {load.pickup} <span className="arrow">→</span> {load.destination}
          </span>
        </div>
        <div className="load-row-meta">
          <CommodityTag
            commodity={load.commodity}
            note={
              highlight === "just-edited"
                ? "just edited"
                : load.displayName
                  ? load.displayName
                  : undefined
            }
          />
        </div>
      </div>
      <div className="load-row-actions">
        {createdStamp ? (
          <time className="load-created" dateTime={load.createdAt}>
            {createdStamp}
          </time>
        ) : null}
        {highlight === "editing" ? (
          <span className="editing-label">Editing…</span>
        ) : (
          <button type="button" className="edit-link" onClick={onEdit}>
            Edit
          </button>
        )}
      </div>
    </article>
  );
}
