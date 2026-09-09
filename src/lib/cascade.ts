import {
  CUSTOM_ID,
  commoditiesFor,
  destinationsFor,
  getStation,
  sameDestination,
} from "../data/stations";

export type CascadeResult = {
  commodity: string;
  destination: string;
  commodityValid: boolean;
  destinationValid: boolean;
};

export function applyPickupCascade(
  stationId: string,
  commodity: string,
  destination: string,
): CascadeResult {
  if (stationId === CUSTOM_ID || !stationId) {
    return {
      commodity,
      destination,
      commodityValid: true,
      destinationValid: true,
    };
  }

  const commodities = commoditiesFor(stationId);
  const nextCommodity = !commodity || commodities.includes(commodity) ? commodity : "";
  const destinations = destinationsFor(stationId, nextCommodity);
  const commodityValid = !commodity || commodities.includes(commodity);
  const destinationValid =
    !destination ||
    destinations.some((item) => sameDestination(item, destination));

  return {
    commodity: nextCommodity,
    destination: destinationValid ? destination : "",
    commodityValid,
    destinationValid,
  };
}

export function pickupLabel(stationId: string, customPickup: string): string {
  if (stationId === CUSTOM_ID) return customPickup.trim();
  return getStation(stationId)?.name ?? customPickup.trim();
}
