-- One PostgreSQL transaction for publishing a customer together with a company fare.
-- Browser and authenticated users cannot invoke this helper. The Edge Function
-- checks a live admin session + MFA and calls it using service_role only.
-- A conflict rolls back BOTH writes. Existing route fares remain unchanged.
create or replace function public.lts_company_register_priced_customer(
  p_admin_id uuid,
  p_source text,
  p_name text,
  p_city text,
  p_address text,
  p_notes text,
  p_maps_url text,
  p_cents integer,
  p_expected_revision bigint default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  v_map public.lts_shared_maps_customers%rowtype;
  v_manual public.lts_shared_customers_manual%rowtype;
  v_fare public.lts_company_tariffs%rowtype;
  v_created boolean := false;
  v_fare_changed boolean := false;
  v_source text;
  v_name text;
  v_city text;
  v_address text;
  v_notes text;
  v_url text;
  v_key text;
  v_identity text;
begin
  if p_source not in ('manual','maps') or p_source is null
     or p_cents is null or p_cents < 0 or p_cents > 99999999 then
    raise exception using errcode='P0001', message='Sorgente o tariffa non valida.';
  end if;
  if p_name is null or char_length(p_name) not between 2 and 500
     or p_city is null or char_length(p_city) not between 2 and 500
     or p_name <> upper(btrim(p_name)) or p_city <> upper(btrim(p_city))
     or p_name ~ '[[:cntrl:]]' or p_city ~ '[[:cntrl:]]'
     or coalesce(char_length(p_address),0)>1000
     or coalesce(char_length(p_notes),0)>1500 then
    raise exception using errcode='P0001', message='Nome, località o indirizzo non validi.';
  end if;
  if not exists(
    select 1 from public.lts_account_access
    where user_id=p_admin_id and role='admin' and enabled=true
      and removed_at is null
  ) then
    raise exception using errcode='P0001', message='Amministratore non autorizzato.';
  end if;
  if p_expected_revision is not null and p_expected_revision<0 then
    raise exception using errcode='P0001', message='Revisione tariffa non valida.';
  end if;
  -- All privileged writers of this RPC serialize identical customer/route pairs.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('lts-priced:'||p_name||chr(31)||p_city,0)
  );

  if p_source='maps' then
    if p_address is null or char_length(btrim(p_address))<4
       or p_maps_url is null or char_length(p_maps_url) not between 24 and 4096 then
      raise exception using errcode='P0001', message='Sede Google Maps incompleta.';
    end if;
    v_key:=public.lts_shared_maps_site_fingerprint(p_name,p_city,p_address);
    v_identity:=encode(sha256(convert_to(p_name||chr(31)||p_city||chr(31)||p_address,'UTF8')),'hex');
    -- A repeated URL and an equivalent address MUST resolve to the same site.
    select * into v_map from public.lts_shared_maps_customers
      where site_key=v_key or maps_url=p_maps_url or identity_key=v_identity
      order by case when site_key=v_key then 0 else 1 end
      limit 1 for update;
    if found then
      if v_map.name<>p_name or v_map.city<>p_city then
        raise exception using errcode='P0001',
          message='Il link Google Maps appartiene a una sede diversa. Rileggi il cliente.';
      end if;
      if exists(
        select 1 from public.lts_shared_maps_customers
         where (site_key=v_key or maps_url=p_maps_url or identity_key=v_identity)
           and id<>v_map.id
      ) then
        raise exception using errcode='P0001',
          message='Link e sede indicano due clienti distinti: verifica manualmente.';
      end if;
    else
      insert into public.lts_shared_maps_customers(
        identity_key,name,city,address,maps_url,created_by)
      values(v_identity,p_name,p_city,p_address,p_maps_url,p_admin_id)
      on conflict do nothing returning * into v_map;
      if not found then
        raise exception using errcode='P0001',
          message='Sede modificata contemporaneamente. Rileggi il cliente.';
      end if;
      v_created:=true;
    end if;
    v_source:='google_maps_link';
    v_name:=v_map.name;v_city:=v_map.city;v_address:=v_map.address;
    v_notes:=coalesce(v_map.notes,'');v_url:=v_map.maps_url;
  else
    if coalesce(char_length(p_address),0)>1000 or
       coalesce(char_length(p_notes),0)>1500 then
      raise exception using errcode='P0001', message='Dati cliente non validi.';
    end if;
    -- Do not duplicate an existing Maps depot with a manual entry.
    select * into v_map from public.lts_shared_maps_customers
      where name=p_name and city=p_city order by created_at limit 1;
    if found then
      v_source:='google_maps_link';
      v_name:=v_map.name;v_city:=v_map.city;v_address:=v_map.address;
      v_notes:=coalesce(v_map.notes,'');v_url:=v_map.maps_url;
    else
      select * into v_manual from public.lts_shared_customers_manual
       where upper(btrim(name))=p_name and upper(btrim(city))=p_city
       limit 1 for update;
      if not found then
        insert into public.lts_shared_customers_manual(
          name,city,address,notes,created_by)
        values(p_name,p_city,coalesce(p_address,''),coalesce(p_notes,''),p_admin_id)
        on conflict do nothing returning * into v_manual;
        if not found then
          raise exception using errcode='P0001',
            message='Cliente modificato contemporaneamente. Riprova.';
        end if;
        v_created:=true;
      end if;
      v_source:='manual';
      v_name:=v_manual.name;v_city:=v_manual.city;v_address:=v_manual.address;
      v_notes:=v_manual.notes;v_url:='';
    end if;
  end if;

  select * into v_fare from public.lts_company_tariffs
    where client=v_name and city=v_city for update;
  if found then
    if v_fare.cents is distinct from p_cents then
      if p_expected_revision is null or
         p_expected_revision<>v_fare.revision then
        raise exception using errcode='P0001',
          message='Tariffa cambiata: aggiorna e conferma il nuovo importo.';
      end if;
      update public.lts_company_tariffs
        set cents=p_cents, revision=v_fare.revision+1,
            updated_at=now(),updated_by=p_admin_id
        where id=v_fare.id and revision=v_fare.revision
        returning * into v_fare;
      if not found then
        raise exception using errcode='P0001',
          message='Conflitto modifica tariffa: aggiorna.';
      end if;
      v_fare_changed:=true;
    end if;
  else
    if p_expected_revision is not null and p_expected_revision<>0 then
      raise exception using errcode='P0001',
        message='Tariffa cambiata: aggiorna la pagina.';
    end if;
    insert into public.lts_company_tariffs(client,city,cents,updated_by)
      values(v_name,v_city,p_cents,p_admin_id)
      on conflict do nothing returning * into v_fare;
    if not found then
      raise exception using errcode='P0001',
        message='Tariffa creata contemporaneamente: aggiorna la pagina.';
    end if;
    v_fare_changed:=true;
  end if;
  return jsonb_build_object(
    'created',v_created,'rateChanged',v_fare_changed,
    'customer',jsonb_build_object(
      'name',v_name,'city',v_city,'address',v_address,
      'mapsUrl',v_url,'source',v_source,'operationalNotes',v_notes
    ),
    'tariff',jsonb_build_object(
      'id',v_fare.id,'client',v_fare.client,'city',v_fare.city,
      'cents',v_fare.cents,'revision',v_fare.revision,
      'updatedAt',v_fare.updated_at
    )
  );
end;
$fn$;

revoke all on function public.lts_company_register_priced_customer(
  uuid,text,text,text,text,text,text,integer,bigint
) from public, anon, authenticated;
grant execute on function public.lts_company_register_priced_customer(
  uuid,text,text,text,text,text,text,integer,bigint
) to service_role;
