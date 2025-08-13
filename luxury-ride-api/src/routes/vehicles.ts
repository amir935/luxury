import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { allowRoles } from "../middleware/rbac";
import { prisma } from "../lib/prisma";

const router = Router();

const createVehicleSchema = z.object({
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().min(1980).max(2100),
  plate: z.string().min(2),            // unique
  color: z.string().optional(),
  class: z.enum(["SILVER", "GOLD", "PLATINUM"]),
});

router.post("/", requireAuth, allowRoles("DRIVER"), async (req: any, res) => {
  const userId = req.userId as number;
  const body = createVehicleSchema.parse(req.body);

  // Ensure driver profile exists (auto-bootstrap if missing)
  const driverProfile = await prisma.driverProfile.upsert({
    where: { userId },
    update: {}, // no-op
    create: {
      userId,
      licenseNumber: `PENDING-${userId}`, // you can later update/verify
      isVerified: false,
      isActive: false,
    },
  });

  // Create the vehicle linked to DriverProfile.id (NOT User.id)
  const vehicle = await prisma.vehicle.create({
    data: {
      driverId: driverProfile.id,
      make: body.make,
      model: body.model,
      year: body.year,
      plate: body.plate,
      color: body.color,
      class: body.class,        // enum: SILVER | GOLD | PLATINUM
      isApproved: false,        // admin must approve
    },
  });

  res.status(201).json({ vehicle });
});

router.post("/:vehicleId/approve", requireAuth, allowRoles("ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const { vehicleId } = z.object({ vehicleId: z.string() }).parse(req.params);
  const vehicle = await prisma.vehicle.update({
    where: { id: Number(vehicleId) },
    data: { isApproved: true },
  });
  res.json({ vehicle });
});

export default router;
