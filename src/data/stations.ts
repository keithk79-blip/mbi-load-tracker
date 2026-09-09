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

/** Misspellings / old labels that should still match the canonical dest chip. */
export const DESTINATION_ALIASES: Record<string, string> = {
  "christianson farms": "Christiansen Farms",
  resource: "Resource MGT",
};

export const STATIONS: Station[] = [
  {
    id: "chicago-heights",
    name: "Chicago Heights",
    commodities: ["Trash (MSW)"],
    destinations: ["Newton County", "Pontiac"],
    destinationsByCommodity: {
      "Trash (MSW)": ["Newton County", "Pontiac"],
    },
  },
  {
    id: "calumet",
    name: "Calumet",
    commodities: ["Trash (MSW)", "Yard Waste"],
    destinations: ["Newton County", "Pontiac", "Organix", "Willow Ranch"],
    destinationsByCommodity: {
      "Trash (MSW)": ["Newton County", "Pontiac"],
      "Yard Waste": ["Organix", "Willow Ranch"],
    },
  },
  {
    id: "apollo",
    name: "Apollo",
    commodities: ["Trash (MSW)", "Recycle", "Yard Waste"],
    destinations: [
      "Newton County",
      "Pontiac",
      "Christiansen Farms",
      "Homewood",
      "Organix",
    ],
    destinationsByCommodity: {
      "Trash (MSW)": ["Pontiac", "Newton County"],
      Recycle: ["Homewood"],
      "Yard Waste": ["Christiansen Farms", "Organix"],
    },
  },
  {
    id: "medill",
    name: "Medill",
    commodities: ["Trash (MSW)", "Yard Waste"],
    destinations: ["Newton County", "Organix", "Pontiac", "Willow Ranch"],
    destinationsByCommodity: {
      "Trash (MSW)": ["Pontiac", "Newton County"],
      "Yard Waste": ["Organix", "Willow Ranch"],
    },
  },
  {
    id: "lrs",
    name: "LRS",
    commodities: ["Trash (MSW)", "C&D", "Recycle"],
    destinations: ["Pontiac", "Ecology", "Dick's San"],
    destinationsByCommodity: {
      "Trash (MSW)": ["Pontiac"],
      Recycle: ["Dick's San"],
      "C&D": ["Ecology", "Pontiac"],
    },
  },
  {
    id: "schererville",
    name: "Schererville",
    commodities: ["Trash (MSW)", "Recycle"],
    destinations: ["Newton County", "Homewood", "County Line"],
    destinationsByCommodity: {
      "Trash (MSW)": ["Newton County", "County Line"],
      Recycle: ["Homewood"],
    },
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
      "Resource MGT",
    ],
    destinationsByCommodity: {
      "Trash (MSW)": ["Winnebago", "Pontiac"],
      "Yard Waste": ["Organix", "Thelens"],
      Recycle: ["Hodgkins", "Resource MGT"],
    },
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
    destinationsByCommodity: {
      "Trash (MSW)": ["Winnebago", "Newton County", "Dixon", "Pontiac"],
      "Yard Waste": ["Thelens", "Organix"],
      Recycle: ["Hodgkins"],
    },
  },
  {
    id: "melrose",
    name: "Melrose",
    commodities: ["Wood", "Recycle", "Trash (MSW)", "Cardboard", "Yard Waste"],
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
    destinationsByCommodity: {
      "Trash (MSW)": [
        "DeKalb",
        "Liberty",
        "Prairie Hill",
        "Covanta",
        "Rockford",
        "Zion",
      ],
      Recycle: ["Hodgkins", "Homewood"],
      "Yard Waste": ["Willow Ranch"],
      Cardboard: ["RSI"],
      Wood: [],
    },
  },
  {
    id: "liberty",
    name: "Liberty",
    commodities: ["Leachate (tanker)"],
    destinations: ["CID", "Kankakee", "Reworld", "KanSpcl", "Sun Chem"],
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
    destinationsByCommodity: {
      "Trash (MSW)": ["DeKalb", "Prairie Hill", "Rockford"],
      Recycle: ["Hodgkins", "Lake Co MRF"],
      Cardboard: ["RSI", "Resource MGT"],
    },
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
    destinationsByCommodity: {
      "Trash (MSW)": ["DeKalb", "Covanta", "Rockford", "Prairie Hill"],
      Recycle: ["Hodgkins", "RSI", "Lake Co MRF"],
      Wood: ["DeKalb"],
      Cardboard: ["Lake Co MRF", "DuPage"],
    },
  },
  {
    id: "evanston",
    name: "Evanston",
    commodities: ["Trash (MSW)"],
    destinations: ["Rockford", "DeKalb", "Zion"],
    destinationsByCommodity: {
      "Trash (MSW)": ["Rockford", "DeKalb", "Zion"],
    },
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
    destinationsByCommodity: {
      "Trash (MSW)": ["DeKalb", "Liberty", "Rockford", "Winnebago", "Prairie View"],
      Recycle: ["RSI", "Hodgkins"],
    },
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
    destinationsByCommodity: {
      Recycle: ["Groot", "Hodgkins", "Lake Co MRF"],
      "Trash (MSW)": ["DeKalb", "Rockford", "Liberty", "Zion"],
      "Yard Waste": ["Thelens", "Willow Ranch"],
    },
  },
  {
    id: "tri-state",
    name: "Tri-State",
    commodities: ["Trash (MSW)", "Tires"],
    destinations: ["Liberty", "Prairie View"],
    destinationsByCommodity: {
      "Trash (MSW)": ["Liberty", "Prairie View"],
      Tires: ["Liberty", "Prairie View"],
    },
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
    destinationsByCommodity: {
      "C&D": ["Pontiac", "Loop"],
      "Yard Waste": ["Joyce Farms"],
      Recycle: ["Hodgkins", "WCN MRF", "Homewood"],
    },
  },
  {
    id: "roscoe",
    name: "Roscoe",
    commodities: ["Trash (MSW)", "Recycle"],
    destinations: ["Rockford", "Lake Co MRF", "Hodgkins"],
    destinationsByCommodity: {
      "Trash (MSW)": ["Rockford"],
      Recycle: ["Lake Co MRF", "Hodgkins"],
    },
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
    destinations: ["Christiansen Farms"],
  },
  {
    id: "dekalb-reload",
    name: "Dekalb Reload",
    commodities: ["Trash (MSW)", "Recycle", "Yard Waste", "Cardboard"],
    destinations: ["Hodgkins", "RSI"],
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
    id: "herthside",
    name: "Hearthside",
    commodities: ["Trash (MSW)"],
    destinations: ["Newton County"],
    destinationsByCommodity: {
      "Trash (MSW)": ["Newton County"],
    },
  },
];

if (STATIONS.length !== 29) {
  throw new Error(`Expected 29 stations, got ${STATIONS.length}`);
}

export const STATION_BY_ID: Record<string, Station> = Object.fromEntries(
  STATIONS.map((station) => [station.id, station]),
);

export const STATION_BY_NAME: Record<string, Station> = Object.fromEntries(
  STATIONS.map((station) => [station.name.toLowerCase(), station]),
);
STATION_BY_NAME.herthside = STATION_BY_ID.herthside;
STATION_BY_NAME["grays lake"] = STATION_BY_ID.grayslake;

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

export function canonicalDestination(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const key = trimmed.toLowerCase().replace(/\s+/g, " ");
  return DESTINATION_ALIASES[key] ?? trimmed;
}

export function sameDestination(a: string, b: string): boolean {
  return canonicalDestination(a) === canonicalDestination(b);
}

export function destinationsFor(
  stationId: string | undefined,
  commodity?: string,
): string[] {
  if (stationId === CUSTOM_ID) return [...CUSTOM.exampleDestinations];
  const station = getStation(stationId);
  if (!station) return [];
  const key = commodity?.trim();
  if (key && station.destinationsByCommodity) {
    return station.destinationsByCommodity[key] ?? [];
  }
  return station.destinations;
}

export function resolveStationId(pickup: string, stationId?: string): string {
  if (stationId === CUSTOM_ID) return CUSTOM_ID;
  if (stationId && STATION_BY_ID[stationId]) return stationId;
  const match = STATION_BY_NAME[pickup.trim().toLowerCase()];
  return match?.id ?? CUSTOM_ID;
}
