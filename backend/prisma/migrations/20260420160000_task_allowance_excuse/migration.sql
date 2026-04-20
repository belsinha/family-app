-- Allowance excuse workflow: request / parent approve → excluded from allowance math when APPROVED

ALTER TABLE "TaskInstance" ADD COLUMN "excuseStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "TaskInstance" ADD COLUMN "excuseNote" TEXT;
ALTER TABLE "TaskInstance" ADD COLUMN "excuseRequestedAt" TEXT;
ALTER TABLE "TaskInstance" ADD COLUMN "excuseDecidedAt" TEXT;
ALTER TABLE "TaskInstance" ADD COLUMN "excuseDeciderUserId" INTEGER;

ALTER TABLE "MonthlyAllowance" ADD COLUMN "excusedChoreCount" INTEGER NOT NULL DEFAULT 0;
