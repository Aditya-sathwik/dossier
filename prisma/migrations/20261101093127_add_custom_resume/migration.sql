-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "customResumeData" TEXT,
ADD COLUMN     "customResumeName" TEXT,
ADD COLUMN     "resumeChoice" TEXT NOT NULL DEFAULT 'tailored';
