// prisma/seed.ts
import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcrypt";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

type RideJson = {
  ride_id: string;
  origin_address: string;
  destination_address: string;
  origin_latitude: string;
  origin_longitude: string;
  destination_latitude: string;
  destination_longitude: string;
  ride_time: number;
  fare_price: string;
  payment_status: string;
  driver_id: number | string;
  user_id: string;
  created_at: string;
  driver: {
    driver_id: string;
    first_name: string;
    last_name: string;
    profile_image_url?: string | null;
    car_image_url?: string | null;
    car_seats?: number | null;
    rating?: string | null;
  };
};

async function seedAdmin() {
  const email = "owner@luxuryride.et";
  const found = await prisma.user.findUnique({ where: { email } });
  if (!found) {
    const passwordHash = await bcrypt.hash("ChangeMe123!", 10);
    await prisma.user.create({
      data: { name: "Platform Owner", email, passwordHash, role: "SUPER_ADMIN" },
    });
    console.log("✅ Seeded SUPER_ADMIN:", email);
  } else {
    console.log("ℹ️  SUPER_ADMIN already exists:", email);
  }
}

async function seedRides() {
  const file = path.join(process.cwd(), "prisma", "rides.json");
  const raw = fs.readFileSync(file, "utf8");
  const rides: RideJson[] = JSON.parse(raw);

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
        ratingAvg: item.driver.rating ? new Prisma.Decimal(item.driver.rating) : undefined,
        ratingCount: item.driver.rating ? 25 : undefined,
      },
      create: {
        userId: driverUserId,
        licenseNumber: `SEED-${driverUserId}`,
        isVerified: true,
        isActive: true,
        ratingAvg: item.driver.rating ? new Prisma.Decimal(item.driver.rating) : null,
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
