-- CreateEnum
CREATE TYPE "EmailMode" AS ENUM ('AI', 'TEMPLATE');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "emailMode" "EmailMode" NOT NULL DEFAULT 'AI',
ADD COLUMN     "emailTemplateBody" TEXT,
ADD COLUMN     "emailTemplateSubject" TEXT;
