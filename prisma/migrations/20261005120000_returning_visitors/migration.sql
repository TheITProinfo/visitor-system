CREATE TABLE "VisitorProfile" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phoneNumber" TEXT,
    "company" TEXT,
    "vehiclePlate" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "VisitorProfile_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "VisitRecord" ADD COLUMN "visitorProfileId" TEXT;

-- Backfill one reusable profile per normalized name + email pair. VisitRecord
-- keeps its own details as a historical snapshot for every arrival.
INSERT INTO "VisitorProfile" (
    "id", "fullName", "email", "phoneNumber", "company", "vehiclePlate", "createdAt", "updatedAt"
)
SELECT
    'vpr_' || md5(lower(btrim(latest."visitorEmail")) || '|' || lower(btrim(latest."visitorFullName"))),
    latest."visitorFullName",
    latest."visitorEmail",
    latest."visitorPhone",
    latest."visitorCompanyName",
    latest."vehicleRegistrationNumber",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT ON (lower(btrim("visitorFullName")), lower(btrim("visitorEmail")))
        "visitorFullName", "visitorEmail", "visitorPhone", "visitorCompanyName", "vehicleRegistrationNumber"
    FROM "VisitRecord"
    ORDER BY lower(btrim("visitorFullName")), lower(btrim("visitorEmail")), "checkedInAt" DESC, "id" DESC
) AS latest;

UPDATE "VisitRecord" AS visit
SET "visitorProfileId" = 'vpr_' || md5(lower(btrim(visit."visitorEmail")) || '|' || lower(btrim(visit."visitorFullName")));

ALTER TABLE "VisitRecord"
ADD CONSTRAINT "VisitRecord_visitorProfileId_fkey"
FOREIGN KEY ("visitorProfileId") REFERENCES "VisitorProfile"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "VisitorProfile_fullName_idx" ON "VisitorProfile"("fullName");
CREATE INDEX "VisitorProfile_email_idx" ON "VisitorProfile"("email");
CREATE INDEX "VisitRecord_visitorProfileId_checkedInAt_idx" ON "VisitRecord"("visitorProfileId", "checkedInAt");
