-- QA candidate; do not run against production without explicit release approval.
-- Transactional history: store only note changes, not full trip snapshots.
CREATE TABLE lts_internal.trip_note_history (
 event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id uuid NOT NULL,
 trip_id text NOT NULL,
 note_kind text NOT NULL CHECK (note_kind IN ('note','adminNote')),
 archive_revision bigint NOT NULL,
 event_kind text NOT NULL CHECK (event_kind IN ('baseline','insert','update','delete')),
 previous_note text,
 current_note text,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK (previous_note IS DISTINCT FROM current_note),
 CHECK (previous_note IS NOT NULL OR current_note IS NOT NULL)
);
ALTER TABLE lts_internal.trip_note_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON lts_internal.trip_note_history FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE lts_internal.trip_note_history_event_id_seq FROM PUBLIC, anon, authenticated, service_role;
CREATE INDEX trip_note_history_lookup ON lts_internal.trip_note_history(user_id,trip_id,note_kind,event_id DESC);
CREATE FUNCTION lts_internal.capture_trip_note_history() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog AS $fn$
DECLARE
 old_trips jsonb := '[]'::jsonb;
 new_trips jsonb := '[]'::jsonb;
 owner_id uuid;
 rev bigint;
 change record;
BEGIN
 IF TG_OP <> 'INSERT' THEN old_trips := OLD.payload->'trips'; END IF;
 IF TG_OP <> 'DELETE' THEN new_trips := NEW.payload->'trips'; END IF;
 IF TG_OP = 'DELETE' THEN owner_id := OLD.user_id; rev := OLD.revision;
 ELSE owner_id := NEW.user_id; rev := NEW.revision; END IF;
 IF TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
  RAISE EXCEPTION 'Archive ownership cannot change' USING ERRCODE='42501';
 END IF;
 IF old_trips IS NOT DISTINCT FROM new_trips THEN RETURN NULL; END IF;
 FOR change IN
  WITH old_rows AS (SELECT value AS trip FROM jsonb_array_elements(old_trips)),
       new_rows AS (SELECT value AS trip FROM jsonb_array_elements(new_trips))
  SELECT coalesce(o.trip->>'id',n.trip->>'id') AS trip_id, k.kind,
   nullif(o.trip->>k.kind,'') AS prior, nullif(n.trip->>k.kind,'') AS next,
   n.trip IS NOT NULL AND NOT (n.trip ? k.kind) AS omitted,
   CASE WHEN o.trip IS NULL THEN 'insert' WHEN n.trip IS NULL THEN 'delete' ELSE 'update' END AS event_kind
  FROM old_rows o FULL JOIN new_rows n ON o.trip->>'id'=n.trip->>'id'
  CROSS JOIN (VALUES ('note'),('adminNote')) AS k(kind)
  WHERE nullif(o.trip->>k.kind,'') IS DISTINCT FROM nullif(n.trip->>k.kind,'')
 LOOP
  IF change.omitted AND change.prior IS NOT NULL THEN
   RAISE EXCEPTION 'Existing trip note omitted from archive update' USING ERRCODE='23514';
  END IF;
  INSERT INTO lts_internal.trip_note_history(user_id,trip_id,note_kind,archive_revision,event_kind,previous_note,current_note)
  VALUES(owner_id,change.trip_id,change.kind,rev,change.event_kind,change.prior,change.next);
 END LOOP;
 RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION lts_internal.capture_trip_note_history() FROM PUBLIC, anon, authenticated, service_role;
-- Prevent a gap between initial snapshot and activation of the trigger.
LOCK TABLE public.lts_account_archives IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO lts_internal.trip_note_history(user_id,trip_id,note_kind,archive_revision,event_kind,current_note)
SELECT a.user_id,t.value->>'id',k.kind,a.revision,'baseline',t.value->>k.kind
FROM public.lts_account_archives a CROSS JOIN LATERAL jsonb_array_elements(a.payload->'trips') t
CROSS JOIN (VALUES ('note'),('adminNote')) AS k(kind)
WHERE nullif(t.value->>k.kind,'') IS NOT NULL;
CREATE TRIGGER lts_trip_note_history AFTER INSERT OR UPDATE OR DELETE ON public.lts_account_archives
FOR EACH ROW EXECUTE FUNCTION lts_internal.capture_trip_note_history();
