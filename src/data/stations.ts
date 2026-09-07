export type Station = {
  id: string;
  name: string;
  commodities: string[];
  destinations: string[];
  /** When set, dest chips cascade from the selected commodity. */
  destinationsByCommodity?: Record<string, string[]>;
};

export const CUSTOM_ID = "custom";

export const CUSTOM = {
  label: "Custom / Other",
  exampleCommodities: ["Leachate (tanker)"],
  exampleDestinations: ["CID", "Kankakee", "Reworld", "Other..."],
} as const;

export const STATIONS: Station[] = [
  {
    id: "chicago-heights",
    name: "Chicago Heights",
    commodities: ["Trash (MSW)"],
    destinations: ["Newton County", "Pontiac"],
  },
  {
    id: "calumet",
    name: "Calumet",
    commodities: ["Trash (MSW)", "Yard Waste"],
    destinations: ["Newton County", "Pontiac", "Organix", "Willow Ranch"],
  },
  {
    id: "apollo",
    name: "Apollo",
    commodities: ["Trash (MSW)", "Recycle", "Yard Waste"],
    destinations: [
      "Newton County",
      "Pontiac",
      "Christianson Farms",
      "Hodgkins",
      "Homewood",
      "Organix",
    ],
  },
  {
    id: "medill",
    name: "Medill",
    commodities: ["Trash (MSW)", "Recycle", "Yard Waste"],
    destinations: ["Newton County", "Organix", "Pontiac", "Willow Ranch"],
  },
  {
    id: "lrs",
    name: "LRS",
    commodities: ["Trash (MSW)", "C&D", "Recycle"],
    destinations: ["Pontiac", "Ecology", "Dick's San"],
  },
  {
    id: "schererville",
    name: "Schererville",
    commodities: ["Trash (MSW)", "Recycle"],
    destinations: ["Newton County", "Homewood", "County Line"],
  },
  {
    id: "arc",
    name: "Arc",
    commodities: ["Yard Waste", "Trash (MSW)", "Recycle"],
    destinations: [
      "Organix",
      "Winnebago",
      "Hodgkins",
      "Thelens",
      "Pontiac",
      "Resource",
    ],
  },
  {
    id: "northlake",
    name: "Northlake",
    commodities: ["Yard Waste", "Recycle", "Trash (MSW)"],
    destinations: [
      "Organix",
      "Winnebago",
      "Hodgkins",
      "Thelens",
      "Newton County",
      "Dixon",
      "Pontiac",
    ],
  },
  {
    id: "melrose",
    name: "Melrose",
    commodities: ["Wood", "Recycle", "Trash (MSW)", "Cardboard"],
    destinations: [
      "Rockford",
      "DeKalb",
      "Loop Paper",
      "Hodgkins",
      "Liberty",
      "Prairie Hill",
      "RSI",
      "Covanta",
      "Willow Ranch",
      "Zion",
      "Homewood",
    ],
  },
  {
    id: "liberty",
    name: "Liberty",
    commodities: ["Leachate (tanker)"],
    destinations: ["CID", "Kankakee", "Reworld"],
  },
  {
    id: "dekalb",
    name: "DeKalb",
    commodities: ["Leachate (tanker)"],
    destinations: ["Dekalb Sanitary", "Rochelle WWTP"],
  },
  {
    id: "prairie-hill-rfd",
    name: "Prairie Hill RFD",
    commodities: ["Leachate (tanker)", "Yard Waste"],
    destinations: [
      "Rochelle WWTP",
      "Dixon WWTP",
      "CID",
      "Dekalb Sanitary",
      "Dekalb",
    ],
  },
  {
    id: "grayslake",
    name: "GraysLake",
    commodities: ["Leachate (tanker)"],
    destinations: ["FRWRD", "CID", "Dekalb Sanitary"],
  },
  {
    id: "laraway",
    name: "Laraway",
    commodities: ["Leachate (tanker)"],
    destinations: ["CID", "Kankakee"],
  },
  {
    id: "batavia",
    name: "Batavia",
    commodities: ["Trash (MSW)", "Recycle", "Cardboard"],
    destinations: [
      "RSI",
      "DeKalb",
      "Prairie Hill",
      "Hodgkins",
      "Lake Co MRF",
      "Rockford",
      "Resource MGT",
    ],
  },
  {
    id: "elgin",
    name: "Elgin",
    commodities: ["Trash (MSW)", "Recycle", "Wood", "Cardboard"],
    destinations: [
      "DeKalb",
      "Hodgkins",
      "Covanta",
      "Rockford",
      "RSI",
      "Prairie Hill",
      "Lake Co MRF",
      "DuPage",
    ],
  },
  {
    id: "evanston",
    name: "Evanston",
    commodities: ["Trash (MSW)"],
    destinations: ["Rockford", "DeKalb", "Zion"],
  },
  {
    id: "hooker-street",
    name: "Hooker Street",
    commodities: ["Trash (MSW)", "Recycle"],
    destinations: [
      "Liberty",
      "DeKalb",
      "Rockford",
      "RSI",
      "Hodgkins",
      "Prairie View",
      "Winnebago",
    ],
  },
  {
    id: "wheeling",
    name: "Wheeling",
    commodities: ["Recycle", "Trash (MSW)", "Yard Waste"],
    destinations: [
      "Groot",
      "DeKalb",
      "Rockford",
      "Hodgkins",
      "Lake Co MRF",
      "Liberty",
      "Willow Ranch",
      "Prairie Hill",
      "Thelens",
      "Zion",
    ],
  },
  {
    id: "tri-state",
    name: "Tri-State",
    commodities: ["Trash (MSW)", "Tires"],
    destinations: ["Liberty", "Prairie View"],
  },
  {
    id: "citiwaste",
    name: "Citiwaste",
    commodities: ["Yard Waste", "Recycle", "C&D"],
    destinations: [
      "Joyce Farms",
      "Hodgkins",
      "WCN MRF",
      "Homewood",
      "Pontiac",
      "Loop",
    ],
  },
  {
    id: "roscoe",
    name: "Roscoe",
    commodities: ["Trash (MSW)", "Recycle"],
    destinations: ["Rockford", "Lake Co MRF", "Hodgkins"],
  },
  {
    id: "rockdale",
    name: "Rockdale",
    commodities: ["Recycle", "Yard Waste", "Cardboard", "Trash (MSW)"],
    destinations: [
      "Willow Ranch",
      "Hodgkins",
      "Prairie View",
      "RSI",
      "Pontiac",
      "Homewood",
    ],
  },
  {
    id: "mccook",
    name: "McCook",
    commodities: ["Trash (MSW)", "Recycle", "Yard Waste", "Cardboard"],
    destinations: ["RSI", "Hodgkins", "Homewood", "DeKalb", "CID", "Kankakee", "Rockford", "Prairie Hill", "Pontiac", "Liberty", "Newton County", "Covanta", "Loop", "Willow Ranch", "Organix"],
  },
  {
    id: "dekalb-reload",
    name: "Dekalb Reload",
    commodities: ["Trash (MSW)", "Recycle", "Yard Waste", "Cardboard"],
    destinations: ["RSI", "Hodgkins", "Homewood", "DeKalb", "CID", "Kankakee", "Rockford", "Prairie Hill", "Pontiac", "Liberty", "Newton County", "Covanta", "Loop", "Willow Ranch", "Organix"],
  },
  {
    id: "ford",
    name: "Ford",
    commodities: ["Trash (MSW)", "Recycle", "Yard Waste", "Cardboard"],
    destinations: ["RSI", "Hodgkins", "Homewood", "DeKalb", "CID", "Kankakee", "Rockford", "Prairie Hill", "Pontiac", "Liberty", "Newton County", "Covanta", "Loop", "Willow Ranch", "Organix"],
  },
  {
    id: "prairie-hill",
    name: "PrairieHill",
    commodities: ["Trash (MSW)", "Recycle", "Yard Waste", "Cardboard"],
    destinations: ["RSI", "Hodgkins", "Homewood", "DeKalb", "CID", "Kankakee", "Rockford", "Prairie Hill", "Pontiac", "Liberty", "Newton County", "Covanta", "Loop", "Willow Ranch", "Organix"],
  },
  {
    id: "hodgkins",
    name: "Hodgkins",
    commodities: ["Residual", "Glass"],
    destinations: ["Pontiac", "Liberty", "Strategic", "Resource MGT"],
    destinationsByCommodity: {
      Residual: ["Pontiac", "Liberty"],
      Glass: ["Strategic", "Resource MGT"],
    },
  },
  {
    id: "gray-tank",
    name: "Gray Tank",
    commodities: ["Leachate (tanker)"],
    destinations: ["FRWRD", "CID", "Dekalb Sanitary"],
  },
  {
    id: "herthside",
    name: "Hearthside",
    commodities: ["Trash (MSW)"],
    destinations: ["Newton County"],
    destinationsByCommodity: {
      "Trash (MSW)": ["Newton County"],
    },
  },
];

if (STATIONS.length !== 30) {
  throw new Error(`Expected 30 stations, got ${STATIONS.length}`);
}

export const STATION_BY_ID: Record<string, Station> = Object.fromEntries(
  STATIONS.map((station) => [station.id, station]),
);

export const STATION_BY_NAME: Record<string, Station> = Object.fromEntries(
  STATIONS.map((station) => [station.name.toLowerCase(), station]),
);
STATION_BY_NAME.herthside = STATION_BY_ID.herthside;

/** Shortcut chips shown before "+ more". */
export const FREQUENT_STATION_IDS = [
  "melrose",
  "liberty",
  "dekalb",
  "prairie-hill-rfd",
  "grayslake",
  "laraway",
  "rockdale",
  "northlake",
  "apollo",
  "calumet",
] as const;

export function getStation(id: string | undefined): Station | undefined {
  if (!id || id === CUSTOM_ID) return undefined;
  return STATION_BY_ID[id];
}

export function commoditiesFor(stationId: string | undefined): string[] {
  if (stationId === CUSTOM_ID) return [...CUSTOM.exampleCommodities];
  return getStation(stationId)?.commodities ?? [];
}

export function destinationsFor(
  stationId: string | undefined,
  commodity?: string,
): string[] {
  if (stationId === CUSTOM_ID) return [...CUSTOM.exampleDestinations];
  const station = getStation(stationId);
  if (!station) return [];
  const key = commodity?.trim();
  if (key && station.destinationsByCommodity?.[key]) {
    return station.destinationsByCommodity[key];
  }
  return station.destinations;
}

export function resolveStationId(pickup: string, stationId?: string): string {
  if (stationId === CUSTOM_ID) return CUSTOM_ID;
  if (stationId && STATION_BY_ID[stationId]) return stationId;
  const match = STATION_BY_NAME[pickup.trim().toLowerCase()];
  return match?.id ?? CUSTOM_ID;
}







