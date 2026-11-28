-- F52 REVIEW ONLY. Requires coordinated F49 v2, confirmed backup, and explicit release approval.
-- Existing production catalog is retained. No fixture, seed, initial repricing, or destructive DDL.
BEGIN;
DO $preflight$
BEGIN
 IF to_regclass('public.lts_company_tariffs') IS NULL OR to_regclass('public.lts_company_extra_rates') IS NULL OR to_regclass('public.lts_account_archives') IS NULL THEN RAISE EXCEPTION 'Existing catalog required'; END IF;
 IF to_regprocedure('lts_internal.notification_targets(text,uuid)') IS NULL OR to_regprocedure('lts_internal.emit_catalog_change_hint()') IS NULL THEN RAISE EXCEPTION 'F49/F51 v2 notifications required'; END IF;
 IF to_regclass('lts_internal.company_tariff_reprice_audit') IS NOT NULL OR to_regprocedure('public.lts_reprice_company_tariff(uuid,bigint,integer,uuid,text,text)') IS NOT NULL THEN RAISE EXCEPTION 'Review already installed F51 components'; END IF;
END $preflight$;
LOCK TABLE public.lts_account_archives IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.lts_company_tariffs IN SHARE ROW EXCLUSIVE MODE;
GRANT USAGE ON SCHEMA lts_internal TO service_role;
CREATE TABLE lts_internal.company_tariff_reprice_audit (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tariff_id uuid NOT NULL, actor_id uuid NOT NULL, old_cents integer, new_cents integer NOT NULL, tariff_revision bigint NOT NULL, changed_archives integer NOT NULL, reason text NOT NULL DEFAULT 'tariff_change' CHECK(reason IN ('tariff_change','initial_reconciliation')), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE lts_internal.company_tariff_reprice_trip_audit (audit_id uuid NOT NULL REFERENCES lts_internal.company_tariff_reprice_audit(id) DEFERRABLE INITIALLY DEFERRED, driver_id uuid NOT NULL, trip_id text NOT NULL, before_fares jsonb NOT NULL, after_fares jsonb NOT NULL, PRIMARY KEY(audit_id,driver_id,trip_id));
ALTER TABLE lts_internal.company_tariff_reprice_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE lts_internal.company_tariff_reprice_trip_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON lts_internal.company_tariff_reprice_audit,lts_internal.company_tariff_reprice_trip_audit FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT ON lts_internal.company_tariff_reprice_audit,lts_internal.company_tariff_reprice_trip_audit TO service_role;
CREATE OR REPLACE FUNCTION lts_internal.reprice_company_payload(p_payload jsonb, p_client text, p_city text, p_cents integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
 v_trip jsonb;
 v_trips jsonb := '[]'::jsonb;
BEGIN
 IF p_cents IS NULL OR p_cents < 0
 OR p_cents > 99999999
 OR p_client IS NULL OR btrim(p_client)=''
 OR p_city IS NULL OR btrim(p_city)=''
 OR jsonb_typeof(p_payload->'trips')
 IS DISTINCT FROM 'array'
 THEN
 RAISE EXCEPTION 'Dati non validi';
 END IF;

 FOR v_trip IN
 SELECT value FROM
 jsonb_array_elements(p_payload->'trips')
 LOOP
 IF jsonb_typeof(v_trip)
 IS DISTINCT FROM 'object' THEN
 RAISE EXCEPTION 'Viaggio non valido';
 END IF;

 IF v_trip->>'client'=p_client
 AND v_trip->>'city'=p_city THEN
 v_trip := jsonb_set(
 v_trip,'{fareCents}',to_jsonb(p_cents));
 END IF;

 IF v_trip->>'secondClient'=p_client
 AND v_trip->>'secondCity'=p_city THEN
 v_trip := jsonb_set(
 v_trip,'{secondFareCents}',to_jsonb(p_cents));
 END IF;

 v_trips := v_trips ||
 jsonb_build_array(v_trip);
 END LOOP;

 RETURN jsonb_set(
 p_payload,'{trips}',v_trips);
END;
$function$;

CREATE OR REPLACE FUNCTION lts_internal.guard_retroactive_fares()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
 t jsonb;
 previous jsonb;
 old_trips jsonb := '[]'::jsonb;
 result jsonb := '[]'::jsonb;
 extras jsonb;
 amount jsonb;
 rate integer;
 k text;
 context_id text;
 context_rate record;
BEGIN
 IF NOT EXISTS (
 SELECT 1 FROM public.lts_account_access
 WHERE user_id=NEW.user_id AND role='driver'
 ) THEN
 RETURN NEW;
 END IF;

 IF jsonb_typeof(NEW.payload->'trips')
 IS DISTINCT FROM 'array' THEN
 RAISE EXCEPTION 'Archivio non valido';
 END IF;

 -- A tariff RPC may change precisely the selected route, nothing else.
 -- Other writers continue through the full canonical price guard below.
 context_id := nullif(current_setting('lts.reprice_tariff_id',true),'');
 IF context_id IS NOT NULL THEN
 IF TG_OP<>'UPDATE' OR current_user<>'service_role' THEN
 RAISE EXCEPTION 'Contesto ricalcolo non autorizzato' USING ERRCODE='42501';
 END IF;
 SELECT client,city,cents INTO STRICT context_rate
 FROM public.lts_company_tariffs WHERE id=context_id::uuid;
 IF NEW.payload IS DISTINCT FROM lts_internal.reprice_company_payload(
 OLD.payload,context_rate.client,context_rate.city,context_rate.cents) THEN
 RAISE EXCEPTION 'Ricalcolo contiene modifiche estranee' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
 END IF;

 IF TG_OP='UPDATE' THEN
 old_trips := OLD.payload->'trips';
 END IF;

 FOR t IN SELECT value FROM
 jsonb_array_elements(NEW.payload->'trips')
 LOOP
 previous := (
 SELECT value FROM jsonb_array_elements(old_trips)
 WHERE value->>'id'=t->>'id'
 );

 SELECT cents INTO rate
 FROM public.lts_company_tariffs
 WHERE client=t->>'client'
 AND city=t->>'city';

 amount := to_jsonb(rate);

 IF rate IS NULL
 AND previous->>'client'=t->>'client'
 AND previous->>'city'=t->>'city' THEN
 amount := previous->'fareCents';
 END IF;

 t := jsonb_set(t,'{fareCents}',
 coalesce(amount,'null'::jsonb));

 amount := NULL;

 IF coalesce(t->>'secondCity','')<>'' THEN
 SELECT cents INTO rate
 FROM public.lts_company_tariffs
 WHERE client=t->>'secondClient'
 AND city=t->>'secondCity';

 amount := to_jsonb(rate);

 IF rate IS NULL
 AND previous->>'secondClient'=t->>'secondClient'
 AND previous->>'secondCity'=t->>'secondCity' THEN
 amount := previous->'secondFareCents';
 END IF;
 END IF;

 t := jsonb_set(t,'{secondFareCents}',
 coalesce(amount,'null'::jsonb));

 extras := '{}'::jsonb;

 FOREACH k IN ARRAY ARRAY[
 'facchinaggioBilico','facchinaggioReefer',
 'reefer','adr','pernotto','sabatoPorto',
 'sabatoTrasferta','preOrario']
 LOOP
 amount := NULL;

 IF (t->'services') ? k THEN
 IF (previous->'services') ? k THEN
 amount := previous->'extraCents'->k;
 ELSIF k<>'reefer' THEN
 SELECT cents INTO rate
 FROM public.lts_company_extra_rates
 WHERE service_key=k;
 amount := to_jsonb(rate);
 END IF;
 END IF;

 extras := extras || jsonb_build_object(k,amount);
 END LOOP;

 t := jsonb_set(t,'{extraCents}',extras);
 result := result || jsonb_build_array(t);
 END LOOP;

 NEW.payload :=
 jsonb_set(NEW.payload,'{trips}',result);

 RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION lts_internal.apply_company_tariff_to_archives(r public.lts_company_tariffs, p_old_cents integer, p_admin_id uuid, p_reason text DEFAULT 'tariff_change'::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
 a record;
 v_payload jsonb;
 v_changed integer := 0;
 v_saved jsonb;
 v_audit_id uuid := gen_random_uuid();
 v_previous_context text;
BEGIN
 -- Mark only this exact server-authorized transformation. The guard verifies
 -- the complete resulting payload against the old payload and current tariff.
 v_previous_context := current_setting('lts.reprice_tariff_id',true);
 PERFORM set_config('lts.reprice_tariff_id',r.id::text,true);

 FOR a IN
 SELECT ar.user_id, ar.payload, ar.revision
 FROM public.lts_account_archives ar
 JOIN public.lts_account_access ac
 ON ac.user_id=ar.user_id
 WHERE ac.role='driver'
 ORDER BY ar.user_id
 LOOP

 v_payload :=
 lts_internal.reprice_company_payload(
 a.payload,r.client,r.city,r.cents);

 IF v_payload IS DISTINCT FROM a.payload
 THEN
 UPDATE public.lts_account_archives
 SET payload=v_payload,
 revision=revision+1,
 updated_at=now(),
 -- Only tariff-derived amounts changed. Preserve the last immutable user receipt.
 -- Legacy/admin IDs cannot prove the original submitted payload.
 last_request_id=CASE
 WHEN last_request_id ~ '^lts-v2:[A-Za-z0-9_-]{8,100}:[0-9a-f]{64}$'
 THEN last_request_id ELSE NULL END
 WHERE user_id=a.user_id
 AND revision=a.revision
 RETURNING payload INTO v_saved;

 IF NOT FOUND THEN
 RAISE EXCEPTION 'Conflitto archivio'
 USING ERRCODE='40001';
 END IF;

 IF v_saved IS DISTINCT FROM v_payload THEN
 RAISE EXCEPTION 'Modifica archivio diversa dal ricalcolo richiesto';
 END IF;

 INSERT INTO lts_internal.company_tariff_reprice_trip_audit
 (audit_id,driver_id,trip_id,before_fares,after_fares)
 SELECT v_audit_id,a.user_id,b.t->>'id',
 jsonb_build_object('fareCents',b.t->'fareCents','secondFareCents',b.t->'secondFareCents'),
 jsonb_build_object('fareCents',n.t->'fareCents','secondFareCents',n.t->'secondFareCents')
 FROM jsonb_array_elements(a.payload->'trips') WITH ORDINALITY b(t,idx)
 JOIN jsonb_array_elements(v_saved->'trips') WITH ORDINALITY n(t,idx) USING(idx)
 WHERE b.t->'fareCents' IS DISTINCT FROM n.t->'fareCents'
 OR b.t->'secondFareCents' IS DISTINCT FROM n.t->'secondFareCents';

 v_changed := v_changed+1;
 END IF;
 END LOOP;



 PERFORM set_config('lts.reprice_tariff_id',coalesce(v_previous_context,''),true);
 INSERT INTO
 lts_internal.company_tariff_reprice_audit
 (id,tariff_id,actor_id,old_cents,new_cents,
 tariff_revision,changed_archives,reason)
 VALUES
 (v_audit_id,r.id,p_admin_id,p_old_cents,r.cents,
 r.revision,v_changed,p_reason);

END;
$function$;

CREATE OR REPLACE FUNCTION lts_internal.lock_archives_for_tariff_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
 LOCK TABLE public.lts_account_archives IN SHARE ROW EXCLUSIVE MODE;
 RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION lts_internal.reprice_after_tariff_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
 IF current_user <> 'service_role' OR NOT EXISTS (
 SELECT 1 FROM public.lts_account_access
 WHERE user_id=NEW.updated_by AND role='admin' AND enabled=true AND removed_at IS NULL
 ) THEN
 RAISE EXCEPTION 'Inserimento tariffa non autorizzato' USING ERRCODE='42501';
 END IF;
 PERFORM lts_internal.apply_company_tariff_to_archives(NEW,NULL,NEW.updated_by);
 RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION lts_internal.reprice_after_tariff_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
 IF current_user <> 'service_role' OR NOT EXISTS (
  SELECT 1 FROM public.lts_account_access
  WHERE user_id=NEW.updated_by AND role='admin' AND enabled=true AND removed_at IS NULL
 ) THEN
  RAISE EXCEPTION 'Aggiornamento tariffa non autorizzato' USING ERRCODE='42501';
 END IF;
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.client IS DISTINCT FROM OLD.client
 OR NEW.city IS DISTINCT FROM OLD.city OR NEW.revision IS DISTINCT FROM OLD.revision+1
 OR NEW.cents IS NULL OR NEW.cents<0 OR NEW.cents>99999999 THEN
  RAISE EXCEPTION 'Aggiornamento tariffa non valido' USING ERRCODE='22023';
 END IF;
 PERFORM lts_internal.apply_company_tariff_to_archives(NEW,OLD.cents,NEW.updated_by);
 RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.lts_reprice_company_tariff(p_id uuid, p_expected_revision bigint, p_cents integer, p_admin_id uuid, p_client text, p_city text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
 r public.lts_company_tariffs%ROWTYPE;
BEGIN
 IF p_id IS NULL
 OR p_expected_revision IS NULL
 OR p_expected_revision < 1
 OR p_cents IS NULL
 OR p_cents < 0
 OR p_cents > 99999999
 THEN
 RAISE EXCEPTION 'Parametri non validi';
 END IF;

 IF NOT EXISTS (
 SELECT 1 FROM public.lts_account_access
 WHERE user_id=p_admin_id
 AND role='admin'
 AND enabled=true
 AND removed_at IS NULL
 ) THEN
 RAISE EXCEPTION 'Non autorizzato'
 USING ERRCODE='42501';
 END IF;

 LOCK TABLE public.lts_account_archives
 IN SHARE ROW EXCLUSIVE MODE;

 SELECT * INTO r
 FROM public.lts_company_tariffs
 WHERE id=p_id
 AND client=p_client
 AND city=p_city
 FOR UPDATE;

 IF NOT FOUND OR
 r.revision<>p_expected_revision THEN
 RAISE EXCEPTION 'Revisione obsoleta'
 USING ERRCODE='40001';
 END IF;

 IF r.cents=p_cents THEN
 RETURN to_jsonb(r);
 END IF;

 UPDATE public.lts_company_tariffs
 SET cents=p_cents,
 revision=revision+1,
 updated_by=p_admin_id,
 updated_at=now()
 WHERE id=p_id
 RETURNING * INTO r;

 -- The AFTER UPDATE trigger handles every changed company fare, including
 -- writes from older authenticated backend versions. Do not reprice twice.
 RETURN to_jsonb(r);
END;
$function$;
REVOKE ALL ON FUNCTION lts_internal.reprice_company_payload(jsonb,text,text,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION lts_internal.reprice_company_payload(jsonb,text,text,integer) TO service_role;
REVOKE ALL ON FUNCTION lts_internal.guard_retroactive_fares() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION lts_internal.guard_retroactive_fares() TO service_role;
REVOKE ALL ON FUNCTION lts_internal.apply_company_tariff_to_archives(public.lts_company_tariffs,integer,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION lts_internal.apply_company_tariff_to_archives(public.lts_company_tariffs,integer,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION lts_internal.lock_archives_for_tariff_insert() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION lts_internal.lock_archives_for_tariff_insert() TO service_role;
REVOKE ALL ON FUNCTION lts_internal.reprice_after_tariff_insert() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION lts_internal.reprice_after_tariff_insert() TO service_role;
REVOKE ALL ON FUNCTION lts_internal.reprice_after_tariff_update() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION lts_internal.reprice_after_tariff_update() TO service_role;
REVOKE ALL ON FUNCTION public.lts_reprice_company_tariff(uuid,bigint,integer,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.lts_reprice_company_tariff(uuid,bigint,integer,uuid,text,text) TO service_role;
CREATE TRIGGER lts_retroactive_fares_guard BEFORE INSERT OR UPDATE OF payload ON public.lts_account_archives FOR EACH ROW EXECUTE FUNCTION lts_internal.guard_retroactive_fares();
CREATE TRIGGER lts_tariffs_lock_before_insert BEFORE INSERT ON public.lts_company_tariffs FOR EACH STATEMENT EXECUTE FUNCTION lts_internal.lock_archives_for_tariff_insert();
CREATE TRIGGER lts_tariffs_lock_before_update BEFORE UPDATE OF cents ON public.lts_company_tariffs FOR EACH STATEMENT EXECUTE FUNCTION lts_internal.lock_archives_for_tariff_insert();
CREATE TRIGGER lts_tariffs_reprice_after_insert AFTER INSERT ON public.lts_company_tariffs FOR EACH ROW EXECUTE FUNCTION lts_internal.reprice_after_tariff_insert();
CREATE TRIGGER lts_tariffs_reprice_after_update AFTER UPDATE OF cents ON public.lts_company_tariffs FOR EACH ROW WHEN (OLD.cents IS DISTINCT FROM NEW.cents) EXECUTE FUNCTION lts_internal.reprice_after_tariff_update();
-- Existing catalog notification triggers must be switched to v2 in the coordinated F49 migration; do not add duplicate triggers here.
COMMIT;
