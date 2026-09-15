/** Walking-floor / specialty load board (day-scoped open slots). */

import { destinationsFor } from "../data/stations";
import { tallyLabel } from "./commodity";
import { isValidISODate } from "./chicagoDate";
import {
  CUSTOM_SPECIALTY_DEFAULT_NAMES,
  customSpecialtyLaneChips,
  isCustomSpecialtyCommodity,
  isCustomSpecialtyId,
  lookupCustomSpecialtyIdByName,
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
