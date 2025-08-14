// src/routes/drivers.ts
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { allowRoles } from "../middleware/rbac";
import { prisma } from "../lib/prisma";
import { z } from "zod";

const router = Router();

const UserIdParam = z.object({ userId: z.coerce.number().int().positive() });

/** Verify driver (create profile if missing) */
router.post(
  "/:userId/verify",
  requireAuth,
  allowRoles("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      const { userId } = UserIdParam.parse(req.params);

      // Ensure the User exists (optional but clearer 404)
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return res.status(404).json({ error: "User not found" });

      const profile = await prisma.driverProfile.upsert({
        where: { userId },
        update: { isVerified: true, isActive: true },
        create: {
          userId,
          licenseNumber: `DRV-${userId}`,
          isVerified: true,
          isActive: false,
        },
      });

      return res.json({ driver: profile });
    } catch (err: any) {
      console.error("verify error:", err);
      return res.status(400).json({ error: err.message ?? "Bad request" });
    }
  }
);

/** Activate/deactivate driver (404 if no profile) */
router.post(
  "/:userId/active",
  requireAuth,
  allowRoles("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      const { userId } = UserIdParam.parse(req.params);
      const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);

      // Use updateMany to avoid throwing P2025
      const { count } = await prisma.driverProfile.updateMany({
        where: { userId },
        data: { isActive },
      });
      if (count === 0) return res.status(404).json({ error: "Driver profile not found" });

      const profile = await prisma.driverProfile.findUnique({ where: { userId } });
      return res.json({ driver: profile });
    } catch (err: any) {
      console.error("active error:", err);
      return res.status(400).json({ error: err.message ?? "Bad request" });
    }
  }
);

/** DRIVER updates live location (create profile if missing to avoid P2025) */
router.post(
  "/me/location",
  requireAuth,
  allowRoles("DRIVER"),
  async (req, res) => {
    try {
      const userId = (req as any).userId as number;
      const { lat, lng } = z.object({ lat: z.number(), lng: z.number() }).parse(req.body);

      const profile = await prisma.driverProfile.upsert({
        where: { userId },
        update: { currentLat: lat, currentLng: lng, locationUpdatedAt: new Date() },
        create: {
          userId,
          licenseNumber: `DRV-${userId}`,
          isVerified: true,  // or false if you want a separate verify step
          isActive: true,
          currentLat: lat,
          currentLng: lng,
          locationUpdatedAt: new Date(),
        },
      });

      return res.json({ ok: true, driver: { id: profile.id } });
    } catch (err: any) {
      console.error("location error:", err);
      return res.status(400).json({ error: err.message ?? "Bad request" });
    }
  }
);

export default router;
