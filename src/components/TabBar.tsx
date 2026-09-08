import type { TabId } from "../types";
import { BrandFooter, BrandMark } from "./BrandMark";

const TABS: { id: TabId; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "trucks", label: "Trucks" },
  { id: "totals", label: "Totals" },
  { id: "analytics", label: "AnalyticsYTD" },
];

export function TabBar({
  tab,
  onChange,
  vertical = false,
}: {
  tab: TabId;
  onChange: (tab: TabId) => void;
  vertical?: boolean;
}) {
  return (
    <nav
      className={vertical ? "tab-bar tab-bar-side" : "tab-bar"}
      aria-label="Primary"
    >
      {vertical ? (
        <div className="brand-side">
          <BrandMark size="sm" />
        </div>
      ) : null}
      <div className="tab-row">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? "tab tab-active" : "tab"}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <BrandFooter />
    </nav>
  );
}
