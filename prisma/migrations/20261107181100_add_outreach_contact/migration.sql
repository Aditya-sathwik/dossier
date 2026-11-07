-- CreateEnum
CREATE TYPE "OutreachStatus" AS ENUM ('NEW', 'QUEUED', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "OutreachContact" (
    "id" TEXT NOT NULL,
    "email" CITEXT NOT NULL,
    "company" TEXT NOT NULL DEFAULT '',
    "contactPerson" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT '',
    "status" "OutreachStatus" NOT NULL DEFAULT 'NEW',
    "sentAt" TIMESTAMP(3),
    "gmailThreadId" TEXT,
    "lastError" TEXT,
    "applicationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OutreachContact_email_key" ON "OutreachContact"("email");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachContact_applicationId_key" ON "OutreachContact"("applicationId");

-- CreateIndex
CREATE INDEX "OutreachContact_status_idx" ON "OutreachContact"("status");

-- CreateIndex
CREATE INDEX "OutreachContact_company_idx" ON "OutreachContact"("company");

-- AddForeignKey
ALTER TABLE "OutreachContact" ADD CONSTRAINT "OutreachContact_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;
