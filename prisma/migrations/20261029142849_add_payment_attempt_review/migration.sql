-- AlterTable
ALTER TABLE "PaymentAttempt" ADD COLUMN     "needsReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewReason" VARCHAR(500);
