-- CreateEnum
CREATE TYPE "LeadEnrichmentStatus" AS ENUM ('PREVIEW', 'UNLOCKED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CampaignStatus" ADD VALUE 'AWAITING_LEAD_SELECTION';
ALTER TYPE "CampaignStatus" ADD VALUE 'READY_FOR_OUTREACH';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "enrichmentStatus" "LeadEnrichmentStatus" NOT NULL DEFAULT 'PREVIEW',
ADD COLUMN     "isEnriched" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lushaRequestId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "credits" INTEGER NOT NULL DEFAULT 100;

-- CreateTable
CREATE TABLE "LeadSelection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadSelection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadSelection_userId_leadId_key" ON "LeadSelection"("userId", "leadId");

-- AddForeignKey
ALTER TABLE "LeadSelection" ADD CONSTRAINT "LeadSelection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSelection" ADD CONSTRAINT "LeadSelection_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSelection" ADD CONSTRAINT "LeadSelection_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
