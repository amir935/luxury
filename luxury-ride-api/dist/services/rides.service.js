"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRide = createRide;
exports.getRideById = getRideById;
// services/rides.service.ts
const prisma_1 = require("../lib/prisma");
const client_1 = require("@prisma/client");
async function createRide(args) {
    const { riderId, pickup, dropoff, distanceKm, vehicleClass } = args;
    // Example pricing logic (replace with your quote calc if you want)
    const perKm = vehicleClass === "PLATINUM" ? 10 :
        vehicleClass === "GOLD" ? 7 : 5;
    const est = distanceKm * perKm;
    return prisma_1.prisma.ride.create({
        data: {
            riderId,
            pickupAddress: pickup.address,
            pickupLat: pickup.lat,
            pickupLng: pickup.lng,
            dropoffAddress: dropoff.address,
            dropoffLat: dropoff.lat,
            dropoffLng: dropoff.lng,
            estimatedPrice: new client_1.Prisma.Decimal(est.toFixed(2)), // or pass `${est.toFixed(2)}`
            currency: "ETB",
            status: "REQUESTED",
            distanceKm,
            requestedClass: vehicleClass, // <-- IMPORTANT: persist requested class
        },
    });
}
async function getRideById(rideId) {
    return prisma_1.prisma.ride.findUnique({
        where: { id: rideId },
        include: {
            rider: true,
            driver: true,
            vehicle: true,
        },
    });
}
