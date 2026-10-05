ALTER TABLE "VisitRecord"
  ADD COLUMN "agreementTextSnapshot" TEXT,
  ADD COLUMN "signatureFileKey" TEXT,
  ADD COLUMN "photoFileKey" TEXT,
  ADD COLUMN "checkInToken" TEXT,
  ADD COLUMN "signedAt" TIMESTAMPTZ(3);

CREATE UNIQUE INDEX "VisitRecord_checkInToken_key" ON "VisitRecord"("checkInToken");
