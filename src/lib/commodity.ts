export type TagTone = {
  bg: string;
  fg: string;
  border: string;
};

const TONES: Record<string, TagTone> = {
  trash: { bg: "#1d3a5c", fg: "#8ec5ff", border: "#3d6fa0" },
  recycle: { bg: "#1c3d28", fg: "#8fe0a4", border: "#3d7a52" },
  yard: { bg: "#2a3d1c", fg: "#c4e07a", border: "#5a7a32" },
  wood: { bg: "#3d2a14", fg: "#e0b07a", border: "#8a5a32" },
  cardboard: { bg: "#3d3420", fg: "#e0c48a", border: "#8a7040" },
  leachate: { bg: "#163d42", fg: "#7edce8", border: "#2e7a82" },
  cd: { bg: "#33363c", fg: "#c8ccd4", border: "#5a5e66" },
  tires: { bg: "#2a2438", fg: "#c4b4e0", border: "#5a4e78" },
  default: { bg: "#2a2e36", fg: "#d4d0c8", border: "#4a4e56" },
};

export function commodityTone(commodity: string): TagTone {
  const c = commodity.toLowerCase();
  if (c.includes("leachate")) return TONES.leachate;
  if (c.includes("residual") || c.includes("residue")) return TONES.cd;
  if (c.includes("glass")) return TONES.recycle;
  if (c.includes("trash") || c.includes("msw")) return TONES.trash;
  if (c.includes("recycle")) return TONES.recycle;
  if (c.includes("yard")) return TONES.yard;
  if (c.includes("wood")) return TONES.wood;
  if (c.includes("cardboard")) return TONES.cardboard;
  if (c.includes("c&d") || c.includes("c and d") || c === "cd") return TONES.cd;
  if (c.includes("tire")) return TONES.tires;
  return TONES.default;
}

/**
 * Bucket for Today / EOD summary cards, commodity filters, and rank grouping.
 * C&D rolls into TRASH (MSW), matching the Dispatch Board sheet: C&D hauls are
 * entered on the Trash hour grid and already sit inside Total MSW. They are not
 * a leftover outside TRASH / LEACHATE / WALKING-FLOOR.
 * Load tags still show the typed commodity; commodityRankLabel keeps "C&D" as a
 * display name. Rank rows group by this tally bucket, so C&D appears under
 * Trash (MSW) rather than as its own rank.
 */
export function tallyLabel(commodity: string): string {
  const c = commodity.toLowerCase();
  if (c.includes("leachate")) return "LEACHATE";
  if (c.includes("residual") || c.includes("residue")) return "RESIDUAL";
  if (c.includes("glass")) return "GLASS";
  if (c.includes("trash") || c.includes("msw")) return "TRASH";
  if (c.includes("yard")) return "YARD";
  if (c.includes("recycle")) return "RECYCLE";
  if (c.includes("wood")) return "WOOD";
  if (c.includes("cardboard")) return "CARDBOARD";
  if (c.includes("c&d")) return "TRASH";
  if (c.includes("tire")) return "TIRES";
  return commodity.toUpperCase();
}

/** Longer names for the Day Totals ranking (and filter captions). */
export function commodityRankLabel(commodity: string): string {
  const c = commodity.toLowerCase();
  if (c.includes("leachate")) return "Leachate";
  if (c.includes("residual") || c.includes("residue")) return "Residual";
  if (c.includes("glass")) return "Glass";
  if (c.includes("trash") || c.includes("msw")) return "Trash (MSW)";
  if (c.includes("yard")) return "Yard Waste";
  if (c.includes("recycle")) return "Recycle";
  if (c.includes("wood")) return "Wood";
  if (c.includes("cardboard")) return "Cardboard";
  if (c.includes("c&d")) return "C&D";
  if (c.includes("tire")) return "Tires";
  return commodity;
}

export function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export function loadsToCsv(
  loads: { truck: string; pickup: string; commodity: string; destination: string }[],
): string {
  const header = "truck,pickup,commodity,destination";
  const rows = loads.map((load) =>
    [load.truck, load.pickup, load.commodity, load.destination]
      .map(csvEscape)
      .join(","),
  );
  return [header, ...rows].join("\n") + "\n";
}
