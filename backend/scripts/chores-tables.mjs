/* Scalar columns shared with both Prisma schemas; import never copies personal rows to logs. */
export const tables = {
  "ChoreCategory": {
    "columns": [
      "id",
      "name",
      "sortOrder"
    ],
    "booleans": [],
    "sequence": true
  },
  "HouseholdMember": {
    "columns": [
      "id",
      "name",
      "canEditChores"
    ],
    "booleans": [
      "canEditChores"
    ],
    "sequence": true
  },
  "MonthlyAllowance": {
    "columns": [
      "id",
      "yearMonth",
      "householdMemberId",
      "baseCents",
      "requiredChoreCount",
      "completedChoreCount",
      "pendingChoreCount",
      "missedChoreCount",
      "excusedChoreCount",
      "proposedCents",
      "status",
      "submittedAt",
      "decidedAt",
      "approverUserId",
      "rejectionReason"
    ],
    "booleans": [],
    "sequence": true
  },
  "TaskTemplateAssignee": {
    "columns": [
      "templateId",
      "householdMemberId"
    ],
    "booleans": [],
    "sequence": false
  },
  "TaskTemplate": {
    "columns": [
      "id",
      "name",
      "description",
      "categoryId",
      "houseArea",
      "frequencyType",
      "dayOfWeek",
      "weekOfMonth",
      "dayOfMonth",
      "semiannualMonths",
      "conditionalDayOfWeek",
      "conditionalAfterTime",
      "timeBlock",
      "pointsBase",
      "active",
      "anyoneMayComplete"
    ],
    "booleans": [
      "active",
      "anyoneMayComplete"
    ],
    "sequence": true
  },
  "TaskInstance": {
    "columns": [
      "id",
      "templateId",
      "assignedToId",
      "allowanceLiabilityMemberId",
      "taskDate",
      "status",
      "doneAt",
      "doneWithoutReminder",
      "notes",
      "complaintLogged",
      "isExtra",
      "availableAfter",
      "excuseStatus",
      "excuseNote",
      "excuseRequestedAt",
      "excuseDecidedAt",
      "excuseDeciderUserId"
    ],
    "booleans": [
      "doneWithoutReminder",
      "complaintLogged",
      "isExtra"
    ],
    "sequence": true
  }
};
