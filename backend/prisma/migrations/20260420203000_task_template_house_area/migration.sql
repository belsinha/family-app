-- Optional: where in the home this chore applies (for sorting and filters).
ALTER TABLE "TaskTemplate" ADD COLUMN "houseArea" TEXT NOT NULL DEFAULT 'NONE';
