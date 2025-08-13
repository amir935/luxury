import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { allowRoles } from "../middleware/rbac";
import { prisma } from "../lib/prisma";
import { z } from "zod";

const router = Router();

router.get("/", requireAuth, allowRoles("ADMIN", "SUPER_ADMIN"), async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true }
  });
  res.json({ users });
});

const roleSchema = z.object({ role: z.enum(["RIDER", "DRIVER", "ADMIN", "SUPER_ADMIN"]) });

router.patch("/:id/role", requireAuth, allowRoles("SUPER_ADMIN"), async (req, res) => {
  const userId = Number(req.params.id);
  const { role } = roleSchema.parse(req.body);

  const actorId = (req as any).userId as number;
  if (userId === actorId) {
    const superAdmins = await prisma.user.count({ where: { role: "SUPER_ADMIN" } });
    if (superAdmins <= 1 && role !== "SUPER_ADMIN") {
      return res.status(400).json({ error: "Cannot remove the last SUPER_ADMIN" });
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role },
    select: { id: true, name: true, email: true, role: true }
  });
  res.json({ user: updated });
});

export default router;
