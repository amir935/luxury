"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.settleRide = settleRide;
// services/payments.service.ts
const prisma_1 = require("../lib/prisma");
const client_1 = require("@prisma/client"); // ← get the Decimal type/ops
async function settleRide(rideId) {
    const ride = await prisma_1.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride || ride.status !== "COMPLETED" || !ride.driverId)
        return;
    // Ensure Decimal values
    const fare = ride.finalPrice
        ? new client_1.Prisma.Decimal(ride.finalPrice)
        : ride.estimatedPrice
            ? new client_1.Prisma.Decimal(ride.estimatedPrice)
            : new client_1.Prisma.Decimal(0);
    const commissionRate = ride.commissionRate
        ? new client_1.Prisma.Decimal(ride.commissionRate)
        : new client_1.Prisma.Decimal("0.15"); // 15%
    const commission = fare.mul(commissionRate); // platform earns
    const driverNet = fare.sub(commission); // driver earns
    await prisma_1.prisma.$transaction(async (tx) => {
        // upsert wallet (start at 0 if new)
        const wallet = await tx.driverWallet.upsert({
            where: { userId: ride.driverId },
            update: {},
            create: { userId: ride.driverId, balance: new client_1.Prisma.Decimal(0) },
        });
        // credit driver with net amount
        await tx.walletLedger.create({
            data: {
                userId: ride.driverId,
                rideId: ride.id,
                type: "CREDIT",
                amount: driverNet, // Decimal OK with Decimal column
                note: "Ride earnings",
            },
        });
        // update running balance
        await tx.driverWallet.update({
            where: { userId: ride.driverId },
            data: { balance: new client_1.Prisma.Decimal(wallet.balance).add(driverNet) },
        });
        // persist computed fields on the ride
        await tx.ride.update({
            where: { id: ride.id },
            data: {
                commissionRate, // Decimal
                platformFee: commission, // Decimal
                driverEarnings: driverNet, // Decimal
                riderPaymentStatus: "PAID",
                driverPayoutStatus: "PENDING",
                paidAt: new Date(),
            },
        });
    });
}
