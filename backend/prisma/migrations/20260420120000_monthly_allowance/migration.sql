-- CreateTable
CREATE TABLE "MonthlyAllowance" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "yearMonth" TEXT NOT NULL,
    "householdMemberId" INTEGER NOT NULL,
    "baseCents" INTEGER NOT NULL DEFAULT 10000,
    "requiredChoreCount" INTEGER NOT NULL,
    "completedChoreCount" INTEGER NOT NULL,
    "pendingChoreCount" INTEGER NOT NULL,
    "missedChoreCount" INTEGER NOT NULL,
    "proposedCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "submittedAt" TEXT NOT NULL,
    "decidedAt" TEXT,
    "approverUserId" INTEGER,
    "rejectionReason" TEXT,
    CONSTRAINT "MonthlyAllowance_householdMemberId_fkey" FOREIGN KEY ("householdMemberId") REFERENCES "HouseholdMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MonthlyAllowance_yearMonth_status_idx" ON "MonthlyAllowance"("yearMonth", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyAllowance_yearMonth_householdMemberId_key" ON "MonthlyAllowance"("yearMonth", "householdMemberId");
