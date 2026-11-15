-- ============================================================================
-- ApiStock · 0003 · RPC de escritura, lectura incremental y copias de seguridad
--
-- Las RPC de escritura son SECURITY DEFINER porque el cliente no tiene permiso de
-- escritura en tablas. Reglas para todas ellas:
--   * identidad SIEMPRE desde auth.uid(); jamás desde parámetros;
--   * todas las consultas filtran por user_id = auth.uid();
--   * search_path fijo; EXECUTE solo para `authenticated`.
-- Contratos JSON detallados en docs/SYNC_PROTOCOL.md
-- ============================================================================

-- Límite de tamaño de importación (bytes). Configurable aquí; el cliente tiene el suyo.
create or replace function private.max_import_bytes()
returns integer language sql immutable set search_path = public, pg_temp as $$
  select 5242880;
$$;

create or replace function private.strip_row(p jsonb)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select p - 'user_id' - 'version' - 'updated_at' - 'server_seq';
$$;

-- Columnas que el cliente puede enviar, por tabla y modo. NULL = tabla no permitida.
create or replace function private.table_columns(p_table text, p_mode text)
returns text[] language sql immutable set search_path = public, pg_temp as $$
  select case p_table || ':' || p_mode
    when 'categories:insert' then array['id','name','icon','sort_order']
    when 'categories:update' then array['name','icon','sort_order']
    when 'systems:insert'    then array['id','name','code_letter','color','sort_order']
    when 'systems:update'    then array['name','code_letter','color','sort_order']
    when 'locations:insert'  then array['id','parent_id','name','sort_order']
    when 'locations:update'  then array['parent_id','name','sort_order']
    when 'item_types:insert' then array['id','category_id','name','icon','mode','code_prefix','uses_system','attribute_defs','sort_order']
    when 'item_types:update' then array['category_id','name','icon','mode','code_prefix','uses_system','attribute_defs','sort_order']
    when 'units:insert'      then array['id','type_id','system_id','code','description','status','location_id','attrs','notes']
    when 'units:update'      then array['system_id','code','description','status','location_id','attrs','notes']
    else null
  end;
$$;

-- ----------------------------------------------------------------------------
-- Aplica UNA mutación. Lanza AS001 (conflicto) o AS002 (rechazo).
-- ----------------------------------------------------------------------------
create or replace function private.apply_mutation(p_uid uuid, m jsonb)
returns void language plpgsql set search_path = public, pg_temp as $$
declare
  v_kind    text := m->>'m';
  v_table   text := m->>'t';
  v_allowed text[];
  v_row     jsonb;
  v_set     jsonb;
  v_key     text;
  v_cols    text;
  v_sets    text;
  v_rid     uuid;
  v_base    integer;
  v_ver     integer;
  v_cur     jsonb;
  v_a       uuid;
  v_b       uuid;
  v_lo      uuid;
  v_hi      uuid;
  v_comp    public.compatibilities%rowtype;
  v_lot     public.stock_lots%rowtype;
  v_type    uuid;
  v_sys     uuid;
  v_loc     uuid;
  v_delta   integer;
begin
  if m is null or jsonb_typeof(m) <> 'object' then
    perform private.fail('invalid_mutation');
  end if;

  -- ------------------------------------------------------------ insert genérico
  if v_kind = 'insert' then
    v_allowed := private.table_columns(v_table, 'insert');
    if v_allowed is null then perform private.fail('invalid_table', jsonb_build_object('table', v_table)); end if;
    v_row := m->'row';
    if v_row is null or jsonb_typeof(v_row) <> 'object' or not (v_row ? 'id') then
      perform private.fail('invalid_row', jsonb_build_object('table', v_table));
    end if;
    for v_key in select jsonb_object_keys(v_row) loop
      if not (v_key = any (v_allowed)) then
        perform private.fail('invalid_field', jsonb_build_object('table', v_table, 'field', v_key));
      end if;
    end loop;
    v_row := v_row || jsonb_build_object('user_id', p_uid);
    select string_agg(quote_ident(k), ', ') into v_cols from jsonb_object_keys(v_row) as k;
    execute format(
      'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)',
      v_table, v_cols, v_cols, v_table) using v_row;

  -- ------------------------------------------------------------ update genérico
  elsif v_kind = 'update' then
    v_allowed := private.table_columns(v_table, 'update');
    if v_allowed is null then perform private.fail('invalid_table', jsonb_build_object('table', v_table)); end if;
    v_rid  := (m->>'id')::uuid;
    v_base := nullif(m->>'base_version', '')::integer;
    v_set  := m->'set';
    if v_base is null then perform private.fail('missing_base_version'); end if;
    if v_set is null or jsonb_typeof(v_set) <> 'object' or v_set = '{}'::jsonb then
      perform private.fail('invalid_set');
    end if;
    for v_key in select jsonb_object_keys(v_set) loop
      if not (v_key = any (v_allowed)) then
        perform private.fail('invalid_field', jsonb_build_object('table', v_table, 'field', v_key));
      end if;
    end loop;
    execute format('select version, to_jsonb(t) from public.%I t where user_id = $1 and id = $2 for update', v_table)
      into v_ver, v_cur using p_uid, v_rid;
    if v_ver is null then
      perform private.conflict('row_missing', jsonb_build_object('table', v_table, 'id', v_rid));
    end if;
    if v_ver <> v_base then
      perform private.conflict('version_mismatch', jsonb_build_object(
        'table', v_table, 'id', v_rid, 'base_version', v_base, 'server_row', private.strip_row(v_cur)));
    end if;
    select string_agg(format('%I = r.%I', k, k), ', ') into v_sets from jsonb_object_keys(v_set) as k;
    execute format(
      'update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) r where t.user_id = $2 and t.id = $3',
      v_table, v_sets, v_table) using v_set, p_uid, v_rid;

  -- ------------------------------------------------------------ delete genérico
  elsif v_kind = 'delete' then
    if private.table_columns(v_table, 'update') is null and v_table <> 'compatibilities' then
      perform private.fail('invalid_table', jsonb_build_object('table', v_table));
    end if;
    v_rid  := (m->>'id')::uuid;
    v_base := nullif(m->>'base_version', '')::integer;
    if v_base is null then perform private.fail('missing_base_version'); end if;
    execute format('select version, to_jsonb(t) from public.%I t where user_id = $1 and id = $2 for update', v_table)
      into v_ver, v_cur using p_uid, v_rid;
    if v_ver is null then return; end if;          -- ya no existe: estado deseado alcanzado
    if v_ver <> v_base then
      perform private.conflict('version_mismatch', jsonb_build_object(
        'table', v_table, 'id', v_rid, 'base_version', v_base, 'server_row', private.strip_row(v_cur)));
    end if;
    execute format('delete from public.%I where user_id = $1 and id = $2', v_table) using p_uid, v_rid;

  -- ------------------------------------------------------------ compatibilidad
  elsif v_kind = 'compat_set' then
    v_a := (m->>'unit_a')::uuid;
    v_b := (m->>'unit_b')::uuid;
    if v_a = v_b then perform private.fail('compat_same_unit'); end if;
    v_lo := least(v_a, v_b);
    v_hi := greatest(v_a, v_b);
    if m->>'result' is null or m->>'result' not in ('compatible', 'fits', 'incompatible') then
      perform private.fail('invalid_result');
    end if;
    v_base := nullif(m->>'base_version', '')::integer;
    select * into v_comp from public.compatibilities
     where user_id = p_uid and unit_a = v_lo and unit_b = v_hi for update;
    if not found then
      if v_base is not null then
        perform private.conflict('row_missing', jsonb_build_object('unit_a', v_lo, 'unit_b', v_hi));
      end if;
      insert into public.compatibilities (user_id, id, unit_a, unit_b, result, note)
      values (p_uid, coalesce(nullif(m->>'id', '')::uuid, gen_random_uuid()), v_lo, v_hi,
              m->>'result', nullif(m->>'note', ''));
    else
      if v_comp.result = m->>'result' and coalesce(v_comp.note, '') = coalesce(m->>'note', '') then
        return;                                    -- idéntica: no hay nada que hacer
      end if;
      if v_base is distinct from v_comp.version then
        perform private.conflict('version_mismatch', jsonb_build_object(
          'table', 'compatibilities', 'id', v_comp.id, 'base_version', v_base,
          'server_row', private.strip_row(to_jsonb(v_comp))));
      end if;
      update public.compatibilities
         set result = m->>'result', note = nullif(m->>'note', '')
       where user_id = p_uid and id = v_comp.id;
    end if;

  -- ------------------------------------------------------------ delta de cantidad
  elsif v_kind = 'lot_delta' then
    v_type  := (m->>'type_id')::uuid;
    v_sys   := nullif(m->>'system_id', '')::uuid;
    v_loc   := (m->>'location_id')::uuid;
    v_delta := (m->>'delta')::integer;
    if v_delta is null or v_delta = 0 or abs(v_delta) > 10000000 then
      perform private.fail('invalid_delta');
    end if;
    select * into v_lot from public.stock_lots
     where user_id = p_uid and type_id = v_type
       and system_id is not distinct from v_sys and location_id = v_loc
       for update;
    if not found then
      if v_delta < 0 then
        perform private.fail('insufficient_stock', jsonb_build_object(
          'available', 0, 'requested', -v_delta,
          'type_id', v_type, 'system_id', v_sys, 'location_id', v_loc));
      end if;
      insert into public.stock_lots (user_id, id, type_id, system_id, location_id, quantity)
      values (p_uid, coalesce(nullif(m->>'lot_id', '')::uuid, gen_random_uuid()),
              v_type, v_sys, v_loc, v_delta);
    else
      if v_lot.quantity + v_delta < 0 then
        perform private.fail('insufficient_stock', jsonb_build_object(
          'available', v_lot.quantity, 'requested', -v_delta,
          'type_id', v_type, 'system_id', v_sys, 'location_id', v_loc));
      end if;
      update public.stock_lots set quantity = quantity + v_delta
       where user_id = p_uid and id = v_lot.id;
    end if;

  -- ------------------------------------------------------------ operación reciente
  elsif v_kind = 'drop_recent' then
    delete from public.recent_operations
     where user_id = p_uid and id = (m->>'id')::uuid;

  else
    perform private.fail('unknown_mutation', jsonb_build_object('m', v_kind));
  end if;
end $$;

-- Mantenimiento: ops aplicadas > 90 días y lápidas > 90 días
create or replace function private.housekeeping(p_uid uuid)
returns void language plpgsql set search_path = public, pg_temp as $$
declare v_max bigint;
begin
  delete from public.applied_ops
   where user_id = p_uid and applied_at < now() - interval '90 days';
  select max(server_seq) into v_max from public.tombstones
   where user_id = p_uid and created_at < now() - interval '90 days';
  if v_max is not null then
    delete from public.tombstones where user_id = p_uid and server_seq <= v_max;
    update public.profiles set tombstone_floor = greatest(tombstone_floor, v_max) where user_id = p_uid;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- apply_batch: una operación atómica e idempotente
-- Resultado: status = applied | conflict | rejected | epoch_mismatch  (+ duplicate)
-- ----------------------------------------------------------------------------
create or replace function public.apply_batch(p_op jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid        uuid := auth.uid();
  v_profile    public.profiles%rowtype;
  v_op_id      uuid;
  v_device     text;
  v_mut        jsonb;
  v_idx        integer := 0;
  v_prev       jsonb;
  v_recent     jsonb;
  v_result     jsonb;
  v_state      text;
  v_msg        text;
  v_detail     text;
  v_constraint text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_op is null or jsonb_typeof(p_op) <> 'object' then
    return jsonb_build_object('status', 'rejected', 'reason', 'invalid_op');
  end if;
  if octet_length(p_op::text) > 1000000 then
    return jsonb_build_object('status', 'rejected', 'reason', 'op_too_large');
  end if;
  if jsonb_typeof(p_op->'mutations') is distinct from 'array'
     or jsonb_array_length(p_op->'mutations') not between 1 and 500 then
    return jsonb_build_object('status', 'rejected', 'reason', 'invalid_mutations');
  end if;

  v_op_id  := (p_op->>'op_id')::uuid;
  v_device := left(coalesce(p_op->>'device_id', ''), 64);
  if v_op_id is null then
    return jsonb_build_object('status', 'rejected', 'reason', 'missing_op_id');
  end if;
  if v_device = '' then
    return jsonb_build_object('status', 'rejected', 'reason', 'missing_device_id');
  end if;

  -- Serializa todas las escrituras de este usuario (también ordena server_seq)
  select * into v_profile from public.profiles where user_id = v_uid for update;
  if not found then
    raise exception 'profile_missing' using errcode = '28000';
  end if;

  -- Idempotencia
  select result into v_prev from public.applied_ops where user_id = v_uid and op_id = v_op_id;
  if found then
    return v_prev || jsonb_build_object('duplicate', true);
  end if;

  if coalesce((p_op->>'epoch')::integer, -1) <> v_profile.data_epoch then
    return jsonb_build_object('status', 'epoch_mismatch', 'epoch', v_profile.data_epoch);
  end if;

  begin   -- subtransacción: cualquier fallo deshace TODA la operación
    perform set_config('apistock.device_id', v_device, true);

    for v_mut in select value from jsonb_array_elements(p_op->'mutations') loop
      v_idx := v_idx + 1;
      perform private.apply_mutation(v_uid, v_mut);
    end loop;

    v_recent := p_op->'recent';
    if v_recent is not null and jsonb_typeof(v_recent) = 'object' then
      insert into public.recent_operations (user_id, id, kind, summary, inverse, device_id)
      values (v_uid, v_op_id,
              left(coalesce(v_recent->>'kind', 'operation'), 40),
              left(coalesce(v_recent->>'summary', ''), 300),
              v_recent->'inverse', v_device);
      delete from public.recent_operations
       where user_id = v_uid and id in (
         select id from public.recent_operations
          where user_id = v_uid order by created_at desc, id desc offset 10);
    end if;
  exception
    when sqlstate 'AS001' then
      get stacked diagnostics v_msg = message_text, v_detail = pg_exception_detail;
      return jsonb_build_object('status', 'conflict', 'mutation_index', v_idx,
                                'reason', v_msg, 'detail', private.safe_json(v_detail));
    when sqlstate 'AS002' or integrity_constraint_violation or data_exception then
      get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text,
                              v_detail = pg_exception_detail, v_constraint = constraint_name;
      return jsonb_build_object('status', 'rejected', 'mutation_index', v_idx,
                                'sqlstate', v_state, 'reason', v_msg,
                                'constraint', v_constraint, 'detail', private.safe_json(v_detail));
  end;

  v_result := jsonb_build_object(
    'status', 'applied',
    'epoch', v_profile.data_epoch,
    'server_seq', (select seq_counter from public.profiles where user_id = v_uid));
  insert into public.applied_ops (user_id, op_id, device_id, result)
  values (v_uid, v_op_id, v_device, v_result);
  perform private.housekeeping(v_uid);
  return v_result;
end $$;

-- ----------------------------------------------------------------------------
-- reserve_codes: reserva bloques de códigos únicos para un dispositivo
-- p_requests = [{"prefix":"AL","count":20}, ...]   (un elemento por prefijo)
-- ----------------------------------------------------------------------------
create or replace function public.reserve_codes(p_device_id text, p_requests jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid    uuid := auth.uid();
  v_req    jsonb;
  v_prefix text;
  v_count  integer;
  v_next   integer;
  v_codes  text[];
  v_code   text;
  v_result jsonb := '{}'::jsonb;
  v_guard  integer;
  v_total  integer := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_device_id is null or char_length(p_device_id) not between 1 and 64 then
    perform private.fail('invalid_device');
  end if;
  if p_requests is null or jsonb_typeof(p_requests) <> 'array'
     or jsonb_array_length(p_requests) not between 1 and 20 then
    perform private.fail('invalid_request');
  end if;

  perform 1 from public.profiles where user_id = v_uid for update;

  for v_req in select value from jsonb_array_elements(p_requests) loop
    v_prefix := v_req->>'prefix';
    v_count  := (v_req->>'count')::integer;
    if v_prefix is null or v_prefix !~ '^[A-Z0-9]{1,5}$' or v_count is null or v_count not between 1 and 200 then
      perform private.fail('invalid_request');
    end if;
    v_total := v_total + v_count;
    if v_total > 500 then perform private.fail('invalid_request'); end if;

    insert into public.code_counters (user_id, prefix) values (v_uid, v_prefix)
      on conflict (user_id, prefix) do nothing;
    select next_value into v_next from public.code_counters
     where user_id = v_uid and prefix = v_prefix for update;

    v_codes := '{}';
    v_guard := 0;
    while cardinality(v_codes) < v_count loop
      v_guard := v_guard + 1;
      if v_guard > v_count + 100000 then perform private.fail('code_space_exhausted'); end if;
      v_code := private.format_code(v_prefix, v_next);
      v_next := v_next + 1;
      insert into public.code_registry (user_id, code, unit_id, reserved_by)
      values (v_uid, v_code, null, p_device_id)
      on conflict (user_id, code) do nothing;
      if found then v_codes := v_codes || v_code; end if;   -- se salta lo ya registrado
    end loop;

    update public.code_counters set next_value = v_next
     where user_id = v_uid and prefix = v_prefix;
    v_result := v_result || jsonb_build_object(v_prefix, to_jsonb(v_codes));
  end loop;

  return jsonb_build_object('status', 'ok', 'codes', v_result);
end $$;

-- ----------------------------------------------------------------------------
-- pull_changes: descarga incremental por cursor server_seq
-- cursor = 0 → descarga completa (sin lápidas). Devuelve status = ok | full_resync_required
-- ----------------------------------------------------------------------------
create or replace function public.pull_changes(p_cursor bigint default 0, p_limit integer default 1000)
returns jsonb
language plpgsql security invoker stable set search_path = public, pg_temp as $$
declare
  v_uid     uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_limit   integer := least(greatest(coalesce(p_limit, 1000), 1), 2000);
  v_cursor  bigint  := greatest(coalesce(p_cursor, 0), 0);
  v_changes jsonb;
  v_next    bigint;
  v_count   integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into v_profile from public.profiles where user_id = v_uid;
  if not found then
    raise exception 'profile_missing' using errcode = '28000';
  end if;

  if v_cursor > 0 and v_cursor < v_profile.tombstone_floor then
    return jsonb_build_object('status', 'full_resync_required', 'epoch', v_profile.data_epoch);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('seq', p.server_seq, 't', p.t, 'r', p.r)
                            order by p.server_seq), '[]'::jsonb),
         coalesce(max(p.server_seq), v_cursor),
         count(*)::integer
    into v_changes, v_next, v_count
    from (
      select c.server_seq, c.t, c.r from (
        select x.server_seq, 'categories'::text as t, to_jsonb(x) - 'user_id' as r
          from public.categories x where x.user_id = v_uid and x.server_seq > v_cursor
        union all
        select x.server_seq, 'systems', to_jsonb(x) - 'user_id'
          from public.systems x where x.user_id = v_uid and x.server_seq > v_cursor
        union all
        select x.server_seq, 'locations', to_jsonb(x) - 'user_id'
          from public.locations x where x.user_id = v_uid and x.server_seq > v_cursor
        union all
        select x.server_seq, 'item_types', to_jsonb(x) - 'user_id'
          from public.item_types x where x.user_id = v_uid and x.server_seq > v_cursor
        union all
        select x.server_seq, 'units', to_jsonb(x) - 'user_id'
          from public.units x where x.user_id = v_uid and x.server_seq > v_cursor
        union all
        select x.server_seq, 'stock_lots', to_jsonb(x) - 'user_id'
          from public.stock_lots x where x.user_id = v_uid and x.server_seq > v_cursor
        union all
        select x.server_seq, 'compatibilities', to_jsonb(x) - 'user_id'
          from public.compatibilities x where x.user_id = v_uid and x.server_seq > v_cursor
        union all
        select x.server_seq, 'recent_operations', to_jsonb(x) - 'user_id'
          from public.recent_operations x where x.user_id = v_uid and x.server_seq > v_cursor
        union all
        select x.server_seq, 'tombstones', jsonb_build_object('table', x.table_name, 'id', x.row_id)
          from public.tombstones x
         where x.user_id = v_uid and v_cursor > 0 and x.server_seq > v_cursor
      ) c
      order by c.server_seq
      limit v_limit
    ) p;

  return jsonb_build_object(
    'status', 'ok',
    'epoch', v_profile.data_epoch,
    'server_seq', v_profile.seq_counter,
    'changes', v_changes,
    'next_cursor', v_next,
    'has_more', v_count = v_limit);
end $$;

-- ----------------------------------------------------------------------------
-- Copias de seguridad
-- Formato: {app_signature, schema_version, exported_at, data:{...}}
-- ----------------------------------------------------------------------------
create or replace function public.export_backup()
returns jsonb
language plpgsql security definer stable set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  -- Una sola sentencia: instantánea coherente
  return (
    select jsonb_build_object(
      'app_signature', 'apistock-backup',
      'schema_version', 1,
      'exported_at', now(),
      'data', jsonb_build_object(
        'categories', coalesce((select jsonb_agg(private.strip_row(to_jsonb(x)) order by x.sort_order, x.name)
                                  from public.categories x where x.user_id = v_uid), '[]'::jsonb),
        'systems', coalesce((select jsonb_agg(private.strip_row(to_jsonb(x)) order by x.sort_order, x.name)
                                  from public.systems x where x.user_id = v_uid), '[]'::jsonb),
        'locations', coalesce((select jsonb_agg(private.strip_row(to_jsonb(x)) order by x.sort_order, x.name)
                                  from public.locations x where x.user_id = v_uid), '[]'::jsonb),
        'item_types', coalesce((select jsonb_agg(private.strip_row(to_jsonb(x)) order by x.sort_order, x.name)
                                  from public.item_types x where x.user_id = v_uid), '[]'::jsonb),
        'units', coalesce((select jsonb_agg(private.strip_row(to_jsonb(x)) order by x.code)
                                  from public.units x where x.user_id = v_uid), '[]'::jsonb),
        'stock_lots', coalesce((select jsonb_agg(private.strip_row(to_jsonb(x)) order by x.id)
                                  from public.stock_lots x where x.user_id = v_uid), '[]'::jsonb),
        'compatibilities', coalesce((select jsonb_agg(private.strip_row(to_jsonb(x)) order by x.id)
                                  from public.compatibilities x where x.user_id = v_uid), '[]'::jsonb),
        'code_counters', coalesce((select jsonb_agg(jsonb_build_object('prefix', x.prefix, 'next_value', x.next_value)
                                                    order by x.prefix)
                                  from public.code_counters x where x.user_id = v_uid), '[]'::jsonb)
      )
    )
  );
end $$;

-- Migración de copias antiguas hasta la versión actual (1). Se amplía al cambiar el esquema.
create or replace function private.migrate_backup(p jsonb)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select p;
$$;

-- Sustituye TODO el inventario del usuario de forma atómica
create or replace function public.import_backup(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid     uuid := auth.uid();
  v_payload jsonb;
  v_data    jsonb;
  v_key     text;
  v_ver     integer;
  v_epoch   integer;
  v_counts  jsonb;
  v_state   text;
  v_msg     text;
  v_detail  text;
  v_constraint text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  begin  -- todo o nada
    if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
      perform private.fail('invalid_structure');
    end if;
    if octet_length(p_payload::text) > private.max_import_bytes() then
      perform private.fail('import_too_large', jsonb_build_object('max_bytes', private.max_import_bytes()));
    end if;
    if p_payload->>'app_signature' is distinct from 'apistock-backup' then
      perform private.fail('invalid_signature');
    end if;
    if jsonb_typeof(p_payload->'schema_version') is distinct from 'number' then
      perform private.fail('invalid_schema_version');
    end if;
    v_ver := (p_payload->>'schema_version')::integer;
    if v_ver < 1 or v_ver > 1 then
      perform private.fail('unsupported_schema_version', jsonb_build_object('version', v_ver, 'supported', 1));
    end if;
    v_payload := private.migrate_backup(p_payload);
    v_data := v_payload->'data';
    if jsonb_typeof(v_data) is distinct from 'object' then
      perform private.fail('invalid_structure');
    end if;
    foreach v_key in array array['categories','systems','locations','item_types','units','stock_lots','compatibilities'] loop
      if jsonb_typeof(v_data->v_key) is distinct from 'array' then
        perform private.fail('invalid_structure', jsonb_build_object('key', v_key));
      end if;
      if jsonb_array_length(v_data->v_key) > 100000 then
        perform private.fail('too_many_rows', jsonb_build_object('key', v_key));
      end if;
      if exists (select 1 from jsonb_array_elements(v_data->v_key) as e(value) where jsonb_typeof(e.value) <> 'object') then
        perform private.fail('invalid_structure', jsonb_build_object('key', v_key));
      end if;
    end loop;

    -- Bloqueo y modo de sustitución (desactiva guardas, lápidas y registro de códigos)
    perform 1 from public.profiles where user_id = v_uid for update;
    perform set_config('apistock.bulk_replace', 'on', true);
    set constraints all deferred;

    delete from public.compatibilities   where user_id = v_uid;
    delete from public.units             where user_id = v_uid;
    delete from public.stock_lots        where user_id = v_uid;
    delete from public.item_types        where user_id = v_uid;
    delete from public.categories        where user_id = v_uid;
    delete from public.systems           where user_id = v_uid;
    delete from public.locations         where user_id = v_uid;
    delete from public.recent_operations where user_id = v_uid;

    insert into public.categories (user_id, id, name, icon, sort_order)
    select v_uid, r.id, r.name, r.icon, coalesce(r.sort_order, 0)
      from jsonb_array_elements(v_data->'categories') as e(value)
     cross join lateral jsonb_populate_record(null::public.categories, e.value) as r;

    insert into public.systems (user_id, id, name, code_letter, color, sort_order)
    select v_uid, r.id, r.name, r.code_letter, r.color, coalesce(r.sort_order, 0)
      from jsonb_array_elements(v_data->'systems') as e(value)
     cross join lateral jsonb_populate_record(null::public.systems, e.value) as r;

    insert into public.locations (user_id, id, parent_id, name, sort_order)
    select v_uid, r.id, r.parent_id, r.name, coalesce(r.sort_order, 0)
      from jsonb_array_elements(v_data->'locations') as e(value)
     cross join lateral jsonb_populate_record(null::public.locations, e.value) as r;

    insert into public.item_types (user_id, id, category_id, name, icon, mode, code_prefix, uses_system, attribute_defs, sort_order)
    select v_uid, r.id, r.category_id, r.name, r.icon, r.mode, r.code_prefix,
           coalesce(r.uses_system, false), coalesce(r.attribute_defs, '[]'::jsonb), coalesce(r.sort_order, 0)
      from jsonb_array_elements(v_data->'item_types') as e(value)
     cross join lateral jsonb_populate_record(null::public.item_types, e.value) as r;

    insert into public.units (user_id, id, type_id, system_id, code, description, status, location_id, attrs, notes)
    select v_uid, r.id, r.type_id, r.system_id, r.code, r.description, r.status, r.location_id,
           coalesce(r.attrs, '{}'::jsonb), r.notes
      from jsonb_array_elements(v_data->'units') as e(value)
     cross join lateral jsonb_populate_record(null::public.units, e.value) as r;

    insert into public.stock_lots (user_id, id, type_id, system_id, location_id, quantity)
    select v_uid, r.id, r.type_id, r.system_id, r.location_id, r.quantity
      from jsonb_array_elements(v_data->'stock_lots') as e(value)
     cross join lateral jsonb_populate_record(null::public.stock_lots, e.value) as r;

    insert into public.compatibilities (user_id, id, unit_a, unit_b, result, note)
    select v_uid, r.id, least(r.unit_a, r.unit_b), greatest(r.unit_a, r.unit_b), r.result, r.note
      from jsonb_array_elements(v_data->'compatibilities') as e(value)
     cross join lateral jsonb_populate_record(null::public.compatibilities, e.value) as r
    on conflict (user_id, unit_a, unit_b) do nothing;

    -- Registro de códigos y contadores: solo crecen, nunca se reinician
    insert into public.code_registry (user_id, code, unit_id)
    select v_uid, u.code, u.id from public.units u where u.user_id = v_uid
    on conflict (user_id, code) do update set unit_id = excluded.unit_id, reserved_by = null;

    insert into public.code_counters (user_id, prefix, next_value)
    select v_uid, s.m[1], max(s.m[2]::integer) + 1
      from (select regexp_match(u.code, '^([A-Z0-9]{1,5})-([0-9]{1,9})$') as m
              from public.units u where u.user_id = v_uid) s
     where s.m is not null
     group by s.m[1]
    on conflict (user_id, prefix) do update
      set next_value = greatest(code_counters.next_value, excluded.next_value);

    if jsonb_typeof(v_data->'code_counters') = 'array' then
      insert into public.code_counters (user_id, prefix, next_value)
      select v_uid, c.prefix, c.next_value
        from jsonb_array_elements(v_data->'code_counters') as e(value)
       cross join lateral jsonb_to_record(e.value) as c(prefix text, next_value integer)
       where c.prefix ~ '^[A-Z0-9]{1,5}$' and c.next_value >= 1
      on conflict (user_id, prefix) do update
        set next_value = greatest(code_counters.next_value, excluded.next_value);
    end if;

    set constraints all immediate;   -- valida aquí las referencias para poder rechazar con mensaje

    update public.profiles
       set data_epoch = data_epoch + 1, tombstone_floor = seq_counter
     where user_id = v_uid
    returning data_epoch into v_epoch;
    delete from public.tombstones where user_id = v_uid;

    v_counts := jsonb_build_object(
      'categories',      (select count(*) from public.categories      where user_id = v_uid),
      'systems',         (select count(*) from public.systems         where user_id = v_uid),
      'locations',       (select count(*) from public.locations       where user_id = v_uid),
      'item_types',      (select count(*) from public.item_types      where user_id = v_uid),
      'units',           (select count(*) from public.units           where user_id = v_uid),
      'stock_lots',      (select count(*) from public.stock_lots      where user_id = v_uid),
      'compatibilities', (select count(*) from public.compatibilities where user_id = v_uid));
  exception
    when sqlstate 'AS002' or integrity_constraint_violation or data_exception then
      get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text,
                              v_detail = pg_exception_detail, v_constraint = constraint_name;
      return jsonb_build_object('status', 'rejected', 'sqlstate', v_state, 'reason', v_msg,
                                'constraint', v_constraint, 'detail', private.safe_json(v_detail));
  end;

  return jsonb_build_object('status', 'imported', 'epoch', v_epoch, 'counts', v_counts);
end $$;

-- ----------------------------------------------------------------------------
-- Privilegios de ejecución: solo usuarios autenticados
-- ----------------------------------------------------------------------------
revoke all on function public.apply_batch(jsonb)            from public, anon;
revoke all on function public.reserve_codes(text, jsonb)    from public, anon;
revoke all on function public.pull_changes(bigint, integer) from public, anon;
revoke all on function public.export_backup()               from public, anon;
revoke all on function public.import_backup(jsonb)          from public, anon;
grant execute on function public.apply_batch(jsonb)            to authenticated;
grant execute on function public.reserve_codes(text, jsonb)    to authenticated;
grant execute on function public.pull_changes(bigint, integer) to authenticated;
grant execute on function public.export_backup()               to authenticated;
grant execute on function public.import_backup(jsonb)          to authenticated;
