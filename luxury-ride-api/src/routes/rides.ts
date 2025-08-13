import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { allowRoles } from "../middleware/rbac";
import { prisma } from "../lib/prisma";
import { createRide } from "../services/rides.service";
import { dispatchRide } from "../services/dispatch.service";
import { getCommissionRate } from "../config/commission";
import { Prisma } from "@prisma/client";
const router = Router();

/* ----------------------------- price quote ----------------------------- */
const quoteSchema = z.object({
  distanceKm: z.number().positive().optional(),

  pickup: z
    .object({
      lat: z.number(),
      lng: z.number(),
      address: z.string().optional(),
    })
    .optional(),

  dropoff: z
    .object({
      lat: z.number(),
      lng: z.number(),
      address: z.string().optional(),
    })
    .optional(),

  vehicleClass: z.enum(["SILVER", "GOLD", "PLATINUM"]),
}).refine(
  (v) => v.distanceKm !== undefined || (v.pickup && v.dropoff),
  {
    message: "You must provide either distanceKm or pickup+dropoff coordinates",
  }
);

// constants
const PRICES = {
  SILVER:   { perKm: 40,     perMin: 2.0,  pickupFee: 15 },
  GOLD:     { perKm: 40*1.3, perMin: 2.6,  pickupFee: 20 },
  PLATINUM: { perKm: 40*1.6, perMin: 3.2,  pickupFee: 25 },
};
const MIN_FARE = 80;

function surgeForArea() { return 1.0; } // plug in your logic

function trafficMultiplierFromETA(etaTrafficMin: number, etaFreeflowMin: number) {
  if (!etaFreeflowMin) return 1.0;
  const m = etaTrafficMin / etaFreeflowMin;
  return Math.min(Math.max(m, 1.0), 2.0);
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// (optional) stub you can later implement with Google/Mapbox
async function getRouteWithTraffic(pickup:{lat:number,lng:number}, dropoff:{lat:number,lng:number}) {
  // TODO: replace with real Directions API call:
  // return { km, etaMinTraffic, etaMinFreeflow }
  const km = haversineKm(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
  const etaMinFreeflow = (km / 32) * 60; // 32 km/h city
  const etaMinTraffic  = etaMinFreeflow * 1.25; // +25% until wired
  return { km, etaMinTraffic, etaMinFreeflow };
}

router.post("/quote", requireAuth, async (req, res) => {
  const body = quoteSchema.parse(req.body);
  const cfg = PRICES[body.vehicleClass];

  let distanceKm = body.distanceKm;
  let etaTrafficMin: number | undefined;
  let etaFreeflowMin: number | undefined;

  // Prefer routing API if coords provided
  if (!distanceKm && body.pickup && body.dropoff) {
    const r = await getRouteWithTraffic(body.pickup, body.dropoff);
    distanceKm    = r.km;
    etaTrafficMin = r.etaMinTraffic;
    etaFreeflowMin= r.etaMinFreeflow;
  }

  // If still missing, compute simple estimates
  if (distanceKm == null && body.pickup && body.dropoff) {
    distanceKm = haversineKm(body.pickup.lat, body.pickup.lng, body.dropoff.lat, body.dropoff.lng);
  }
  if (etaTrafficMin == null) {
    const ff = (distanceKm! / 32) * 60;
    etaFreeflowMin = ff;
    etaTrafficMin  = ff * 1.15;
  }

  // Multipliers
  const surge = surgeForArea();
  const trafficMult = (etaTrafficMin && etaFreeflowMin)
    ? trafficMultiplierFromETA(etaTrafficMin, etaFreeflowMin)
    : 1.0;

  // Price parts
  const distancePart = cfg.perKm  * distanceKm!;
  const timePart     = cfg.perMin * etaTrafficMin!;
  const pickupFee    = cfg.pickupFee;

  let price = (distancePart + timePart + pickupFee) * surge * trafficMult;
  price = Math.max(MIN_FARE, Math.round(price));

  res.json({
    estimatedPrice: price,
    currency: "ETB",
    distanceKm: Number(distanceKm!.toFixed(2)),
    etaMin: Math.round(etaTrafficMin!),
    surgeMultiplier: surge,
    trafficMultiplier: Number(trafficMult.toFixed(2)),
    breakdown: {
      perKm: cfg.perKm,
      perMin: cfg.perMin,
      pickupFee,
      distancePart: Math.round(distancePart),
      timePart: Math.round(timePart),
    },
  });
});


/* ------------------------------ create ride ---------------------------- */
const requestSchema = z.object({
  pickup: z.object({ address: z.string(), lat: z.number(), lng: z.number() }),
  dropoff: z.object({ address: z.string(), lat: z.number(), lng: z.number() }),
  distanceKm: z.number().positive(),
  vehicleClass: z.enum(["SILVER",
  "GOLD",
  "PLATINUM",]),
});

router.post("/", requireAuth, allowRoles("RIDER", "ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const riderId = (req as any).userId as number;
  const payload = requestSchema.parse(req.body);
  const ride = await createRide({ riderId, ...payload });
  if (process.env.AUTO_ASSIGN === "true") {
  try { await dispatchRide(ride.id, 8); } catch (e) { console.error("Auto-dispatch failed:", e); }
}
  res.status(201).json({ ride });
});

/* --------------------------- driver availability ----------------------- */
router.post("/driver/availability", requireAuth, allowRoles("DRIVER"), async (req, res) => {
  const userId = (req as any).userId as number;
  const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
  const profile = await prisma.driverProfile.update({
    where: { userId },
    data: { isActive },
  });
  res.json({ driver: profile });
});

/* ------------------------------ driver accept -------------------------- */
router.post("/:rideId/accept", requireAuth, allowRoles("DRIVER"), async (req, res) => {
  const userId = (req as any).userId as number; 
  console.log(userId);         // userId from token
  const { rideId } = z.object({ rideId: z.string() }).parse(req.params);

  // find this driver's profile (DriverProfile.userId === User.id)
  const profile = await prisma.driverProfile.findUnique({ where: { userId } });
  console.log(profile)
  if (!profile) return res.status(400).json({ error: "No driver profile" });

  // find an approved vehicle for this profile (Vehicle.driverId === DriverProfile.id)
  const vehicle = await prisma.vehicle.findFirst({
    where: { driverId: profile.id, isApproved: true },
  });
  if (!vehicle) return res.status(400).json({ error: "No approved vehicle" });

  // (optional) ensure ride is still requestable
  const ride = await prisma.ride.findUnique({ where: { id: Number(rideId) } });
  if (!ride) return res.status(404).json({ error: "Ride not found" });
  if (ride.status !== "REQUESTED") {
    return res.status(409).json({ error: `Ride is ${ride.status}, cannot accept` });
  }

  const updated = await prisma.ride.update({
    where: { id: ride.id },
    data: { driverId: userId, vehicleId: vehicle.id, status: "ACCEPTED", acceptedAt: new Date() },
  });

  res.json({ ride: updated });
});


/* ----------------------------- update status --------------------------- */
router.post("/:rideId/status", requireAuth, allowRoles("DRIVER"), async (req, res) => {
  const driverUserId = (req as any).userId as number;
  const { rideId } = z.object({ rideId: z.string() }).parse(req.params);
  const { status } = z.object({ status: z.enum(["DRIVER_ARRIVING","IN_PROGRESS","COMPLETED","CANCELED"]) }).parse(req.body);

  const ride = await prisma.ride.findUnique({
    where: { id: Number(rideId) },
    include: { vehicle: true }
  });
  if (!ride) return res.status(404).json({ error: "Ride not found" });
  if (ride.driverId !== driverUserId) return res.status(403).json({ error: "Not your ride" });

  // normal timestamps
  const now = new Date();
  const data: any = { status };
  if (status === "IN_PROGRESS") data.startedAt = now;
  if (status === "CANCELED") data.canceledAt = now;

  // when completed → compute amounts exactly once
  if (status === "COMPLETED") {
    data.completedAt = now;

    const fare = (ride.finalPrice ?? ride.estimatedPrice) as any; // Decimal
    const rate = getCommissionRate(ride.vehicle?.class as any);   // number
    const fee  = new Prisma.Decimal(fare).mul(rate);
    const driverEarnings = new Prisma.Decimal(fare).minus(fee);

    data.finalPrice    = fare; // keep final as fare
    data.commissionRate = new Prisma.Decimal(rate.toFixed(4));
    data.platformFee    = fee;
    data.driverEarnings = driverEarnings;

    // mark rider payment status (you can set method per ride when creating)
    // Here, assume CASH unless you set CARD at creation:
    const method = ride.paymentMethod; // CASH | CARD
    data.riderPaymentStatus = method === "CARD" ? "PAID" : "PENDING";
    data.paidAt = method === "CARD" ? now : null;

    // wallet effect
    // ensure driver wallet exists
    const wallet = await prisma.driverWallet.upsert({
      where: { userId: driverUserId },
      update: {},
      create: { userId: driverUserId, balance: new Prisma.Decimal(0) }
    });

    if (method === "CARD") {
      // we owe driver → CREDIT
      await prisma.$transaction([
        prisma.ride.update({ where: { id: ride.id }, data }),
        prisma.walletLedger.create({
          data: {
            userId: driverUserId,
            rideId: ride.id,
            type: "CREDIT",
            amount: driverEarnings,
            note: "Card ride earning"
          }
        }),
        prisma.driverWallet.update({
          where: { id: wallet.id },
          data: { balance: new Prisma.Decimal(wallet.balance).plus(driverEarnings) }
        })
      ]);
    } else {
      // CASH: driver owes platform commission → DEBIT
      await prisma.$transaction([
        prisma.ride.update({ where: { id: ride.id }, data }),
        prisma.walletLedger.create({
          data: {
            userId: driverUserId,
            rideId: ride.id,
            type: "DEBIT",
            amount: fee,
            note: "Cash ride commission"
          }
        }),
        prisma.driverWallet.update({
          where: { id: wallet.id },
          data: { balance: new Prisma.Decimal(wallet.balance).minus(fee) }
        })
      ]);
    }

    const updated = await prisma.ride.findUnique({ where: { id: ride.id } });
    return res.json({ ride: updated });
  }

  const updated = await prisma.ride.update({ where: { id: ride.id }, data });
  res.json({ ride: updated });
});



/* --------------------------- ADMIN assign driver ----------------------- */
/** NOTE: path fixed to avoid /rides/rides/... when mounted at /rides */
router.post("/:rideId/assign", requireAuth, allowRoles("ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const { rideId } = z.object({ rideId: z.string() }).parse(req.params);
  const { driverId, radiusKm = 8 } = z
    .object({ driverId: z.number().optional(), radiusKm: z.number().optional() })
    .parse(req.body);

  const ride = await prisma.ride.findUnique({ where: { id: Number(rideId) } });
  if (!ride || ride.status !== "REQUESTED") {
    return res.status(400).json({ error: "Ride not in REQUESTED state" });
  }

  let targetDriverUserId = driverId;

  if (!targetDriverUserId) {
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

    const toRad = (d: number) => (d * Math.PI) / 180,
      R = 6371;
    const distKm = (aLat: number, aLng: number, bLat: number, bLng: number) => {
      const dLat = toRad(bLat - aLat),
        dLng = toRad(bLng - aLng);
      const s =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(s));
    };

    const list = candidates
      .map((c) => ({
        driverUserId: c.userId,
        vehicleId: c.vehicles[0]?.id,
        km: distKm(ride.pickupLat, ride.pickupLng, c.currentLat!, c.currentLng!),
      }))
      .filter((x) => x.vehicleId)
      .filter((x) => x.km <= radiusKm)
      .sort((a, b) => a.km - b.km);

    if (!list.length) return res.status(404).json({ error: "No nearby available drivers" });
    targetDriverUserId = list[0].driverUserId;
  }

  const vehicle = await prisma.vehicle.findFirst({
    where: { driver: { userId: targetDriverUserId! }, isApproved: true },
  });
  if (!vehicle) return res.status(400).json({ error: "Driver has no approved vehicle" });

  const updated = await prisma.ride.update({
    where: { id: ride!.id },
    data: {
      driverId: targetDriverUserId!,
      vehicleId: vehicle.id,
      status: "ASSIGNED",
      acceptedAt: new Date(),
    },
    include: { driver: true, vehicle: true },
  });

  res.json({ ride: updated });
});

/* -------------------------------- cancel ------------------------------- */
router.post("/:rideId/cancel", requireAuth, allowRoles("RIDER"), async (req, res) => {
  const { rideId } = z.object({ rideId: z.string() }).parse(req.params);
  const ride = await prisma.ride.update({
    where: { id: Number(rideId) },
    data: { status: "CANCELED", canceledAt: new Date() },
  });
  res.json({ ride });
});

/* ----------------------------- rider history --------------------------- */
/** Returns your JSON-like shape with driver block, pagination & sorting */
router.get("/history", requireAuth, allowRoles("RIDER"), async (req, res) => {
  const riderId = (req as any).userId as number;
  const { limit = "20", offset = "0", q, sort = "created_at", order = "desc" } =
    req.query as Record<string, string>;

  const take = Math.max(1, Math.min(100, Number(limit) || 20));
  const skip = Math.max(0, Number(offset) || 0);

  const where = {
    riderId,
    ...(q && q.trim()
      ? {
          OR: [
            { pickupAddress: { contains: q, mode: "insensitive" as const } },
            { dropoffAddress: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const orderBy =
    sort === "fare"
      ? [{ finalPrice: order as any }, { estimatedPrice: order as any }]
      : sort === "time"
      ? [{ startedAt: order as any }]
      : [{ requestedAt: order as any }];

  const [total, rides] = await Promise.all([
    prisma.ride.count({ where }),
    prisma.ride.findMany({
      where,
      orderBy,
      take,
      skip,
      include: { driver: true, vehicle: true },
    }),
  ]);

  const items = rides.map((r) => {
    const ride_time =
      r.startedAt && r.completedAt
        ? Math.round((r.completedAt.getTime() - r.startedAt.getTime()) / 60000)
        : null;

    const payment_status = r.status === "COMPLETED" ? "paid" : "unpaid";

    const full = r.driver?.name ?? "";
    const [first_name = "Driver", ...rest] = full.split(" ");
    const last_name = rest.join(" ");

    return {
      ride_id: String(r.id),
      origin_address: r.pickupAddress,
      destination_address: r.dropoffAddress,
      origin_latitude: String(r.pickupLat),
      origin_longitude: String(r.pickupLng),
      destination_latitude: String(r.dropoffLat),
      destination_longitude: String(r.dropoffLng),
      ride_time,
      fare_price: (r.finalPrice ?? r.estimatedPrice).toString(),
      payment_status,
      driver_id: r.driverId ?? null,
      user_id: String(r.riderId),
      created_at: r.requestedAt.toISOString(),
      driver: r.driverId
        ? {
            driver_id: String(r.driverId),
            first_name,
            last_name,
            profile_image_url: null, // fill when you add this column
            car_image_url: null, // e.g. from r.vehicle?.imageUrl
            car_seats: r.vehicle ? 4 : null, // add seats to Vehicle if you want exact
            rating: null, // fill when you store ratings
          }
        : null,
    };
  });

  res.json({ total, limit: take, offset: skip, items });
});

/* ----------------------------- driver history -------------------------- */
router.get(
  "/driver/history",
  requireAuth,
  allowRoles("DRIVER"),
  async (req, res) => {
    const driverId = (req as any).userId as number;
    const {
      limit = "20",
      offset = "0",
      q,
      sort = "created_at",      // "created_at" | "fare" | "time"
      order = "desc",           // "asc" | "desc"
      status,                   // optional: filter by RideStatus
    } = req.query as Record<string, string>;

    const take = Math.max(1, Math.min(100, Number(limit) || 20));
    const skip = Math.max(0, Number(offset) || 0);

    const where = {
      driverId,
      ...(status ? { status: status as any } : {}),
      ...(q && q.trim()
        ? {
            OR: [
              { pickupAddress: { contains: q, mode: "insensitive" as const } },
              { dropoffAddress: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const orderBy =
      sort === "fare"
        ? [{ finalPrice: order as any }, { estimatedPrice: order as any }]
        : sort === "time"
        ? [{ startedAt: order as any }]
        : [{ requestedAt: order as any }];

    const [total, rides] = await Promise.all([
      prisma.ride.count({ where }),
      prisma.ride.findMany({
        where,
        orderBy,
        take,
        skip,
        include: {
  vehicle: true,
  rider: { select: { id: true, name: true } }, // keep lean; add avatarUrl back after migration
},

      }),
    ]);

    const items = rides.map((r) => {
      const ride_time =
        r.startedAt && r.completedAt
          ? Math.round((r.completedAt.getTime() - r.startedAt.getTime()) / 60000)
          : null;

      return {
        ride_id: String(r.id),
        origin_address: r.pickupAddress,
        destination_address: r.dropoffAddress,
        origin_latitude: String(r.pickupLat),
        origin_longitude: String(r.pickupLng),
        destination_latitude: String(r.dropoffLat),
        destination_longitude: String(r.dropoffLng),
        ride_time,
        fare_price: (r.finalPrice ?? r.estimatedPrice).toString(),
        payment_status: r.status === "COMPLETED" ? "paid" : "unpaid",
        status: r.status,
        user_id: String(r.riderId),
        created_at: r.requestedAt.toISOString(),

        // Rider snippet (useful in driver app)
        rider: r.rider
  ? {
      rider_id: String(r.rider.id),
      name: r.rider.name,
      profile_image_url: (r.rider as any)?.avatarUrl ?? null, // safe until types are fresh
    }
  : null,


        // Vehicle snippet (image/seats require the columns you added)
        vehicle: r.vehicle
          ? {
              id: r.vehicle.id,
              make: r.vehicle.make,
              model: r.vehicle.model,
              plate: r.vehicle.plate,
              class: r.vehicle.class,
              seats: r.vehicle.seats,
              image_url: r.vehicle.imageUrl ?? null,
            }
          : null,
      };
    });

    res.json({ total, limit: take, offset: skip, items });
  }
);


// POST /rides/seed/history  (ADMIN, SUPER_ADMIN)
// Body: the exact array you pasted
// router.post(
//   "/seed/history",
//   requireAuth,
//   allowRoles("ADMIN", "SUPER_ADMIN"),
//   async (req, res) => {
//     // shape of the incoming items
//     const RideItem = z.object({
//       ride_id: z.string(),
//       origin_address: z.string(),
//       destination_address: z.string(),
//       origin_latitude: z.string(),
//       origin_longitude: z.string(),
//       destination_latitude: z.string(),
//       destination_longitude: z.string(),
//       ride_time: z.number(),
//       fare_price: z.string(),
//       payment_status: z.string(),
//       driver_id: z.union([z.string(), z.number()]),
//       user_id: z.string(),
//       created_at: z.string(),
//       driver: z.object({
//         driver_id: z.string(),
//         first_name: z.string(),
//         last_name: z.string(),
//         profile_image_url: z.string().optional().nullable(),
//         car_image_url: z.string().optional().nullable(),
//         car_seats: z.number().optional().nullable(),
//         rating: z.string().optional().nullable(),
//       }),
//     });

//     const data = z.array(RideItem).parse(req.body);

//     const results: Array<{ srcRideId: string; rideDbId: number }> = [];
//     for (const item of data) {
//       const riderId = Number(item.user_id);
//       const driverUserId = Number(item.driver_id);

//       // 1) Ensure Rider user exists (id = user_id from JSON)
//       await prisma.user.upsert({
//         where: { id: riderId },
//         update: {},
//         create: {
//           id: riderId,                 // explicit id is okay with MySQL autoincrement
//           name: `Seed Rider ${riderId}`,
//           role: "RIDER",
//           isVerified: true,
//         },
//       });

//       // 2) Ensure Driver user + profile exist
//       const driverName = `${item.driver.first_name} ${item.driver.last_name}`.trim();
//       await prisma.user.upsert({
//         where: { id: driverUserId },
//         update: { name: driverName, avatarUrl: item.driver.profile_image_url ?? undefined, role: "DRIVER" },
//         create: {
//           id: driverUserId,
//           name: driverName,
//           role: "DRIVER",
//           avatarUrl: item.driver.profile_image_url ?? null,
//           isVerified: true,
//         },
//       });

//       const ratingAvg = item.driver.rating ? item.driver.rating : null;
//       const driverProfile = await prisma.driverProfile.upsert({
//   where: { userId: driverUserId },
//   update: {
//     isVerified: true,
//     isActive: true,
//     ...(ratingAvg ? { ratingAvg: ratingAvg as any, ratingCount: 25 } : {}),
//   } as any,
//   create: {
//     userId: driverUserId,
//     licenseNumber: `SEED-${driverUserId}`,
//     isVerified: true,
//     isActive: true,
//     ...(ratingAvg
//       ? { ratingAvg: ratingAvg as any, ratingCount: 25 }
//       : { ratingAvg: null as any, ratingCount: 0 }),
//   } as any,
// });

//       // 3) Ensure a Vehicle exists for the driver (minimal required fields)
//       //    NOTE: adjust if you changed schema; this assumes you added Vehicle.imageUrl & seats
//       const seedPlate = `SEED-${driverUserId}-${item.ride_id}`;
//       const vehicle = await prisma.vehicle.upsert({
//         where: { plate: seedPlate },         // plate is unique
//         update: {},
//         create: {
//           driverId: driverProfile.id,        // relation uses DriverProfile.id
//           make: "Seed",
//           model: "Sedan",
//           year: 2022,
//           plate: seedPlate,
//           color: "Black",
//           class: "SILVER",                   // Prisma enum VehicleClass
//           isApproved: true,
//           imageUrl: item.driver.car_image_url ?? null, // if you added this column
//           seats: item.driver.car_seats ?? 4,           // if you added this column
//         },
//       });

//       // 4) Create the Ride as COMPLETED (map fields)
//       const requestedAt = new Date(item.created_at.replace(" ", "T")); // make it ISO-ish
//       const acceptedAt  = new Date(requestedAt.getTime() + 30 * 1000);
//       const startedAt   = new Date(requestedAt.getTime() + 60 * 1000);
//       const completedAt = new Date(startedAt.getTime() + item.ride_time * 60 * 1000);

//       const ride = await prisma.ride.create({
//         data: {
//           riderId,
//           driverId: driverUserId,
//           vehicleId: vehicle.id,
//           status: "COMPLETED",

//           pickupAddress: item.origin_address,
//           pickupLat: parseFloat(item.origin_latitude),
//           pickupLng: parseFloat(item.origin_longitude),

//           dropoffAddress: item.destination_address,
//           dropoffLat: parseFloat(item.destination_latitude),
//           dropoffLng: parseFloat(item.destination_longitude),

//           estimatedPrice: item.fare_price,   // Prisma accepts string for Decimal
//           finalPrice: item.fare_price,
//           currency: "ETB",

//           requestedAt,
//           acceptedAt,
//           startedAt,
//           completedAt,
//         },
//       });

//       results.push({ srcRideId: item.ride_id, rideDbId: ride.id });
//     }

//     res.json({ ok: true, inserted: results.length, results });
//   }
// );


/* ------------------------------- get one ------------------------------- */
router.get("/:id", requireAuth, async (req, res) => {
  const { id } = z.object({ id: z.string() }).parse(req.params);
  const ride = await prisma.ride.findUnique({
    where: { id: Number(id) },
    include: { driver: true, vehicle: true },
  });
  if (!ride) return res.status(404).json({ error: "Ride not found" });
  res.json({ ride });
});

/* -------------------------- basic lists (old) -------------------------- */
router.get("/me", requireAuth, allowRoles("RIDER"), async (req, res) => {
  const riderId = (req as any).userId as number;
  const rides = await prisma.ride.findMany({
    where: { riderId },
    orderBy: { id: "desc" },
  });
  res.json({ rides });
});

router.get("/driver/me", requireAuth, allowRoles("DRIVER"), async (req, res) => {
  const driverId = (req as any).userId as number;
  const rides = await prisma.ride.findMany({
    where: { driverId },
    orderBy: { id: "desc" },
  });
  res.json({ rides });
});


// GET /rides/history/formatted
// Rider’s history in the exact JSON you requested
router.get(
  "/seed/history",
  requireAuth,
  allowRoles("RIDER", "ADMIN", "SUPER_ADMIN"),
  async (req: any, res) => {
    const { limit = "20", offset = "0", userId } = req.query as Record<string, string>;

    // which rider’s history?
    const riderId = userId
      ? Number(userId)                       // admin/super can pass ?userId=#
      : (req.userRole === "RIDER" ? req.userId : undefined);

    if (!riderId) {
      return res.status(400).json({ error: "Missing riderId (for admins) or not a rider." });
    }

    const take = Math.max(1, Math.min(100, Number(limit) || 20));
    const skip = Math.max(0, Number(offset) || 0);

    const [total, rides] = await Promise.all([
      prisma.ride.count({ where: { riderId } }),
      prisma.ride.findMany({
        where: { riderId },
        orderBy: { requestedAt: "desc" },
        take,
        skip,
        include: {
          driver: { select: { id: true, name: true, avatarUrl: true } }, // User (driver)
          vehicle: { select: { id: true, make: true, model: true, plate: true, seats: true, imageUrl: true, class: true } },
        },
      }),
    ]);

    // get ratings (DriverProfile.ratingAvg) in one go
    const driverIds = Array.from(new Set(rides.map(r => r.driverId).filter(Boolean))) as number[];
    const profiles = await prisma.driverProfile.findMany({
      where: { userId: { in: driverIds } },
      select: { userId: true, ratingAvg: true },
    });
    const ratingMap = new Map<number, string | null>();
    profiles.forEach(p => ratingMap.set(p.userId, p.ratingAvg ? p.ratingAvg.toString() : null));

    const fmtTime = (dt: Date) => {
      const pad = (n: number, w = 2) => String(n).padStart(w, "0");
      const y = dt.getFullYear();
      const m = pad(dt.getMonth() + 1);
      const d = pad(dt.getDate());
      const H = pad(dt.getHours());
      const M = pad(dt.getMinutes());
      const S = pad(dt.getSeconds());
      const ms = String(dt.getMilliseconds()).padStart(3, "0") + "000"; // 6 digits
      return `${y}-${m}-${d} ${H}:${M}:${S}.${ms}`;
    };

    const items = rides.map((r) => {
      const ride_time =
        r.startedAt && r.completedAt
          ? Math.round((r.completedAt.getTime() - r.startedAt.getTime()) / 60000)
          : 0;

      const driverName = r.driver?.name ?? "";
      const [first_name = "Driver", ...rest] = driverName.split(" ");
      const last_name = rest.join(" ");

      return {
        ride_id: String(r.id),
        origin_address: r.pickupAddress,
        destination_address: r.dropoffAddress,
        origin_latitude: String(r.pickupLat),
        origin_longitude: String(r.pickupLng),
        destination_latitude: String(r.dropoffLat),
        destination_longitude: String(r.dropoffLng),
        ride_time,
        fare_price: (r.finalPrice ?? r.estimatedPrice).toString(),
        payment_status: r.status === "COMPLETED" ? "paid" : "unpaid",
        driver_id: r.driverId ?? null,
        user_id: String(r.riderId),
        created_at: fmtTime(r.requestedAt),
        driver: r.driverId
          ? {
              driver_id: String(r.driverId),
              first_name,
              last_name,
              profile_image_url: r.driver?.avatarUrl ?? null,
              car_image_url: r.vehicle?.imageUrl ?? null,
              car_seats: r.vehicle?.seats ?? null,
              rating: ratingMap.get(r.driverId) ?? null,
            }
          : null,
      };
    });

    res.json({ total, limit: take, offset: skip, items });
  }
);


export default router;
