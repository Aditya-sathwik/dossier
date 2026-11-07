-- AlterTable
ALTER TABLE "OutreachContact" ADD COLUMN     "sheetName" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "OutreachPendingCompany" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL DEFAULT '',
    "contactPerson" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "sheetName" TEXT NOT NULL DEFAULT 'Sheet1',
    "source" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachPendingCompany_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutreachPendingCompany_company_idx" ON "OutreachPendingCompany"("company");

-- CreateIndex
CREATE INDEX "OutreachPendingCompany_sheetName_idx" ON "OutreachPendingCompany"("sheetName");

-- CreateIndex
CREATE INDEX "OutreachContact_sheetName_idx" ON "OutreachContact"("sheetName");
