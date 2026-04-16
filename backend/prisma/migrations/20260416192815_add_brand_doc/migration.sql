-- CreateTable
CREATE TABLE "BrandDoc" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "content" TEXT NOT NULL,
    "fileName" TEXT,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandDoc_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "BrandDoc" ADD CONSTRAINT "BrandDoc_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
