export type StationId = string;

export type Load = {
  id: string;
  truck: string;
  pickup: string;
  commodity: string;
  destination: string;
  /** Station id from master list, or `"custom"`. */
  stationId: StationId;
  /** Calendar date in America/Chicago, `YYYY-MM-DD`. */
  date: string;
  createdAt: string;
  updatedAt: string;
  seeded?: boolean;
  createdBy?: string;
  displayName?: string;
};

export type TabId = "today" | "trucks" | "analytics" | "driver" | "vacation";
