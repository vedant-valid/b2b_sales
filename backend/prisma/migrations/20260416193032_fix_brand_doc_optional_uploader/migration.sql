-- DropForeignKey
ALTER TABLE "BrandDoc" DROP CONSTRAINT "BrandDoc_uploadedById_fkey";

-- AlterTable
ALTER TABLE "BrandDoc" ALTER COLUMN "uploadedById" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "BrandDoc" ADD CONSTRAINT "BrandDoc_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
