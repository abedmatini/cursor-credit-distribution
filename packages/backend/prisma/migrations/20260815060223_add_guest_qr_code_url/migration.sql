/*
  Warnings:

  - A unique constraint covering the columns `[qrCodeUrl]` on the table `Guest` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Guest" ADD COLUMN     "qrCodeUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Guest_qrCodeUrl_key" ON "Guest"("qrCodeUrl");
