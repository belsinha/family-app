-- ChoreCategory + migrate TaskTemplate.category -> categoryId, TaskTemplateAssignee from assignedToId,
-- TaskInstance unique (templateId, taskDate, assignedToId)

CREATE TABLE "ChoreCategory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX "ChoreCategory_name_key" ON "ChoreCategory"("name");

INSERT INTO "ChoreCategory" ("name", "sortOrder")
SELECT DISTINCT TRIM("category"), 0 FROM "TaskTemplate" WHERE LENGTH(TRIM(COALESCE("category", ''))) > 0;

INSERT OR IGNORE INTO "ChoreCategory" ("name", "sortOrder") VALUES ('Uncategorized', 999);

CREATE TABLE "_AssigneeBackup" (
    "templateId" INTEGER NOT NULL,
    "householdMemberId" INTEGER NOT NULL
);
INSERT INTO "_AssigneeBackup" ("templateId", "householdMemberId")
SELECT "id", "assignedToId" FROM "TaskTemplate";

PRAGMA foreign_keys=OFF;

CREATE TABLE "TaskInstance_new" (
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
    "availableAfter" TEXT
);
INSERT INTO "TaskInstance_new" SELECT * FROM "TaskInstance";
DROP TABLE "TaskInstance";

CREATE TABLE "TaskTemplate_new" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
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
    CONSTRAINT "TaskTemplate_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ChoreCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "TaskTemplate_new" (
    "id", "name", "categoryId", "frequencyType", "dayOfWeek", "weekOfMonth", "dayOfMonth",
    "semiannualMonths", "conditionalDayOfWeek", "conditionalAfterTime", "timeBlock", "pointsBase", "active"
)
SELECT
    t."id",
    t."name",
    COALESCE(
        (SELECT c."id" FROM "ChoreCategory" c WHERE c."name" = TRIM(t."category")),
        (SELECT "id" FROM "ChoreCategory" WHERE "name" = 'Uncategorized' LIMIT 1)
    ),
    t."frequencyType",
    t."dayOfWeek",
    t."weekOfMonth",
    t."dayOfMonth",
    t."semiannualMonths",
    t."conditionalDayOfWeek",
    t."conditionalAfterTime",
    t."timeBlock",
    t."pointsBase",
    t."active"
FROM "TaskTemplate" t;

DROP TABLE "TaskTemplate";
ALTER TABLE "TaskTemplate_new" RENAME TO "TaskTemplate";

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
INSERT INTO "TaskInstance" SELECT * FROM "TaskInstance_new";
DROP TABLE "TaskInstance_new";

CREATE INDEX "TaskInstance_taskDate_idx" ON "TaskInstance"("taskDate");
CREATE INDEX "TaskInstance_assignedToId_taskDate_idx" ON "TaskInstance"("assignedToId", "taskDate");
CREATE UNIQUE INDEX "TaskInstance_templateId_taskDate_assignedToId_key" ON "TaskInstance"("templateId", "taskDate", "assignedToId");

CREATE TABLE "TaskTemplateAssignee" (
    "templateId" INTEGER NOT NULL,
    "householdMemberId" INTEGER NOT NULL,
    CONSTRAINT "TaskTemplateAssignee_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TaskTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskTemplateAssignee_householdMemberId_fkey" FOREIGN KEY ("householdMemberId") REFERENCES "HouseholdMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY ("templateId", "householdMemberId")
);

INSERT INTO "TaskTemplateAssignee" ("templateId", "householdMemberId")
SELECT "templateId", "householdMemberId" FROM "_AssigneeBackup";
DROP TABLE "_AssigneeBackup";

PRAGMA foreign_keys=ON;
