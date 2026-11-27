-- QA only. History lookup uses existing live-session checks, without public table grants.
CREATE FUNCTION lts_internal.read_trip_note_history(p_user_id uuid,p_session_id uuid,p_trip_id text,p_before bigint DEFAULT NULL)
RETURNS TABLE(event_id text,note_kind text,event_kind text,previous_note text,current_note text,recorded_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO pg_catalog AS $fn$
BEGIN
 IF p_user_id IS NULL OR p_session_id IS NULL OR NOT public.lts_session_is_active(p_user_id,p_session_id)
 OR NOT EXISTS(SELECT 1 FROM public.lts_account_access a WHERE a.user_id=p_user_id AND a.role='driver' AND a.enabled AND a.removed_at IS NULL)
 THEN RAISE EXCEPTION 'Session not authorized' USING ERRCODE='42501'; END IF;
 IF p_trip_id IS NULL OR length(p_trip_id) NOT BETWEEN 1 AND 128 OR (p_before IS NOT NULL AND p_before<=0)
 THEN RAISE EXCEPTION 'Invalid history request' USING ERRCODE='22023'; END IF;
 -- Only extant trips may be restored by their owner. Deleted-trip recovery remains manual.
 IF NOT EXISTS (SELECT 1 FROM public.lts_account_archives a CROSS JOIN LATERAL jsonb_array_elements(a.payload->'trips') t WHERE a.user_id=p_user_id AND t.value->>'id'=p_trip_id)
 THEN RETURN; END IF;
 RETURN QUERY SELECT h.event_id::text,h.note_kind,h.event_kind,h.previous_note,h.current_note,h.recorded_at
 FROM lts_internal.trip_note_history h WHERE h.user_id=p_user_id AND h.trip_id=p_trip_id
 AND (p_before IS NULL OR h.event_id<p_before)
 ORDER BY h.event_id DESC LIMIT 21;
END;
$fn$;
REVOKE ALL ON FUNCTION lts_internal.read_trip_note_history(uuid,uuid,text,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION lts_internal.read_trip_note_history(uuid,uuid,text,bigint) TO service_role;
CREATE FUNCTION public.lts_read_trip_note_history(p_user_id uuid,p_session_id uuid,p_trip_id text,p_before bigint DEFAULT NULL)
RETURNS TABLE(event_id text,note_kind text,event_kind text,previous_note text,current_note text,recorded_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO pg_catalog AS $fn$
 SELECT * FROM lts_internal.read_trip_note_history(p_user_id,p_session_id,p_trip_id,p_before);
$fn$;
REVOKE ALL ON FUNCTION public.lts_read_trip_note_history(uuid,uuid,text,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.lts_read_trip_note_history(uuid,uuid,text,bigint) TO service_role;
