-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "latexCode" TEXT,
ADD COLUMN     "resumeFormat" TEXT NOT NULL DEFAULT 'standard';
