BEGIN;
CREATE SCHEMA family_oauth;
REVOKE ALL ON SCHEMA family_oauth FROM PUBLIC;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_id_house_id ON public.users(id,house_id);
CREATE TABLE family_oauth.sessions (
  id_hash text PRIMARY KEY CHECK (id_hash ~ '^[0-9a-f]{64}$'),
  binding text NOT NULL CHECK (binding ~ '^[0-9a-f]{64}$'),
  user_id integer NOT NULL,
  house_id integer NOT NULL,
  scopes text[] NOT NULL CHECK (cardinality(scopes)>0 AND scopes <@ ARRAY['family:points:read','family:points:write']::text[]),
  expires_at bigint NOT NULL,
  idle_until bigint NOT NULL CHECK (idle_until<=expires_at),
  revoked boolean NOT NULL DEFAULT false,
  FOREIGN KEY(user_id,house_id) REFERENCES public.users(id,house_id)
);
CREATE TABLE family_oauth.refresh_tokens (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  session_hash text NOT NULL REFERENCES family_oauth.sessions(id_hash) ON DELETE CASCADE,
  used boolean NOT NULL DEFAULT false
);
CREATE INDEX refresh_lineage ON family_oauth.refresh_tokens(session_hash);
CREATE TABLE family_oauth.session_aliases (
  id_hash text PRIMARY KEY CHECK (id_hash ~ '^[0-9a-f]{64}$'),
  session_hash text NOT NULL REFERENCES family_oauth.sessions(id_hash) ON DELETE CASCADE
);
CREATE INDEX alias_lineage ON family_oauth.session_aliases(session_hash);
CREATE INDEX session_expiry ON family_oauth.sessions(expires_at);
ALTER TABLE family_oauth.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_oauth.refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_oauth.session_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA family_oauth FROM PUBLIC;
-- No password, LOGIN change, role membership, public-data permission or API schema exposure.
-- Existing house-1 backend runtime is provisioned separately under the approved cutover.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='family_app_chores_runtime') THEN
    RAISE EXCEPTION 'Prepare the approved restricted runtime role before OAuth migration';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='family_app_chores_runtime' AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication OR rolinherit)) THEN
    RAISE EXCEPTION 'OAuth runtime role has unsafe attributes';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='family_app_chores_runtime') THEN
    GRANT USAGE ON SCHEMA family_oauth TO family_app_chores_runtime;
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA family_oauth TO family_app_chores_runtime;
    CREATE POLICY runtime_session ON family_oauth.sessions FOR ALL TO family_app_chores_runtime USING(house_id=1) WITH CHECK(house_id=1);
    CREATE POLICY runtime_refresh ON family_oauth.refresh_tokens FOR ALL TO family_app_chores_runtime USING(EXISTS(SELECT 1 FROM family_oauth.sessions WHERE id_hash=session_hash AND house_id=1)) WITH CHECK(EXISTS(SELECT 1 FROM family_oauth.sessions WHERE id_hash=session_hash AND house_id=1));
    CREATE POLICY runtime_alias ON family_oauth.session_aliases FOR ALL TO family_app_chores_runtime USING(EXISTS(SELECT 1 FROM family_oauth.sessions WHERE id_hash=session_hash AND house_id=1)) WITH CHECK(EXISTS(SELECT 1 FROM family_oauth.sessions WHERE id_hash=session_hash AND house_id=1));
  END IF;
END $$;
COMMIT;
