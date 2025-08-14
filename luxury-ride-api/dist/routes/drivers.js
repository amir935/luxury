"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/drivers.ts
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const prisma_1 = require("../lib/prisma");
const zod_1 = require("zod");
const router = (0, express_1.Router)();
const UserIdParam = zod_1.z.object({ userId: zod_1.z.coerce.number().int().positive() });
/** Verify driver (create profile if missing) */
router.post("/:userId/verify", auth_1.requireAuth, (0, rbac_1.allowRoles)("ADMIN", "SUPER_ADMIN"), async (req, res) => {
    try {
        const { userId } = UserIdParam.parse(req.params);
        // Ensure the User exists (optional but clearer 404)
        const user = await prisma_1.prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            return res.status(404).json({ error: "User not found" });
        const profile = await prisma_1.prisma.driverProfile.upsert({
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
    }
    catch (err) {
        console.error("verify error:", err);
        return res.status(400).json({ error: err.message ?? "Bad request" });
    }
});
/** Activate/deactivate driver (404 if no profile) */
router.post("/:userId/active", auth_1.requireAuth, (0, rbac_1.allowRoles)("ADMIN", "SUPER_ADMIN"), async (req, res) => {
    try {
        const { userId } = UserIdParam.parse(req.params);
        const { isActive } = zod_1.z.object({ isActive: zod_1.z.boolean() }).parse(req.body);
        // Use updateMany to avoid throwing P2025
        const { count } = await prisma_1.prisma.driverProfile.updateMany({
            where: { userId },
            data: { isActive },
        });
        if (count === 0)
            return res.status(404).json({ error: "Driver profile not found" });
        const profile = await prisma_1.prisma.driverProfile.findUnique({ where: { userId } });
        return res.json({ driver: profile });
    }
    catch (err) {
        console.error("active error:", err);
        return res.status(400).json({ error: err.message ?? "Bad request" });
    }
});
/** DRIVER updates live location (create profile if missing to avoid P2025) */
router.post("/me/location", auth_1.requireAuth, (0, rbac_1.allowRoles)("DRIVER"), async (req, res) => {
    try {
        const userId = req.userId;
        const { lat, lng } = zod_1.z.object({ lat: zod_1.z.number(), lng: zod_1.z.number() }).parse(req.body);
        const profile = await prisma_1.prisma.driverProfile.upsert({
            where: { userId },
            update: { currentLat: lat, currentLng: lng, locationUpdatedAt: new Date() },
            create: {
                userId,
                licenseNumber: `DRV-${userId}`,
                isVerified: true, // or false if you want a separate verify step
                isActive: true,
                currentLat: lat,
                currentLng: lng,
                locationUpdatedAt: new Date(),
            },
        });
        return res.json({ ok: true, driver: { id: profile.id } });
    }
    catch (err) {
        console.error("location error:", err);
        return res.status(400).json({ error: err.message ?? "Bad request" });
    }
});
exports.default = router;
