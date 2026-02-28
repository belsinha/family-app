-- CreateTable
CREATE TABLE "HouseholdMember" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "canEditChores" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "TaskTemplate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "assignedToId" INTEGER NOT NULL,
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
    CONSTRAINT "TaskTemplate_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "HouseholdMember" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskInstance" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "templateId" INTEGER NOT NULL,
    "assignedToId" INTEGER NOT NULL,
    "taskDate" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "doneAt" TEXT,
    "doneWithoutReminder" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "complaintLogged" BOOLEAN NOT NULL DEFAULT false,
    "isExtra" BOOLEAN NOT NULL DEFAULT false,
    "availableAfter" TEXT,
    CONSTRAINT "TaskInstance_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TaskTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskInstance_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "HouseholdMember" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TaskInstance_taskDate_idx" ON "TaskInstance"("taskDate");

-- CreateIndex
CREATE INDEX "TaskInstance_assignedToId_taskDate_idx" ON "TaskInstance"("assignedToId", "taskDate");

-- CreateIndex
CREATE UNIQUE INDEX "TaskInstance_templateId_taskDate_key" ON "TaskInstance"("templateId", "taskDate");
