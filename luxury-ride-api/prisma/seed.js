"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// prisma/seed.ts
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const prisma = new client_1.PrismaClient();
async function seedAdmin() {
    const email = "owner@luxuryride.et";
    const found = await prisma.user.findUnique({ where: { email } });
    if (!found) {
        const passwordHash = await bcrypt_1.default.hash("ChangeMe123!", 10);
        await prisma.user.create({
            data: { name: "Platform Owner", email, passwordHash, role: "SUPER_ADMIN" },
        });
        console.log("✅ Seeded SUPER_ADMIN:", email);
    }
    else {
        console.log("ℹ️  SUPER_ADMIN already exists:", email);
    }
}
async function seedRides() {
    const file = path_1.default.join(process.cwd(), "prisma", "rides.json");
    const raw = fs_1.default.readFileSync(file, "utf8");
     if (!fs_1.default.existsSync(file)) {
    console.log("ℹ️  Skipping rides seeding: file not found at", file);
    return;
  }
    const rides = JSON.parse(raw);
    for (const item of rides) {
        const riderUserId = Number(item.user_id);
        const driverUserId = Number(item.driver_id);
        // 1) Ensure Rider user exists
        await prisma.user.upsert({
            where: { id: riderUserId },
            update: {},
            create: {
                id: riderUserId,
                name: `Seed Rider ${riderUserId}`,
                role: "RIDER",
                isVerified: true,
            },
        });
        // 2) Ensure Driver user + profile exist
        const driverName = `${item.driver.first_name} ${item.driver.last_name}`.trim();
        await prisma.user.upsert({
            where: { id: driverUserId },
            update: {
                name: driverName,
                avatarUrl: item.driver.profile_image_url ?? undefined,
                role: "DRIVER",
                isVerified: true,
            },
            create: {
                id: driverUserId,
                name: driverName,
                role: "DRIVER",
                avatarUrl: item.driver.profile_image_url ?? null,
                isVerified: true,
            },
        });
        const driverProfile = await prisma.driverProfile.upsert({
            where: { userId: driverUserId },
            update: {
                isVerified: true,
                isActive: true,
                ratingAvg: item.driver.rating ? new client_1.Prisma.Decimal(item.driver.rating) : undefined,
                ratingCount: item.driver.rating ? 25 : undefined,
            },
            create: {
                userId: driverUserId,
                licenseNumber: `SEED-${driverUserId}`,
                isVerified: true,
                isActive: true,
                ratingAvg: item.driver.rating ? new client_1.Prisma.Decimal(item.driver.rating) : null,
                ratingCount: item.driver.rating ? 25 : 0,
            },
        });
        // 3) Ensure a Vehicle for this driverProfile
        const plate = `SEED-${driverUserId}`; // plate is unique – good for connectOrCreate
        const vehicle = await prisma.vehicle.upsert({
            where: { plate },
            update: {},
            create: {
                driverId: driverProfile.id, // IMPORTANT: this is DriverProfile.id
                make: "Seed",
                model: "Sedan",
                year: 2022,
                plate,
                color: "Black",
                class: "SILVER",
                isApproved: true,
                imageUrl: item.driver.car_image_url ?? null,
                seats: item.driver.car_seats ?? 4,
            },
        });
        // 4) Create the Ride (mark as COMPLETED using created_at + ride_time)
        const requestedAt = new Date(item.created_at.replace(" ", "T"));
        const acceptedAt = new Date(requestedAt.getTime() + 30 * 1000);
        const startedAt = new Date(requestedAt.getTime() + 60 * 1000);
        const completedAt = new Date(startedAt.getTime() + item.ride_time * 60 * 1000);
        await prisma.ride.create({
            data: {
                riderId: riderUserId,
                driverId: driverUserId,
                vehicleId: vehicle.id,
                status: "COMPLETED",
                pickupAddress: item.origin_address,
                pickupLat: parseFloat(item.origin_latitude),
                pickupLng: parseFloat(item.origin_longitude),
                dropoffAddress: item.destination_address,
                dropoffLat: parseFloat(item.destination_latitude),
                dropoffLng: parseFloat(item.destination_longitude),
                estimatedPrice: item.fare_price, // string → Decimal OK
                finalPrice: item.fare_price,
                currency: "ETB",
                requestedAt,
                acceptedAt,
                startedAt,
                completedAt,
            },
        });
        console.log(`✅ Inserted ride ${item.ride_id} (DB rider=${riderUserId}, driver=${driverUserId})`);
    }
}
async function main() {
    await seedAdmin();
    await seedRides();
}
main()
    .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
