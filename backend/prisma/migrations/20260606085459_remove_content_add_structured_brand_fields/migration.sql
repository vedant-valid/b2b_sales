/*
  Warnings:

  - You are about to drop the column `content` on the `BrandDoc` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "BrandDoc" DROP COLUMN "content",
ADD COLUMN     "bannedWords" TEXT,
ADD COLUMN     "campaignGoals" TEXT,
ADD COLUMN     "proofPoints" TEXT,
ADD COLUMN     "targetPersonas" TEXT,
ADD COLUMN     "tone" TEXT;
