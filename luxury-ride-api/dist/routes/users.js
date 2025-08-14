"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const prisma_1 = require("../lib/prisma");
const zod_1 = require("zod");
const router = (0, express_1.Router)();
router.get("/", auth_1.requireAuth, (0, rbac_1.allowRoles)("ADMIN", "SUPER_ADMIN"), async (_req, res) => {
    const users = await prisma_1.prisma.user.findMany({
        select: { id: true, name: true, email: true, role: true, createdAt: true }
    });
    res.json({ users });
});
const roleSchema = zod_1.z.object({ role: zod_1.z.enum(["RIDER", "DRIVER", "ADMIN", "SUPER_ADMIN"]) });
router.patch("/:id/role", auth_1.requireAuth, (0, rbac_1.allowRoles)("SUPER_ADMIN"), async (req, res) => {
    const userId = Number(req.params.id);
    const { role } = roleSchema.parse(req.body);
    const actorId = req.userId;
    if (userId === actorId) {
        const superAdmins = await prisma_1.prisma.user.count({ where: { role: "SUPER_ADMIN" } });
        if (superAdmins <= 1 && role !== "SUPER_ADMIN") {
            return res.status(400).json({ error: "Cannot remove the last SUPER_ADMIN" });
        }
    }
    const updated = await prisma_1.prisma.user.update({
        where: { id: userId },
        data: { role },
        select: { id: true, name: true, email: true, role: true }
    });
    res.json({ user: updated });
});
exports.default = router;
