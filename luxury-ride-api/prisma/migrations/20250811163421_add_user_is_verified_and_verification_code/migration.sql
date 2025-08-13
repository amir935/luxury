/*
  Warnings:

  - You are about to alter the column `class` on the `vehicle` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Enum(EnumId(1))`.

*/
-- DropForeignKey
ALTER TABLE `driverprofile` DROP FOREIGN KEY `DriverProfile_userId_fkey`;

-- DropForeignKey
ALTER TABLE `vehicle` DROP FOREIGN KEY `Vehicle_driverId_fkey`;

-- AlterTable
ALTER TABLE `user` ADD COLUMN `isVerified` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `vehicle` MODIFY `class` ENUM('SILVER', 'GOLD', 'PLATINUM') NOT NULL;

-- CreateTable
CREATE TABLE `VerificationCode` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `channel` VARCHAR(191) NOT NULL,
    `sentTo` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `consumed` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `VerificationCode_userId_idx`(`userId`),
    INDEX `VerificationCode_sentTo_consumed_idx`(`sentTo`, `consumed`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PasswordReset` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `channel` VARCHAR(191) NOT NULL,
    `sentTo` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `consumed` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PasswordReset_userId_idx`(`userId`),
    INDEX `PasswordReset_sentTo_consumed_idx`(`sentTo`, `consumed`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `DriverProfile_isActive_idx` ON `DriverProfile`(`isActive`);

-- CreateIndex
CREATE INDEX `DriverProfile_isVerified_idx` ON `DriverProfile`(`isVerified`);

-- CreateIndex
CREATE INDEX `Ride_status_idx` ON `Ride`(`status`);

-- CreateIndex
CREATE INDEX `Vehicle_isApproved_idx` ON `Vehicle`(`isApproved`);

-- CreateIndex
CREATE INDEX `Vehicle_class_idx` ON `Vehicle`(`class`);

-- AddForeignKey
ALTER TABLE `DriverProfile` ADD CONSTRAINT `DriverProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VerificationCode` ADD CONSTRAINT `VerificationCode_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PasswordReset` ADD CONSTRAINT `PasswordReset_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Vehicle` ADD CONSTRAINT `Vehicle_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `DriverProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `ride` RENAME INDEX `Ride_driverId_fkey` TO `Ride_driverId_idx`;

-- RenameIndex
ALTER TABLE `ride` RENAME INDEX `Ride_riderId_fkey` TO `Ride_riderId_idx`;

-- RenameIndex
ALTER TABLE `ride` RENAME INDEX `Ride_vehicleId_fkey` TO `Ride_vehicleId_idx`;

-- RenameIndex
ALTER TABLE `vehicle` RENAME INDEX `Vehicle_driverId_fkey` TO `Vehicle_driverId_idx`;
