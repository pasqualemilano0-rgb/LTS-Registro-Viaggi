-- REVIEW ONLY. Production F49 candidate based on installed QA functions, retaining all existing production trigger paths.
-- Requires explicit release authorization, backup and coordinated F51/PR237 migration.
BEGIN;
DO $check$
BEGIN
 IF to_regprocedure('public.lts_session_is_active(uuid,uuid)') IS NULL OR to_regprocedure('public.lts_admin_verified_totp_factor(uuid)') IS NULL THEN RAISE EXCEPTION 'Session/MFA prerequisites missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='realtime' AND tablename='messages' AND policyname='lts_private_change_hints_receive' AND cmd='SELECT' AND qual LIKE '%lts_internal.may_receive_realtime%') THEN RAISE EXCEPTION 'Unexpected realtime policy'; END IF;
 IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='realtime' AND tablename='messages' AND policyname<>'lts_private_change_hints_receive') THEN RAISE EXCEPTION 'Review additional realtime policies'; END IF;
END $check$;
CREATE OR REPLACE FUNCTION lts_internal.notification_targets(p_kind text, p_owner uuid)
 RETURNS TABLE(session_id uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT s.id FROM auth.sessions s JOIN public.lts_account_access a ON a.user_id=s.user_id
 WHERE a.enabled IS TRUE AND a.removed_at IS NULL
 AND (s.not_after IS NULL OR s.not_after>now())
 AND public.lts_session_is_active(s.user_id,s.id)
 AND (a.role <> 'admin' OR public.lts_admin_verified_totp_factor(s.user_id) IS NULL OR s.aal::text='aal2')
 AND ((p_kind='archive' AND (a.role='admin' OR (a.role='driver' AND a.user_id=p_owner))) OR (p_kind='roster' AND a.role='admin') OR (p_kind='catalog' AND a.role IN ('driver','admin')))
$function$;
CREATE OR REPLACE FUNCTION lts_internal.may_receive_realtime(p_topic text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
WITH claims AS (SELECT (SELECT auth.uid()) AS uid,(SELECT auth.jwt()) AS jwt),
identity AS (SELECT uid,jwt,CASE WHEN jwt->>'session_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN (jwt->>'session_id')::uuid END AS sid FROM claims)
SELECT EXISTS(SELECT 1 FROM identity i JOIN public.lts_account_access a ON a.user_id=i.uid JOIN auth.sessions s ON s.id=i.sid AND s.user_id=i.uid
WHERE i.jwt->>'role'='authenticated' AND COALESCE(i.jwt->>'is_anonymous','false')='false'
AND a.role IN ('driver','admin') AND a.enabled IS TRUE AND a.removed_at IS NULL
AND (s.not_after IS NULL OR s.not_after>now()) AND public.lts_session_is_active(i.uid,i.sid)
AND (a.role<>'admin' OR public.lts_admin_verified_totp_factor(i.uid) IS NULL OR (i.jwt->>'aal'='aal2' AND s.aal::text='aal2'))
AND p_topic='lts:v2:session:'||i.sid::text);
$function$;
CREATE OR REPLACE FUNCTION lts_internal.emit_change_hint()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_owner uuid; v_sid uuid;
BEGIN
 IF tg_table_name='lts_account_archives' THEN
  v_owner:=CASE WHEN tg_op='DELETE' THEN old.user_id ELSE new.user_id END;
  FOR v_sid IN SELECT session_id FROM lts_internal.notification_targets('archive',v_owner) LOOP
   PERFORM realtime.send('{"kind":"archive"}'::jsonb,'changed','lts:v2:session:'||v_sid::text,true);
  END LOOP;
 ELSIF tg_table_name IN ('lts_company_tariffs','lts_company_extra_rates','lts_shared_maps_customers','lts_shared_customers_manual') THEN
  FOR v_sid IN SELECT session_id FROM lts_internal.notification_targets('catalog',NULL::uuid) LOOP
   PERFORM realtime.send('{"kind":"catalog"}'::jsonb,'changed','lts:v2:session:'||v_sid::text,true);
  END LOOP;
 END IF;
 RETURN NULL;
END;
$function$;
CREATE OR REPLACE FUNCTION lts_internal.emit_roster_change_hint()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_sid uuid;
BEGIN
 FOR v_sid IN SELECT session_id FROM lts_internal.notification_targets('roster',NULL::uuid) LOOP
  PERFORM realtime.send('{"kind":"roster"}'::jsonb,'changed','lts:v2:session:'||v_sid::text,true);
 END LOOP;
 RETURN NULL;
END;
$function$;
CREATE OR REPLACE FUNCTION lts_internal.emit_catalog_change_hint()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_sid uuid;
BEGIN
 FOR v_sid IN SELECT session_id FROM lts_internal.notification_targets('catalog',NULL::uuid) LOOP
  PERFORM realtime.send('{"kind":"catalog"}'::jsonb,'changed','lts:v2:session:'||v_sid::text,true);
 END LOOP;
 RETURN NULL;
END;
$function$;
CREATE OR REPLACE FUNCTION lts_internal.emit_manual_customer_change_hint()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_sid uuid;
BEGIN
 FOR v_sid IN SELECT session_id FROM lts_internal.notification_targets('catalog',NULL::uuid) LOOP
  PERFORM realtime.send('{"kind":"catalog"}'::jsonb,'changed','lts:v2:session:'||v_sid::text,true);
 END LOOP;
 RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION lts_internal.notification_targets(text,uuid),lts_internal.emit_change_hint(),lts_internal.emit_roster_change_hint(),lts_internal.emit_catalog_change_hint(),lts_internal.emit_manual_customer_change_hint(),lts_internal.may_receive_realtime(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA lts_internal TO authenticated;
GRANT EXECUTE ON FUNCTION lts_internal.may_receive_realtime(text) TO authenticated;
-- Existing trigger attachments remain in place. No v1 emissions from these six functions.
COMMIT;
