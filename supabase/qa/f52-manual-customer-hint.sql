-- Review-only F52 candidate. Requires F49 installed and validated first.
-- Tested equivalent emit_catalog_change_hint() with a temporary fixture in QA.
-- Existing production manual customer trigger remains attached to its table.
CREATE OR REPLACE FUNCTION lts_internal.emit_manual_customer_change_hint()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE v_sid uuid;
BEGIN
 FOR v_sid IN SELECT session_id FROM lts_internal.notification_targets('catalog',NULL::uuid) LOOP
  PERFORM realtime.send('{"kind":"catalog"}'::jsonb,'changed','lts:v2:session:'||v_sid::text,true);
 END LOOP;
 RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION lts_internal.emit_manual_customer_change_hint() FROM PUBLIC,anon,authenticated,service_role;
