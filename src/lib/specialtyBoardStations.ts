/** Walking-floor / specialty load board (day-scoped open slots). */

import { destinationsFor } from "../data/stations";
import {
  CUSTOM_SPECIALTY_DEFAULT_NAMES,
  isCustomSpecialtyId,
} from "./customSpecialty";

export type SpecialtyStation = {
  id: string;
  name: string;
};

/** Stations from the Specialty Load Board sheet (skip empty X columns). */
export const SPECIALTY_STATIONS: SpecialtyStation[] = [
  { id: "elgin", name: "Elgin" },
  { id: "apollo", name: "Apollo" },
  { id: "melrose", name: "Melrose" },
  { id: "batavia", name: "Batavia" },
  { id: "northlake", name: "N. Lake" },
  { id: "arc", name: "Arc" },
  { id: "citiwaste", name: "Citi Waste" },
  { id: "schererville", name: "Schererville" },
  { id: "mccook", name: "McCook" },
  { id: "dekalb-reload", name: "Dekalb Reload" },
  { id: "wheeling", name: "Wheeling" },
  { id: "rockdale", name: "Rockdale" },
  { id: "dekalb", name: "Dekalb" },
  { id: "roscoe", name: "Roscoe" },
  { id: "ford", name: "Ford" },
  { id: "prairie-hill", name: "PrairieHill" },
  { id: "hodgkins", name: "Hodgkins" },
  { id: "grayslake", name: "GraysLake" },
  { id: "liberty-tank", name: "Liberty" },
  { id: "herthside", name: "Hearthside" },
  { id: "custom-1", name: CUSTOM_SPECIALTY_DEFAULT_NAMES["custom-1"] },
  { id: "custom-2", name: CUSTOM_SPECIALTY_DEFAULT_NAMES["custom-2"] },
  { id: "custom-3", name: CUSTOM_SPECIALTY_DEFAULT_NAMES["custom-3"] },
  { id: "custom-4", name: CUSTOM_SPECIALTY_DEFAULT_NAMES["custom-4"] },
];

/** Quick destinations for specialty / walking-floor opens. */
export const SPECIALTY_DESTINATIONS = [
  "RSI",
  "Hodgkins",
  "Homewood",
  "Groot",
  "DeKalb",
  "CID",
  "Kankakee",
  "Rockford",
  "Prairie Hill",
  "Pontiac",
  "Liberty",
  "Newton County",
  "Covanta",
  "Loop",
  "Willow Ranch",
  "Organix",
] as const;

const SPECIALTY_CATALOG_DEST_IDS = new Set(["grayslake", "herthside", "hodgkins"]);

const SPECIALTY_COMMODITY_CHIP_IDS = new Set([
  "wheeling",
  "rockdale",
  "dekalb",
  "roscoe",
  "ford",
  "prairie-hill",
]);

const SPECIALTY_DEST_OVERRIDES: Record<string, readonly string[]> = {
  apollo: ["Pontiac", "Christianson Farms", "Organix", "Homewood"],
  elgin: [
    "Hodgkins",
    "DeKalb",
    "Covanta",
    "RSI",
    "Prairie Hill",
    "Lake Co MRF",
    "DuPage",
  ],
  melrose: ["Hodgkins", "RSI", "Willow Ranch", "Homewood"],
  batavia: ["Hodgkins", "Lake Co MRF", "RSI", "Trash"],
  northlake: ["Hodgkins", "Thelens", "Organix"],
  arc: ["Organix", "Hodgkins", "Thelens", "Resource MGT"],
  citiwaste: [
    "Joyce Farms",
    "Hodgkins",
    "WCN MRF",
    "Homewood",
    "Pontiac",
    "Loop",
  ],
  schererville: ["Homewood"],
  mccook: ["Christianson Farms"],
  "dekalb-reload": ["Hodgkins", "RSI"],
  wheeling: ["Recycle", "Yard Waste", "Cardboard"],
  rockdale: ["Recycle", "Yard Waste", "Cardboard"],
  dekalb: ["Wood", "Recycle", "Yard Waste", "C&D"],
  roscoe: ["Recycle"],
  ford: ["Cardboard", "Trash", "Recycle"],
  "prairie-hill": ["C&D", "Yard Waste"],
  "liberty-tank": ["CID", "Kankakee", "Reworld", "KanSpcl", "Sun Chem"],
  grayslake: ["FRWRD", "CID", "Dekalb Sanitary"],
};

export function specialtyChipMode(
  stationId: string,
): "commodity" | "destination" {
  return SPECIALTY_COMMODITY_CHIP_IDS.has(stationId) ? "commodity" : "destination";
}

export function specialtyDestinationsFor(stationId: string): readonly string[] {
  if (isCustomSpecialtyId(stationId)) return [];
  if (SPECIALTY_DEST_OVERRIDES[stationId]) return SPECIALTY_DEST_OVERRIDES[stationId];
  if (SPECIALTY_CATALOG_DEST_IDS.has(stationId)) return destinationsFor(stationId);
  return SPECIALTY_DESTINATIONS;
}

export function specialtyDestHint(stationId: string): string {
  if (isCustomSpecialtyId(stationId)) {
    return "Name the pickup · Leachate / Walking-floor / Trash · type the dest";
  }
  if (stationId === "herthside") return "Trash destination for new open load";
  if (stationId === "hodgkins") {
    return "Residual · Pontiac/Liberty · Glass · Strategic/Resource MGT";
  }
  if (stationId === "apollo") {
    return "Pontiac · Christianson Farms · Organix · Homewood";
  }
  if (stationId === "elgin") {
    return "Hodgkins · DeKalb · Covanta · RSI · Prairie Hill · Lake Co MRF · DuPage";
  }
  if (stationId === "melrose") {
    return "Hodgkins · RSI · Willow Ranch · Homewood";
  }
  if (stationId === "batavia") {
    return "Hodgkins · Lake Co MRF · RSI · Trash";
  }
  if (stationId === "grayslake") {
    return "FRWRD · CID · Dekalb Sanitary";
  }
  if (stationId === "northlake") {
    return "Hodgkins · Thelens · Organix";
  }
  if (stationId === "arc") {
    return "Organix · Hodgkins · Thelens · Resource MGT";
  }
  if (stationId === "citiwaste") {
    return "Joyce Farms · Hodgkins · WCN MRF · Homewood · Pontiac · Loop";
  }
  if (stationId === "schererville") {
    return "Homewood destination for new open load";
  }
  if (stationId === "mccook") {
    return "Christianson Farms destination for new open load";
  }
  if (stationId === "dekalb-reload") {
    return "Hodgkins · RSI";
  }
  if (stationId === "wheeling" || stationId === "rockdale") {
    return "Recycle · Yard Waste · Cardboard";
  }
  if (stationId === "dekalb") {
    return "Wood · Recycle · Yard Waste · C&D";
  }
  if (stationId === "roscoe") {
    return "Recycle commodity for new open load";
  }
  if (stationId === "ford") {
    return "Cardboard · Trash · Recycle";
  }
  if (stationId === "prairie-hill") {
    return "C&D · Yard Waste";
  }
  if (stationId === "liberty-tank") {
    return "CID · Kankakee · Reworld · KanSpcl · Sun Chem";
  }
  return specialtyChipMode(stationId) === "commodity"
    ? "Commodity for new open load"
    : "Destination for new open load";
}

export function isSpecialtyStationId(stationId: string): boolean {
  return SPECIALTY_STATIONS.some((s) => s.id === stationId);
}

export type SpecialtySlot = {
  id: string;
  stationId: string;
  destination: string;
  createdAt: string;
};

export type SpecialtyDayBoard = SpecialtySlot[];
export type SpecialtyStore = Record<string, SpecialtyDayBoard>;

export type SpecialtyDestKeep = {
  date: string;
  stationId: string;
  destination: string;
  keepIds: string[];
};

export type SpecialtyCloudReconcileInput = {
  local: SpecialtyStore;
  remote: SpecialtyStore;
  deletedIds: Iterable<string>;
  destKeeps: Iterable<SpecialtyDestKeep>;
  seenRemoteIds?: Iterable<string>;
};

export type SpecialtyUpload = {
  date: string;
  slot: SpecialtySlot;
};

export type SpecialtyCloudReconcileResult = {
  next: SpecialtyStore;
  deletedIds: string[];
  destKeeps: SpecialtyDestKeep[];
  seenRemoteIds: string[];
  toDeleteRemote: string[];
  toUpload: SpecialtyUpload[];
};

export type SpecialtyConsumeResult = {
  store: SpecialtyStore;
  burnedIds: string[];
  destKeeps: SpecialtyDestKeep[];
  burned: number;
};
