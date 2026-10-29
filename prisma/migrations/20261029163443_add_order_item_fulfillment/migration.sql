-- CreateEnum
CREATE TYPE "OrderItemStatus" AS ENUM ('PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED');

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "status" "OrderItemStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "OrderItem_vendorId_status_createdAt_idx" ON "OrderItem"("vendorId", "status", "createdAt");
