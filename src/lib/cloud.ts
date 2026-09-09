import type { Load } from "../types";

/** PostgREST default max-rows is 1000; a busy tracker can exceed one page. */
export const LOAD_FETCH_PAGE_SIZE = 1000;

export type PagedQueryResult<T> = { data: T[] | null; error: unknown };

/**
 * Walk `.range()` pages until a short page. A single `select *` can silently
 * truncate and then look like a thinner remote (the 324→306 class).
 */
export async function fetchAllPaged<T>(
  queryPage: (from: number, to: number) => Promise<PagedQueryResult<T>>,
  pageSize = LOAD_FETCH_PAGE_SIZE,
): Promise<PagedQueryResult<T>> {
  if (pageSize < 1) return { data: null, error: new Error("invalid page size") };
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryPage(from, from + pageSize - 1);
    if (error) return { data: null, error };
    if (!Array.isArray(data)) {
      return { data: null, error: new Error("load page was not an array") };
    }
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return { data: rows, error: null };
}

export type LoadRow = {
  id: string;
  date: string;
  truck: string;
  pickup: string;
  commodity: string;
  destination: string;
  station_id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  display_name: string | null;
};

export function rowToLoad(row: LoadRow): Load {
  return {
    id: row.id,
    truck: row.truck,
    pickup: row.pickup,
    commodity: row.commodity,
    destination: row.destination,
    stationId: row.station_id,
    date: row.date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by ?? undefined,
    displayName: row.display_name ?? undefined,
  };
}

export function loadToRow(
  load: Load,
  userId: string | null,
): Omit<LoadRow, "created_at" | "updated_at"> & {
  created_at: string;
  updated_at: string;
} {
  return {
    id: load.id,
    date: load.date,
    truck: load.truck,
    pickup: load.pickup,
    commodity: load.commodity,
    destination: load.destination,
    station_id: load.stationId,
    created_at: load.createdAt,
    updated_at: load.updatedAt,
    created_by: load.createdBy ?? userId,
    display_name: load.displayName ?? null,
  };
}
