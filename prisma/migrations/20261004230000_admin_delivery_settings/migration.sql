ALTER TABLE "CompanySettings"
    ADD COLUMN "agreementText" TEXT,
    ADD COLUMN "smtpHost" TEXT,
    ADD COLUMN "smtpPort" INTEGER,
    ADD COLUMN "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "smtpUsername" TEXT,
    ADD COLUMN "smtpPasswordEncrypted" TEXT,
    ADD COLUMN "smtpSenderName" TEXT,
    ADD COLUMN "smtpSenderEmail" TEXT,
    ADD COLUMN "printerEnabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "printerModel" TEXT,
    ADD COLUMN "printerAddress" TEXT,
    ADD COLUMN "badgeLabelWidthMm" INTEGER,
    ADD COLUMN "badgeLabelHeightMm" INTEGER;
