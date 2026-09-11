import type { Load } from "../types";

/**
 * Today / Totals / Search feed order: first dispatched first.
 * Uses createdAt only — cloud upserts bump updatedAt and must not reshuffle the list.
 * Equal timestamps stay deterministic by id so qty batches and ties do not flicker.
 */
export function sortLoads(loads: Load[]): Load[] {
  return [...loads].sort((a, b) => {
    const byCreated = a.createdAt.localeCompare(b.createdAt);
    if (byCreated !== 0) return byCreated;
    return a.id.localeCompare(b.id);
  });
}
