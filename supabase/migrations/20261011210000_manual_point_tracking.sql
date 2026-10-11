-- Additive nonfinancial general awards; apply AFTER task_point_tracking.
BEGIN;
ALTER TABLE public.points DROP CONSTRAINT points_source_check;
ALTER TABLE public.points ADD CONSTRAINT points_source_check CHECK (source IN ('legacy','task','manual'));
ALTER TABLE public.points DROP CONSTRAINT task_point_intent;
ALTER TABLE public.points ADD CONSTRAINT task_point_intent CHECK (
  source = 'legacy' OR (
    points > 0 AND task_house_id > 0 AND task_house_id IS NOT NULL
    AND task_actor_id > 0 AND task_actor_id IS NOT NULL AND parent_id = task_actor_id AND parent_id IS NOT NULL
    AND request_id IS NOT NULL AND request_fingerprint IS NOT NULL AND request_fingerprint ~ '^[0-9a-f]{64}$'
    AND reason IS NOT NULL AND length(trim(reason)) BETWEEN 1 AND 2000
    AND ((source = 'manual' AND task_instance_id IS NULL AND task_snapshot IS NULL)
      OR (source = 'task' AND task_instance_id > 0 AND task_instance_id IS NOT NULL
        AND task_snapshot IS NOT NULL AND jsonb_typeof(task_snapshot) = 'object'
        AND task_snapshot ?& ARRAY['taskName','taskDate','householdMemberId']))
  )
);
DROP INDEX public.idx_task_point_request;
CREATE UNIQUE INDEX idx_task_point_request ON public.points(task_actor_id,request_id) WHERE source IN ('task','manual');
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_id_house_id ON public.users(id,house_id);
ALTER TABLE public.points ADD CONSTRAINT audited_point_actor_house
  FOREIGN KEY (task_actor_id,task_house_id) REFERENCES public.users(id,house_id);
CREATE OR REPLACE FUNCTION public.preserve_task_point_audit() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.source IN ('task','manual') THEN
    RAISE EXCEPTION 'Audited point records must be voided, not deleted';
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.source IS DISTINCT FROM NEW.source THEN RAISE EXCEPTION 'Point source is immutable'; END IF;
    IF OLD.source IN ('task','manual') THEN
      IF ROW(OLD.id,OLD.child_id,OLD.points,OLD.type,OLD.reason,OLD.created_at,OLD.parent_id,
             OLD.task_instance_id,OLD.task_house_id,OLD.task_actor_id,OLD.task_snapshot,OLD.request_id,OLD.request_fingerprint)
         IS DISTINCT FROM
         ROW(NEW.id,NEW.child_id,NEW.points,NEW.type,NEW.reason,NEW.created_at,NEW.parent_id,
             NEW.task_instance_id,NEW.task_house_id,NEW.task_actor_id,NEW.task_snapshot,NEW.request_id,NEW.request_fingerprint)
      THEN RAISE EXCEPTION 'Point intent and actor audit are immutable'; END IF;
      IF OLD.voided_at IS NOT NULL AND ROW(OLD.voided_at,OLD.voided_by,OLD.void_reason)
         IS DISTINCT FROM ROW(NEW.voided_at,NEW.voided_by,NEW.void_reason)
      THEN RAISE EXCEPTION 'A void cannot be changed or reversed'; END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.preserve_task_point_audit() FROM PUBLIC;
COMMIT;
