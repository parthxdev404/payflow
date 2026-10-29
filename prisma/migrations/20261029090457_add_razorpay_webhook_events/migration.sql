-- CreateTable
CREATE TABLE "RazorpayWebhoookEvent" (
    "id" SERIAL NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "processAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RazorpayWebhoookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RazorpayWebhoookEvent_providerEventId_key" ON "RazorpayWebhoookEvent"("providerEventId");

-- CreateIndex
CREATE INDEX "RazorpayWebhoookEvent_eventType_createdAt_idx" ON "RazorpayWebhoookEvent"("eventType", "createdAt");
