// services/rides.service.ts
import { getCommissionRate } from "../config/commission";
import { prisma } from "../lib/prisma";

export async function createRide(args: {
  riderId: number;
  pickup: { address: string; lat: number; lng: number };
  dropoff: { address: string; lat: number; lng: number };
  distanceKm: number;
  vehicleClass: "SILVER" | "GOLD" | "PLATINUM";
}) {
  const { riderId, pickup, dropoff, distanceKm, vehicleClass } = args;

  // example pricing
  const perKm = vehicleClass === "PLATINUM" ? 10 : vehicleClass === "GOLD" ? 7 : 5;
 const estimatedPrice = parseFloat((distanceKm * perKm).toFixed(2));


const validClasses = ["SILVER", "GOLD", "PLATINUM"];
if (!validClasses.includes(vehicleClass)) {
  throw new Error("Invalid vehicle class");
}

    const commissionRate = getCommissionRate(vehicleClass);

     try {
  return  prisma.ride.create({
    data: {
      riderId,
      pickupAddress: pickup.address,
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      dropoffAddress: dropoff.address,
      dropoffLat: dropoff.lat,
      dropoffLng: dropoff.lng,
      estimatedPrice,            // Prisma Decimal column accepts number
      currency: "ETB",
      status: "REQUESTED",
      distanceKm,
      requestedClass: vehicleClass, // <-- required for your accept/assign logic
      paymentMethod: "CASH", 
      commissionRate,        // your app runs cash-only now
    },
  });
} catch (error) {
  console.error("Ride creation failed", error);
  throw new Error("Ride request could not be created");
}
}
