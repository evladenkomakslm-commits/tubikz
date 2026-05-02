-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MessageType" ADD VALUE 'LOCATION';
ALTER TYPE "MessageType" ADD VALUE 'CONTACT';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ADD COLUMN     "scheduledFiredAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Message_scheduledAt_scheduledFiredAt_idx" ON "Message"("scheduledAt", "scheduledFiredAt");
