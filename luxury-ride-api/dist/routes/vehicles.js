"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const prisma_1 = require("../lib/prisma");
const router = (0, express_1.Router)();
const createVehicleSchema = zod_1.z.object({
    make: zod_1.z.string().min(1),
    model: zod_1.z.string().min(1),
    year: zod_1.z.number().int().min(1980).max(2100),
    plate: zod_1.z.string().min(2), // unique
    color: zod_1.z.string().optional(),
    class: zod_1.z.enum(["SILVER", "GOLD", "PLATINUM"]),
});
router.post("/", auth_1.requireAuth, (0, rbac_1.allowRoles)("DRIVER"), async (req, res) => {
    const userId = req.userId;
    const body = createVehicleSchema.parse(req.body);
    // Ensure driver profile exists (auto-bootstrap if missing)
    const driverProfile = await prisma_1.prisma.driverProfile.upsert({
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
    const vehicle = await prisma_1.prisma.vehicle.create({
        data: {
            driverId: driverProfile.id,
            make: body.make,
            model: body.model,
            year: body.year,
            plate: body.plate,
            color: body.color,
            class: body.class, // enum: SILVER | GOLD | PLATINUM
            isApproved: false, // admin must approve
        },
    });
    res.status(201).json({ vehicle });
});
router.post("/:vehicleId/approve", auth_1.requireAuth, (0, rbac_1.allowRoles)("ADMIN", "SUPER_ADMIN"), async (req, res) => {
    const { vehicleId } = zod_1.z.object({ vehicleId: zod_1.z.string() }).parse(req.params);
    const vehicle = await prisma_1.prisma.vehicle.update({
        where: { id: Number(vehicleId) },
        data: { isApproved: true },
    });
    res.json({ vehicle });
});
exports.default = router;
