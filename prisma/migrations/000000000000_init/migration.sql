-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Sector" AS ENUM ('hospitality', 'food_service', 'care', 'other');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('solo', 'standard', 'multi_site');

-- CreateEnum
CREATE TYPE "BusinessStatus" AS ENUM ('active', 'past_due', 'cancelled');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('owner', 'manager');

-- CreateEnum
CREATE TYPE "ArrangementType" AS ENUM ('employee', 'agency', 'gig', 'casual_zero_hours', 'subcontractor', 'other');

-- CreateEnum
CREATE TYPE "RtwStatus" AS ENUM ('not_checked', 'in_progress', 'passed', 'failed', 'refer', 'expired', 'follow_up_due');

-- CreateEnum
CREATE TYPE "WorkerStatus" AS ENUM ('active', 'ended', 'deleted_pending');

-- CreateEnum
CREATE TYPE "CheckType" AS ENUM ('idsp_digital', 'share_code', 'manual_document');

-- CreateEnum
CREATE TYPE "CheckStatus" AS ENUM ('created', 'link_sent', 'opened', 'in_progress', 'complete', 'failed', 'expired');

-- CreateEnum
CREATE TYPE "CheckOutcome" AS ENUM ('pass', 'fail', 'refer');

-- CreateEnum
CREATE TYPE "EvidenceSource" AS ENUM ('idsp', 'upload', 'generated');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('expiry_90', 'expiry_30', 'expiry_14', 'expiry_7', 'expiry_today', 'check_incomplete', 'compliance_update');

-- CreateEnum
CREATE TYPE "AlertChannel" AS ENUM ('email', 'sms', 'in_app');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company_number" TEXT,
    "sector" "Sector" NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'solo',
    "stripe_customer_id" TEXT,
    "alert_schedule" JSONB NOT NULL DEFAULT '[90, 30, 14, 7, 0]',
    "status" "BusinessStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "site_ids" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workers" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role_title" TEXT NOT NULL,
    "arrangement_type" "ArrangementType" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "rtw_status" "RtwStatus" NOT NULL DEFAULT 'not_checked',
    "permission_expiry" DATE,
    "follow_up_date" DATE,
    "status" "WorkerStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checks" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "worker_id" TEXT NOT NULL,
    "check_type" "CheckType" NOT NULL,
    "idsp_session_id" TEXT,
    "status" "CheckStatus" NOT NULL DEFAULT 'created',
    "outcome" "CheckOutcome",
    "method_detail" JSONB,
    "checked_at" TIMESTAMP(3),
    "share_code" TEXT,
    "statutory_excuse" BOOLEAN NOT NULL DEFAULT false,
    "follow_up_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_files" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "check_id" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "file_hash" TEXT NOT NULL,
    "source" "EvidenceSource" NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "worker_id" TEXT,
    "alert_type" "AlertType" NOT NULL,
    "channel" "AlertChannel" NOT NULL,
    "sent_at" TIMESTAMP(3),
    "snoozed_until" TIMESTAMP(3),
    "snooze_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_log" (
    "id" TEXT NOT NULL,
    "business_id" TEXT,
    "actor_user_id" TEXT,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");

-- CreateIndex
CREATE INDEX "sites_business_id_idx" ON "sites"("business_id");

-- CreateIndex
CREATE INDEX "memberships_business_id_idx" ON "memberships"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_user_id_business_id_key" ON "memberships"("user_id", "business_id");

-- CreateIndex
CREATE INDEX "workers_business_id_rtw_status_idx" ON "workers"("business_id", "rtw_status");

-- CreateIndex
CREATE INDEX "workers_business_id_follow_up_date_idx" ON "workers"("business_id", "follow_up_date");

-- CreateIndex
CREATE INDEX "workers_business_id_permission_expiry_idx" ON "workers"("business_id", "permission_expiry");

-- CreateIndex
CREATE UNIQUE INDEX "checks_idsp_session_id_key" ON "checks"("idsp_session_id");

-- CreateIndex
CREATE INDEX "checks_worker_id_created_at_idx" ON "checks"("worker_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "checks_business_id_idx" ON "checks"("business_id");

-- CreateIndex
CREATE INDEX "evidence_files_check_id_idx" ON "evidence_files"("check_id");

-- CreateIndex
CREATE INDEX "alerts_business_id_sent_at_idx" ON "alerts"("business_id", "sent_at" DESC);

-- CreateIndex
CREATE INDEX "event_log_business_id_occurred_at_idx" ON "event_log"("business_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "event_log_entity_type_entity_id_idx" ON "event_log"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workers" ADD CONSTRAINT "workers_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workers" ADD CONSTRAINT "workers_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checks" ADD CONSTRAINT "checks_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_files" ADD CONSTRAINT "evidence_files_check_id_fkey" FOREIGN KEY ("check_id") REFERENCES "checks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- event_log is append-only: block UPDATE and DELETE at the database level.
-- (05_COMPLIANCE_SECURITY.md §3; 03_DATA_MODEL.md event_log)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prevent_event_log_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'event_log is append-only: % not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER event_log_no_update
  BEFORE UPDATE ON "event_log"
  FOR EACH ROW EXECUTE FUNCTION prevent_event_log_mutation();

CREATE TRIGGER event_log_no_delete
  BEFORE DELETE ON "event_log"
  FOR EACH ROW EXECUTE FUNCTION prevent_event_log_mutation();
