-- CreateEnum
CREATE TYPE "CampaignMode" AS ENUM ('OUTREACH', 'TEST');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "mode" "CampaignMode" NOT NULL DEFAULT 'OUTREACH';
