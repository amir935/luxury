// services/payments.service.ts
import { prisma, } from "../lib/prisma";

export async function settleRide(rideId: number) {
  const ride = await prisma.ride.findUnique({ where: { id: rideId } });
  if (!ride || ride.status !== "COMPLETED" || !ride.driverId) return;

  // defaults if missing
  const commissionRate = ride.commissionRate ?? new prisma.Decimal("0.15");
  const fare = ride.finalPrice ?? ride.estimatedPrice;

  const commission = fare.mul(commissionRate);   // platform earns
  const driverNet  = fare.sub(commission);       // driver earns

  await prisma.$transaction(async (tx) => {
    // upsert wallet
    const wallet = await tx.driverWallet.upsert({
      where: { userId: ride.driverId! },
      update: {},
      create: { userId: ride.driverId!, balance: new prisma.Decimal(0)    },
    });

    // CREDIT driver (we owe driver) with driverNet
    await tx.walletLedger.create({
      data: {
        userId: ride.driverId!,
        rideId: ride.id,
        type: "CREDIT",
        amount: driverNet,
        note: "Ride earnings",
      },
    });

    // Update wallet balance
    await tx.driverWallet.update({
      where: { userId: ride.driverId! },
      data: { balance: wallet.balance.add(driverNet) },
    });

    // Store computed fields on the ride
    await tx.ride.update({
      where: { id: ride.id },
      data: {
        commissionRate,
        platformFee: commission,
        driverEarnings: driverNet,
        riderPaymentStatus: "PAID",     // if you collected cash/card
        driverPayoutStatus: "PENDING",  // driver still needs payout
        paidAt: new Date(),
      },
    });
  });
}
