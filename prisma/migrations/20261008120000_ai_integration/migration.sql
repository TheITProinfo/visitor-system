CREATE TYPE "AiProvider" AS ENUM ('OPENAI', 'AZURE_OPENAI');
CREATE TYPE "AiReportCadence" AS ENUM ('DAILY', 'WEEKLY');
CREATE TYPE "AiReportDeliveryStatus" AS ENUM ('PROCESSING', 'SENT', 'FAILED');
CREATE TYPE "EntraLinkStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "User"
  ADD COLUMN "entraTenantId" TEXT,
  ADD COLUMN "entraObjectId" TEXT;

ALTER TABLE "CompanySettings"
  ADD COLUMN "aiProvider" "AiProvider",
  ADD COLUMN "aiEndpoint" TEXT,
  ADD COLUMN "aiModel" TEXT,
  ADD COLUMN "aiApiKeyEncrypted" TEXT,
  ADD COLUMN "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "aiConnectionTestedAt" TIMESTAMPTZ(3),
  ADD COLUMN "aiRequestsPerUserPerDay" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "aiMaxTokensPerMonth" INTEGER NOT NULL DEFAULT 100000,
  ADD COLUMN "copilotEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "copilotTenantId" TEXT,
  ADD COLUMN "copilotApiAudience" TEXT,
  ADD COLUMN "copilotConnectorClientId" TEXT,
  ADD COLUMN "copilotLoginClientId" TEXT,
  ADD COLUMN "copilotLoginClientSecretEncrypted" TEXT;

CREATE TABLE "AiAuditEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "settingsId" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "filters" JSONB,
  "resultCount" INTEGER NOT NULL DEFAULT 0,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "success" BOOLEAN NOT NULL,
  "errorCode" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiReportSchedule" (
  "id" TEXT NOT NULL,
  "settingsId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "cadence" "AiReportCadence" NOT NULL DEFAULT 'DAILY',
  "sendTime" TEXT NOT NULL DEFAULT '09:00',
  "recipientUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "testedAt" TIMESTAMPTZ(3),
  "configurationHash" TEXT,
  "nextRunAt" TIMESTAMPTZ(3),
  "lastProcessedPeriodKey" TEXT,
  "lastSentAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "AiReportSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiReportDelivery" (
  "id" TEXT NOT NULL,
  "periodKey" TEXT NOT NULL,
  "periodStart" TIMESTAMPTZ(3) NOT NULL,
  "periodEnd" TIMESTAMPTZ(3) NOT NULL,
  "status" "AiReportDeliveryStatus" NOT NULL DEFAULT 'PROCESSING',
  "errorCode" TEXT,
  "sentAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "AiReportDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EntraLinkChallenge" (
  "id" TEXT NOT NULL,
  "stateHash" TEXT NOT NULL,
  "nonce" TEXT NOT NULL,
  "codeVerifierEncrypted" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "settingsId" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EntraLinkChallenge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EntraLinkRequest" (
  "id" TEXT NOT NULL,
  "settingsId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "entraTenantId" TEXT NOT NULL,
  "entraObjectId" TEXT NOT NULL,
  "email" TEXT,
  "displayName" TEXT,
  "status" "EntraLinkStatus" NOT NULL DEFAULT 'PENDING',
  "verifiedAt" TIMESTAMPTZ(3) NOT NULL,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EntraLinkRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_entraTenantId_entraObjectId_key" ON "User"("entraTenantId", "entraObjectId");
CREATE INDEX "AiAuditEvent_createdAt_idx" ON "AiAuditEvent"("createdAt");
CREATE INDEX "AiAuditEvent_userId_createdAt_idx" ON "AiAuditEvent"("userId", "createdAt");
CREATE INDEX "AiAuditEvent_settingsId_createdAt_idx" ON "AiAuditEvent"("settingsId", "createdAt");
CREATE UNIQUE INDEX "AiReportSchedule_settingsId_key" ON "AiReportSchedule"("settingsId");
CREATE UNIQUE INDEX "AiReportDelivery_periodKey_key" ON "AiReportDelivery"("periodKey");
CREATE INDEX "AiReportDelivery_status_createdAt_idx" ON "AiReportDelivery"("status", "createdAt");
CREATE UNIQUE INDEX "EntraLinkChallenge_stateHash_key" ON "EntraLinkChallenge"("stateHash");
CREATE INDEX "EntraLinkChallenge_expiresAt_idx" ON "EntraLinkChallenge"("expiresAt");
CREATE INDEX "EntraLinkRequest_status_createdAt_idx" ON "EntraLinkRequest"("status", "createdAt");
CREATE INDEX "EntraLinkRequest_userId_status_idx" ON "EntraLinkRequest"("userId", "status");
CREATE UNIQUE INDEX "EntraLinkRequest_entraTenantId_entraObjectId_status_key" ON "EntraLinkRequest"("entraTenantId", "entraObjectId", "status");

ALTER TABLE "AiAuditEvent" ADD CONSTRAINT "AiAuditEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiAuditEvent" ADD CONSTRAINT "AiAuditEvent_settingsId_fkey"
  FOREIGN KEY ("settingsId") REFERENCES "CompanySettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiReportSchedule" ADD CONSTRAINT "AiReportSchedule_settingsId_fkey"
  FOREIGN KEY ("settingsId") REFERENCES "CompanySettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EntraLinkChallenge" ADD CONSTRAINT "EntraLinkChallenge_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EntraLinkChallenge" ADD CONSTRAINT "EntraLinkChallenge_settingsId_fkey"
  FOREIGN KEY ("settingsId") REFERENCES "CompanySettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EntraLinkRequest" ADD CONSTRAINT "EntraLinkRequest_settingsId_fkey"
  FOREIGN KEY ("settingsId") REFERENCES "CompanySettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EntraLinkRequest" ADD CONSTRAINT "EntraLinkRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EntraLinkRequest" ADD CONSTRAINT "EntraLinkRequest_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CompanySettings"
  ADD COLUMN "aiConfigurationHash" TEXT,
  ADD COLUMN "aiTestedConfigurationHash" TEXT,
  ADD COLUMN "aiPausedUntil" TIMESTAMPTZ(3);
