-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "senderEmail" TEXT;

-- CreateTable
CREATE TABLE "SenderAccount" (
    "accountId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SenderAccount_pkey" PRIMARY KEY ("accountId")
);

-- CreateTable
CREATE TABLE "UserSenderAccount" (
    "userId" TEXT NOT NULL,
    "senderEmail" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSenderAccount_pkey" PRIMARY KEY ("userId","senderEmail")
);

-- CreateIndex
CREATE UNIQUE INDEX "SenderAccount_email_key" ON "SenderAccount"("email");

-- AddForeignKey
ALTER TABLE "UserSenderAccount" ADD CONSTRAINT "UserSenderAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSenderAccount" ADD CONSTRAINT "UserSenderAccount_senderEmail_fkey" FOREIGN KEY ("senderEmail") REFERENCES "SenderAccount"("email") ON DELETE CASCADE ON UPDATE CASCADE;
