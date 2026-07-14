-- Migration: persistent work timer (one server-side running timer per child).
-- Run this in the Supabase SQL editor for an existing database; new databases get the
-- table from schema-postgres-supabase.sql.
--
-- Elapsed time is always computed from started_at (wall clock), never from client ticks.
-- Stopping the timer deletes the row and creates a work_logs entry with the duration.
-- project_id cascades on delete: if a project is removed while a timer runs, the timer
-- disappears and the stop endpoint reports it as already stopped.

CREATE TABLE IF NOT EXISTS active_timers (
  id BIGSERIAL PRIMARY KEY,
  house_id BIGINT NOT NULL,
  child_id BIGINT NOT NULL,
  project_id BIGINT NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT active_timers_child_id_key UNIQUE (child_id),
  CONSTRAINT active_timers_house_id_fkey FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE CASCADE,
  CONSTRAINT active_timers_child_house_fkey FOREIGN KEY (child_id, house_id) REFERENCES children(id, house_id) ON DELETE CASCADE,
  CONSTRAINT active_timers_project_house_fkey FOREIGN KEY (project_id, house_id) REFERENCES projects(id, house_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_active_timers_house_id ON active_timers(house_id);
CREATE INDEX IF NOT EXISTS idx_active_timers_project_id ON active_timers(project_id);
ALTER TABLE active_timers ENABLE ROW LEVEL SECURITY;
