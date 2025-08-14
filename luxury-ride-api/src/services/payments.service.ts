// services/payments.service.ts
import { prisma } from "../lib/prisma";
// ✅ Use the runtime Decimal class
import { Decimal } from "@prisma/client/runtime/library";

export async function settleRide(rideId: number) {
  const ride = await prisma.ride.findUnique({ where: { id: rideId } });
  if (!ride || ride.status !== "COMPLETED" || !ride.driverId) return;

  // Use Decimal (runtime) for all money math
  const fare = new Decimal((ride.finalPrice ?? ride.estimatedPrice).toString());
  const commissionRate = ride.commissionRate
    ? new Decimal(ride.commissionRate.toString())
    : new Decimal("0.15");

  const commission = fare.mul(commissionRate);
  const driverNet  = fare.sub(commission);

  await prisma.$transaction(async (tx:any) => {
    const wallet = await tx.driverWallet.upsert({
      where: { userId: ride.driverId! },
      update: {},
      create: { userId: ride.driverId!, balance: new Decimal(0) },
    });

    await tx.walletLedger.create({
      data: {
        userId: ride.driverId!,
        rideId: ride.id,
        type: "DEBIT",
        amount: commission,               // Decimal is accepted for Decimal columns
        note: "Cash ride commission",
      },
    });

    await tx.driverWallet.update({
      where: { id: wallet.id },
      data: { balance: new Decimal(wallet.balance.toString()).sub(commission) },
    });

    await tx.ride.update({
      where: { id: ride.id },
      data: {
        commissionRate,
        platformFee: commission,
        driverEarnings: driverNet,
        riderPaymentStatus: "PENDING",
        driverPayoutStatus: "PENDING",
        paidAt: null,
      },
    });
  });
}
