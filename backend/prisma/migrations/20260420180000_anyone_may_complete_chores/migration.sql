-- Household pool chores: one instance per day with nullable assignedToId; parent sets allowanceLiabilityMemberId if not done.

ALTER TABLE "TaskTemplate" ADD COLUMN "anyoneMayComplete" BOOLEAN NOT NULL DEFAULT false;

PRAGMA foreign_keys=OFF;

CREATE TABLE "TaskInstance_new" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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
    CONSTRAINT "TaskInstance_new_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TaskTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskInstance_new_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "HouseholdMember" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TaskInstance_new_allowanceLiabilityMemberId_fkey" FOREIGN KEY ("allowanceLiabilityMemberId") REFERENCES "HouseholdMember" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "TaskInstance_new" (
    "id", "templateId", "assignedToId", "allowanceLiabilityMemberId", "taskDate", "status", "doneAt",
    "doneWithoutReminder", "notes", "complaintLogged", "isExtra", "availableAfter",
    "excuseStatus", "excuseNote", "excuseRequestedAt", "excuseDecidedAt", "excuseDeciderUserId"
)
SELECT
    "id", "templateId", "assignedToId", NULL, "taskDate", "status", "doneAt",
    "doneWithoutReminder", "notes", "complaintLogged", "isExtra", "availableAfter",
    "excuseStatus", "excuseNote", "excuseRequestedAt", "excuseDecidedAt", "excuseDeciderUserId"
FROM "TaskInstance";

DROP TABLE "TaskInstance";
ALTER TABLE "TaskInstance_new" RENAME TO "TaskInstance";

CREATE INDEX "TaskInstance_taskDate_idx" ON "TaskInstance"("taskDate");
CREATE INDEX "TaskInstance_assignedToId_taskDate_idx" ON "TaskInstance"("assignedToId", "taskDate");
CREATE UNIQUE INDEX "TaskInstance_templateId_taskDate_assignedToId_key" ON "TaskInstance"("templateId", "taskDate", "assignedToId");

PRAGMA foreign_keys=ON;
