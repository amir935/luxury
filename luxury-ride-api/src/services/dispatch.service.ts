// services/dispatch.service.ts
import { prisma } from "../lib/prisma";

export async function dispatchRide(rideId: number, radiusKm = 8) {
  const ride = await prisma.ride.findUnique({ where: { id: rideId } });
  if (!ride || ride.status !== "REQUESTED") return null;

  const candidates = await prisma.driverProfile.findMany({
    where: {
      isActive: true,
      isVerified: true,
      currentLat: { not: null },
      currentLng: { not: null },
      vehicles: { some: { isApproved: true } },
    },
    include: { vehicles: { where: { isApproved: true }, take: 1 } },
  });

  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const distKm = (aLat: number, aLng: number, bLat: number, bLng: number) => {
    const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  };

  const list = candidates
    .map(c => ({
      driverUserId: c.userId,
      vehicleId: c.vehicles[0]?.id,
      km: distKm(ride.pickupLat, ride.pickupLng, c.currentLat!, c.currentLng!)
    }))
    .filter(x => x.vehicleId)
    .filter(x => x.km <= radiusKm)
    .sort((a, b) => a.km - b.km);

  if (!list.length) return null;

  const chosen = list[0];
  return prisma.ride.update({
    where: { id: rideId },
    data: {
      driverId: chosen.driverUserId,
      vehicleId: chosen.vehicleId!,
      status: "ASSIGNED",
      acceptedAt: new Date(),
    },
  });
}
