-- DropForeignKey
ALTER TABLE `vehicle` DROP FOREIGN KEY `Vehicle_driverId_fkey`;

-- AddForeignKey
ALTER TABLE `Vehicle` ADD CONSTRAINT `Vehicle_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `DriverProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
