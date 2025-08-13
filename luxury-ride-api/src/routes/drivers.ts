import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { allowRoles } from "../middleware/rbac";
import { prisma } from "../lib/prisma";
import { z } from "zod";

const router = Router();

router.post("/:userId/verify", requireAuth, allowRoles("ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const { userId } = z.object({ userId: z.string() }).parse(req.params);
  const profile = await prisma.driverProfile.update({
    where: { userId: Number(userId) },
    data: { isVerified: true }
  });
  res.json({ driver: profile });
});

router.post("/:userId/active", requireAuth, allowRoles("ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const { userId } = z.object({ userId: z.string() }).parse(req.params);
  const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
  const profile = await prisma.driverProfile.update({
    where: { userId: Number(userId) },
    data: { isActive }
  });
  res.json({ driver: profile });
});

// POST /drivers/me/location  (DRIVER)
router.post("/me/location", requireAuth, allowRoles("DRIVER"), async (req, res) => {
  const userId = (req as any).userId as number;
  const { lat, lng } = z.object({ lat: z.number(), lng: z.number() }).parse(req.body);

  const profile = await prisma.driverProfile.update({
    where: { userId },
    data: { currentLat: lat, currentLng: lng, locationUpdatedAt: new Date() }
  });

  res.json({ ok: true, driver: { id: profile.id } });
});


export default router;
