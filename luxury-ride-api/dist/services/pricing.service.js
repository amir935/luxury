"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimatePriceKm = estimatePriceKm;
function estimatePriceKm(distanceKm, vehicleClass) {
    const basePerKm = 40; // ETB
    const factor = vehicleClass === "GOLD" ? 1.3 : vehicleClass === "PLATINUM" ? 1.6 : 1.0;
    return Math.max(80, Math.round(distanceKm * basePerKm * factor)); // min fare
}
