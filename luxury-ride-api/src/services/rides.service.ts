import { prisma } from "../lib/prisma";
import { estimatePriceKm } from "./pricing.service";

export async function createRide(params: {
  riderId: number;
  pickup: { address: string; lat: number; lng: number };
  dropoff: { address: string; lat: number; lng: number };
  distanceKm: number;
  vehicleClass: "SILVER"|
  "GOLD"|
  "PLATINUM"
}) {
  const estimatedPrice = estimatePriceKm(params.distanceKm, params.vehicleClass);
  return prisma.ride.create({
    data: {
      riderId: params.riderId,
      pickupAddress: params.pickup.address,
      pickupLat: params.pickup.lat,
      pickupLng: params.pickup.lng,
      dropoffAddress: params.dropoff.address,
      dropoffLat: params.dropoff.lat,
      dropoffLng: params.dropoff.lng,
      estimatedPrice,
      currency: "ETB"
    }
  });
}
