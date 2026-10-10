-- Reviewed source only: apply to an isolated database first, then explicitly enable the API.
-- No credentials, grants, reward defaults, conversions or automatic task-status penalties.
BEGIN;

ALTER TABLE children ADD COLUMN IF NOT EXISTS chore_member_id BIGINT
  CHECK (chore_member_id > 0);
CREATE UNIQUE INDEX IF NOT EXISTS idx_child_chore_member
  ON children(house_id, chore_member_id) WHERE chore_member_id IS NOT NULL;

ALTER TABLE points ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'legacy'
  CHECK (source IN ('legacy', 'task'));
ALTER TABLE points ADD COLUMN IF NOT EXISTS task_instance_id BIGINT;
ALTER TABLE points ADD COLUMN IF NOT EXISTS task_house_id BIGINT;
ALTER TABLE points ADD COLUMN IF NOT EXISTS task_actor_id BIGINT;
ALTER TABLE points ADD COLUMN IF NOT EXISTS task_snapshot JSONB;
ALTER TABLE points ADD COLUMN IF NOT EXISTS request_id UUID;
ALTER TABLE points ADD COLUMN IF NOT EXISTS request_fingerprint TEXT;
ALTER TABLE points ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE points ADD COLUMN IF NOT EXISTS voided_by BIGINT;
ALTER TABLE points ADD COLUMN IF NOT EXISTS void_reason TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_point_request
  ON points(task_actor_id, request_id) WHERE source = 'task';
CREATE UNIQUE INDEX IF NOT EXISTS idx_children_id_house_id ON children(id, house_id);

ALTER TABLE points ADD CONSTRAINT task_point_child_house
  FOREIGN KEY (child_id, task_house_id) REFERENCES children(id, house_id);
ALTER TABLE points ADD CONSTRAINT task_point_intent CHECK (
  source = 'legacy' OR (
    points > 0 AND task_instance_id > 0 AND task_house_id > 0 AND task_actor_id > 0
    AND task_instance_id IS NOT NULL AND task_house_id IS NOT NULL AND task_actor_id IS NOT NULL
    AND request_id IS NOT NULL AND request_fingerprint ~ '^[0-9a-f]{64}$'
    AND request_fingerprint IS NOT NULL
    AND task_snapshot IS NOT NULL AND jsonb_typeof(task_snapshot) = 'object'
    AND task_snapshot ?& ARRAY['taskName','taskDate','householdMemberId']
    AND reason IS NOT NULL AND length(trim(reason)) BETWEEN 1 AND 2000
  )
);
ALTER TABLE points ADD CONSTRAINT task_point_void CHECK (
  source = 'legacy' OR (
    (voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL) OR
    (voided_at IS NOT NULL AND voided_by > 0 AND voided_by IS NOT NULL
      AND void_reason IS NOT NULL AND length(trim(void_reason)) BETWEEN 1 AND 2000)
  )
);

-- Existing RLS posture remains deny-by-default. Backend authentication/house guards are required.
ALTER TABLE children ENABLE ROW LEVEL SECURITY;
ALTER TABLE points ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION preserve_task_point_audit() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.source = 'task' THEN
    RAISE EXCEPTION 'Task point audit records must be voided, not deleted';
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.source IS DISTINCT FROM NEW.source THEN
      RAISE EXCEPTION 'Point source is immutable';
    END IF;
    IF OLD.source = 'task' THEN
      IF ROW(OLD.child_id, OLD.points, OLD.type, OLD.reason, OLD.created_at,
             OLD.task_instance_id, OLD.task_house_id, OLD.task_actor_id,
             OLD.task_snapshot, OLD.request_id, OLD.request_fingerprint)
         IS DISTINCT FROM
         ROW(NEW.child_id, NEW.points, NEW.type, NEW.reason, NEW.created_at,
             NEW.task_instance_id, NEW.task_house_id, NEW.task_actor_id,
             NEW.task_snapshot, NEW.request_id, NEW.request_fingerprint) THEN
        RAISE EXCEPTION 'Task point intent and actor audit are immutable';
      END IF;
      IF OLD.voided_at IS NOT NULL AND
         ROW(OLD.voided_at, OLD.voided_by, OLD.void_reason) IS DISTINCT FROM
         ROW(NEW.voided_at, NEW.voided_by, NEW.void_reason) THEN
        RAISE EXCEPTION 'A void cannot be changed or reversed';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION preserve_task_point_audit() FROM PUBLIC;
CREATE TRIGGER task_point_audit BEFORE UPDATE OR DELETE ON points
  FOR EACH ROW EXECUTE FUNCTION preserve_task_point_audit();

COMMIT;
