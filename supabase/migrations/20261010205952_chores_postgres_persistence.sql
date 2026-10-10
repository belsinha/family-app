-- Additive private chores store; refuses an existing schema. No grants or public ledger writes.
BEGIN;
-- CreateSchema
CREATE SCHEMA "chores";

-- CreateTable
CREATE TABLE "chores"."ChoreCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ChoreCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chores"."HouseholdMember" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "canEditChores" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "HouseholdMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chores"."MonthlyAllowance" (
    "id" SERIAL NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "householdMemberId" INTEGER NOT NULL,
    "baseCents" INTEGER NOT NULL DEFAULT 10000,
    "requiredChoreCount" INTEGER NOT NULL,
    "completedChoreCount" INTEGER NOT NULL,
    "pendingChoreCount" INTEGER NOT NULL,
    "missedChoreCount" INTEGER NOT NULL,
    "excusedChoreCount" INTEGER NOT NULL DEFAULT 0,
    "proposedCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "submittedAt" TEXT NOT NULL,
    "decidedAt" TEXT,
    "approverUserId" INTEGER,
    "rejectionReason" TEXT,

    CONSTRAINT "MonthlyAllowance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chores"."TaskTemplateAssignee" (
    "templateId" INTEGER NOT NULL,
    "householdMemberId" INTEGER NOT NULL,

    CONSTRAINT "TaskTemplateAssignee_pkey" PRIMARY KEY ("templateId","householdMemberId")
);

-- CreateTable
CREATE TABLE "chores"."TaskTemplate" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" INTEGER NOT NULL,
    "houseArea" TEXT NOT NULL DEFAULT 'NONE',
    "frequencyType" TEXT NOT NULL,
    "dayOfWeek" INTEGER,
    "weekOfMonth" INTEGER,
    "dayOfMonth" INTEGER,
    "semiannualMonths" TEXT,
    "conditionalDayOfWeek" INTEGER,
    "conditionalAfterTime" TEXT,
    "timeBlock" TEXT NOT NULL,
    "pointsBase" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "anyoneMayComplete" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TaskTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chores"."TaskInstance" (
    "id" SERIAL NOT NULL,
    "templateId" INTEGER NOT NULL,
    "assignedToId" INTEGER,
    "allowanceLiabilityMemberId" INTEGER,
    "taskDate" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "doneAt" TEXT,
    "doneWithoutReminder" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "complaintLogged" BOOLEAN NOT NULL DEFAULT false,
    "isExtra" BOOLEAN NOT NULL DEFAULT false,
    "availableAfter" TEXT,
    "excuseStatus" TEXT NOT NULL DEFAULT 'NONE',
    "excuseNote" TEXT,
    "excuseRequestedAt" TEXT,
    "excuseDecidedAt" TEXT,
    "excuseDeciderUserId" INTEGER,

    CONSTRAINT "TaskInstance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChoreCategory_name_key" ON "chores"."ChoreCategory"("name");

-- CreateIndex
CREATE INDEX "MonthlyAllowance_yearMonth_status_idx" ON "chores"."MonthlyAllowance"("yearMonth", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyAllowance_yearMonth_householdMemberId_key" ON "chores"."MonthlyAllowance"("yearMonth", "householdMemberId");

-- CreateIndex
CREATE INDEX "TaskInstance_taskDate_idx" ON "chores"."TaskInstance"("taskDate");

-- CreateIndex
CREATE INDEX "TaskInstance_assignedToId_taskDate_idx" ON "chores"."TaskInstance"("assignedToId", "taskDate");

-- CreateIndex
CREATE UNIQUE INDEX "TaskInstance_templateId_taskDate_assignedToId_key" ON "chores"."TaskInstance"("templateId", "taskDate", "assignedToId");

-- AddForeignKey
ALTER TABLE "chores"."MonthlyAllowance" ADD CONSTRAINT "MonthlyAllowance_householdMemberId_fkey" FOREIGN KEY ("householdMemberId") REFERENCES "chores"."HouseholdMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chores"."TaskTemplateAssignee" ADD CONSTRAINT "TaskTemplateAssignee_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "chores"."TaskTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chores"."TaskTemplateAssignee" ADD CONSTRAINT "TaskTemplateAssignee_householdMemberId_fkey" FOREIGN KEY ("householdMemberId") REFERENCES "chores"."HouseholdMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chores"."TaskTemplate" ADD CONSTRAINT "TaskTemplate_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "chores"."ChoreCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chores"."TaskInstance" ADD CONSTRAINT "TaskInstance_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "chores"."TaskTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chores"."TaskInstance" ADD CONSTRAINT "TaskInstance_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "chores"."HouseholdMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chores"."TaskInstance" ADD CONSTRAINT "TaskInstance_allowanceLiabilityMemberId_fkey" FOREIGN KEY ("allowanceLiabilityMemberId") REFERENCES "chores"."HouseholdMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;


CREATE TABLE chores."StoreMetadata" (
  id integer PRIMARY KEY CHECK (id = 1),
  "houseId" bigint NOT NULL REFERENCES public.houses(id) ON DELETE RESTRICT,
  "sourceSha256" text NOT NULL CHECK ("sourceSha256" ~ '^[a-f0-9]{64}$'),
  "importedAt" timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON SCHEMA chores FROM PUBLIC;
ALTER TABLE chores."ChoreCategory" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON chores."ChoreCategory" FROM PUBLIC;
ALTER TABLE chores."HouseholdMember" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON chores."HouseholdMember" FROM PUBLIC;
ALTER TABLE chores."TaskTemplate" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON chores."TaskTemplate" FROM PUBLIC;
ALTER TABLE chores."TaskTemplateAssignee" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON chores."TaskTemplateAssignee" FROM PUBLIC;
ALTER TABLE chores."TaskInstance" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON chores."TaskInstance" FROM PUBLIC;
ALTER TABLE chores."MonthlyAllowance" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON chores."MonthlyAllowance" FROM PUBLIC;
ALTER TABLE chores."StoreMetadata" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON chores."StoreMetadata" FROM PUBLIC;
-- Supabase default privileges may grant named API roles separately from PUBLIC.
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA chores FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA chores FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA chores FROM %I', r);
    END IF;
  END LOOP;
END $$;
COMMIT;
