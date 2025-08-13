-- DropForeignKey
ALTER TABLE `vehicle` DROP FOREIGN KEY `Vehicle_driverId_fkey`;

-- AlterTable
ALTER TABLE `driverprofile` ADD COLUMN `ratingAvg` DECIMAL(3, 2) NULL,
    ADD COLUMN `ratingCount` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `user` ADD COLUMN `avatar_url` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `vehicle` ADD COLUMN `image_url` VARCHAR(191) NULL,
    ADD COLUMN `seats` INTEGER NOT NULL DEFAULT 4;

-- AddForeignKey
ALTER TABLE `Vehicle` ADD CONSTRAINT `Vehicle_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `DriverProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
