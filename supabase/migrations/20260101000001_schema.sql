-- ============================================================================
-- ApiStock · 0001 · Esquema base, claves compuestas y triggers de integridad
-- Requiere PostgreSQL >= 15 (UNIQUE ... NULLS NOT DISTINCT).
--
-- Convenciones:
--  * Todas las tablas de datos tienen PK (user_id, id). Las claves foráneas son
--    compuestas (user_id, x_id): una fila nunca puede referenciar datos de otro usuario.
--  * El cliente NO escribe en tablas. Todas las escrituras pasan por RPC (0003).
--  * Funciones internas en el esquema `private` (no expuesto por la API).
--  * Errores de negocio: SQLSTATE 'AS001' = conflicto de versión, 'AS002' = rechazo.
-- ============================================================================

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Perfil por usuario (no sincronizable): rol, época de datos y contador de secuencia
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  is_admin        boolean     not null default false,
  data_epoch      integer     not null default 1,   -- sube con cada importación
  seq_counter     bigint      not null default 0,   -- último server_seq emitido
  tombstone_floor bigint      not null default 0,   -- cursor mínimo con borrados fiables
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------
create table public.categories (
  user_id    uuid    not null references auth.users (id) on delete cascade,
  id         uuid    not null,
  name       text    not null check (char_length(btrim(name)) between 1 and 80),
  icon       text    check (icon is null or char_length(icon) <= 40),
  sort_order integer not null default 0,
  version    integer not null default 1,
  updated_at timestamptz not null default now(),
  server_seq bigint  not null default 0,
  primary key (user_id, id)
);
create unique index categories_name_uq on public.categories (user_id, lower(btrim(name)));

create table public.systems (
  user_id     uuid    not null references auth.users (id) on delete cascade,
  id          uuid    not null,
  name        text    not null check (char_length(btrim(name)) between 1 and 60),
  code_letter text    not null check (code_letter ~ '^[A-Z]$'),
  color       text    check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order  integer not null default 0,
  version     integer not null default 1,
  updated_at  timestamptz not null default now(),
  server_seq  bigint  not null default 0,
  primary key (user_id, id),
  unique (user_id, code_letter)
);
create unique index systems_name_uq on public.systems (user_id, lower(btrim(name)));

create table public.locations (
  user_id    uuid    not null references auth.users (id) on delete cascade,
  id         uuid    not null,
  parent_id  uuid,
  name       text    not null check (char_length(btrim(name)) between 1 and 80),
  sort_order integer not null default 0,
  version    integer not null default 1,
  updated_at timestamptz not null default now(),
  server_seq bigint  not null default 0,
  primary key (user_id, id),
  foreign key (user_id, parent_id) references public.locations (user_id, id)
    deferrable initially immediate
);
create unique index locations_sibling_uq on public.locations
  (user_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name)));

create table public.item_types (
  user_id        uuid    not null references auth.users (id) on delete cascade,
  id             uuid    not null,
  category_id    uuid    not null,
  name           text    not null check (char_length(btrim(name)) between 1 and 80),
  icon           text    check (icon is null or char_length(icon) <= 40),
  mode           text    not null check (mode in ('unit', 'bulk')),
  code_prefix    text    not null check (code_prefix ~ '^[A-Z]{1,3}$'),
  uses_system    boolean not null default false,
  attribute_defs jsonb   not null default '[]'::jsonb
                 check (jsonb_typeof(attribute_defs) = 'array' and pg_column_size(attribute_defs) <= 8000),
  sort_order     integer not null default 0,
  version        integer not null default 1,
  updated_at     timestamptz not null default now(),
  server_seq     bigint  not null default 0,
  primary key (user_id, id),
  unique (user_id, code_prefix),
  foreign key (user_id, category_id) references public.categories (user_id, id)
    on delete cascade deferrable initially immediate
);
create unique index item_types_name_uq on public.item_types (user_id, category_id, lower(btrim(name)));

-- ---------------------------------------------------------------------------
-- Inventario
-- ---------------------------------------------------------------------------
create table public.units (
  user_id     uuid    not null references auth.users (id) on delete cascade,
  id          uuid    not null,
  type_id     uuid    not null,
  system_id   uuid,
  code        text    not null check (code ~ '^[A-Z0-9][A-Z0-9-]{0,19}$'),
  description text    check (description is null or char_length(description) <= 120),
  status      text    not null check (status in ('new', 'very_good', 'good', 'used', 'poor', 'unusable')),
  location_id uuid    not null,
  attrs       jsonb   not null default '{}'::jsonb
              check (jsonb_typeof(attrs) = 'object' and pg_column_size(attrs) <= 8000),
  notes       text    check (notes is null or char_length(notes) <= 2000),
  version     integer not null default 1,
  updated_at  timestamptz not null default now(),
  server_seq  bigint  not null default 0,
  primary key (user_id, id),
  unique (user_id, code),
  foreign key (user_id, type_id)     references public.item_types (user_id, id) deferrable initially immediate,
  foreign key (user_id, system_id)   references public.systems    (user_id, id) deferrable initially immediate,
  foreign key (user_id, location_id) references public.locations  (user_id, id) deferrable initially immediate
);

-- Material agrupado. Identidad natural: (tipo, sistema, ubicación).
-- El id de fila es meramente técnico; los clientes reconcilian por clave natural.
create table public.stock_lots (
  user_id     uuid    not null references auth.users (id) on delete cascade,
  id          uuid    not null,
  type_id     uuid    not null,
  system_id   uuid,
  location_id uuid    not null,
  quantity    integer not null check (quantity >= 0 and quantity <= 10000000),
  version     integer not null default 1,
  updated_at  timestamptz not null default now(),
  server_seq  bigint  not null default 0,
  primary key (user_id, id),
  unique nulls not distinct (user_id, type_id, system_id, location_id),
  foreign key (user_id, type_id)     references public.item_types (user_id, id) on delete cascade deferrable initially immediate,
  foreign key (user_id, system_id)   references public.systems    (user_id, id) on delete cascade deferrable initially immediate,
  foreign key (user_id, location_id) references public.locations  (user_id, id) on delete cascade deferrable initially immediate
);

-- Compatibilidad: UNA fila por pareja (unit_a < unit_b). Imposible que dos filas discrepen.
create table public.compatibilities (
  user_id    uuid    not null references auth.users (id) on delete cascade,
  id         uuid    not null,
  unit_a     uuid    not null,
  unit_b     uuid    not null,
  result     text    not null check (result in ('compatible', 'fits', 'incompatible')),
  note       text    check (note is null or char_length(note) <= 200),
  version    integer not null default 1,
  updated_at timestamptz not null default now(),
  server_seq bigint  not null default 0,
  primary key (user_id, id),
  unique (user_id, unit_a, unit_b),
  check (unit_a < unit_b),
  foreign key (user_id, unit_a) references public.units (user_id, id) on delete cascade deferrable initially immediate,
  foreign key (user_id, unit_b) references public.units (user_id, id) on delete cascade deferrable initially immediate
);
create index compatibilities_unit_b_idx on public.compatibilities (user_id, unit_b);

-- ---------------------------------------------------------------------------
-- Operaciones recientes (máximo 10 por usuario, gestionado en apply_batch)
-- ---------------------------------------------------------------------------
create table public.recent_operations (
  user_id    uuid    not null references auth.users (id) on delete cascade,
  id         uuid    not null,                       -- = op_id de la operación
  kind       text    not null check (char_length(kind) <= 40),
  summary    text    not null check (char_length(summary) <= 300),
  inverse    jsonb   check (inverse is null or pg_column_size(inverse) <= 500000),
  device_id  text    not null,
  created_at timestamptz not null default now(),
  version    integer not null default 1,
  updated_at timestamptz not null default now(),
  server_seq bigint  not null default 0,
  primary key (user_id, id)
);

-- ---------------------------------------------------------------------------
-- Infraestructura de sincronización y códigos (solo servidor)
-- ---------------------------------------------------------------------------
create table public.tombstones (
  user_id    uuid        not null,            -- sin FK a propósito (ver DECISIONS D25)
  server_seq bigint      not null,
  table_name text        not null,
  row_id     uuid        not null,
  created_at timestamptz not null default now(),
  primary key (user_id, server_seq)
);
create index tombstones_created_idx on public.tombstones (user_id, created_at);

create table public.applied_ops (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  op_id      uuid        not null,
  device_id  text        not null,
  result     jsonb       not null,
  applied_at timestamptz not null default now(),
  primary key (user_id, op_id)
);
create index applied_ops_applied_idx on public.applied_ops (user_id, applied_at);

create table public.code_counters (
  user_id    uuid    not null references auth.users (id) on delete cascade,
  prefix     text    not null check (prefix ~ '^[A-Z0-9]{1,5}$'),
  next_value integer not null default 1 check (next_value >= 1),
  primary key (user_id, prefix)
);

-- Todo código asignado o reservado alguna vez. Nunca se borra: garantiza "no reutilizar".
-- unit_id NULL = reservado por un dispositivo y aún sin usar.
create table public.code_registry (
  user_id     uuid        not null references auth.users (id) on delete cascade,
  code        text        not null,
  unit_id     uuid,
  reserved_by text,
  created_at  timestamptz not null default now(),
  primary key (user_id, code)
);

-- Índices de descarga incremental y consulta
create index categories_seq_idx        on public.categories        (user_id, server_seq);
create index systems_seq_idx           on public.systems           (user_id, server_seq);
create index locations_seq_idx         on public.locations         (user_id, server_seq);
create index item_types_seq_idx        on public.item_types        (user_id, server_seq);
create index units_seq_idx             on public.units             (user_id, server_seq);
create index stock_lots_seq_idx        on public.stock_lots        (user_id, server_seq);
create index compatibilities_seq_idx   on public.compatibilities   (user_id, server_seq);
create index recent_operations_seq_idx on public.recent_operations (user_id, server_seq);
create index units_location_idx        on public.units            (user_id, location_id);
create index units_type_idx            on public.units            (user_id, type_id);

-- ============================================================================
-- Funciones internas
-- ============================================================================

-- Errores con código propio
create or replace function private.fail(p_reason text, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception '%', p_reason using errcode = 'AS002', detail = p_detail::text;
end $$;

create or replace function private.conflict(p_reason text, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception '%', p_reason using errcode = 'AS001', detail = p_detail::text;
end $$;

create or replace function private.safe_json(p text)
returns jsonb language plpgsql immutable set search_path = public, pg_temp as $$
begin
  if p is null then return null; end if;
  return p::jsonb;
exception when others then
  return to_jsonb(p);
end $$;

-- Siguiente secuencia por usuario. El UPDATE bloquea la fila de perfil hasta el commit:
-- las escrituras de un usuario quedan ordenadas y server_seq coincide con el orden de commit.
create or replace function private.next_seq(p_uid uuid)
returns bigint language sql volatile set search_path = public, pg_temp as $$
  update public.profiles set seq_counter = seq_counter + 1
   where user_id = p_uid
  returning seq_counter;
$$;

create or replace function private.format_code(p_prefix text, p_n integer)
returns text language sql immutable set search_path = public, pg_temp as $$
  select p_prefix || '-' || lpad(p_n::text, 2, '0');
$$;

-- Versión, marca de tiempo y secuencia en cada escritura
create or replace function private.touch_row()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
  else
    if new.user_id <> old.user_id or new.id <> old.id then
      perform private.fail('immutable_key');
    end if;
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  new.server_seq := private.next_seq(new.user_id);
  return new;
end $$;

-- Lápida de borrado para sincronización incremental
create or replace function private.record_tombstone()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_seq bigint;
begin
  if current_setting('apistock.bulk_replace', true) = 'on' then return old; end if;
  v_seq := private.next_seq(old.user_id);
  if v_seq is not null then
    insert into public.tombstones (user_id, server_seq, table_name, row_id)
    values (old.user_id, v_seq, tg_table_name, old.id);
  end if;
  return old;
end $$;

-- Ubicaciones: sin ciclos y profundidad máxima 12
create or replace function private.check_location_tree()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_cycle boolean; v_depth integer;
begin
  if new.parent_id is null then return new; end if;
  if new.parent_id = new.id then perform private.fail('location_cycle'); end if;
  with recursive up as (
    select l.id, l.parent_id, 1 as depth
      from public.locations l
     where l.user_id = new.user_id and l.id = new.parent_id
    union all
    select l.id, l.parent_id, up.depth + 1
      from public.locations l
      join up on l.id = up.parent_id
     where l.user_id = new.user_id and up.depth < 30
  )
  select coalesce(bool_or(id = new.id), false), coalesce(max(depth), 0)
    into v_cycle, v_depth from up;
  if v_cycle then perform private.fail('location_cycle'); end if;
  if v_depth >= 12 then perform private.fail('location_too_deep'); end if;
  return new;
end $$;

-- Impedir borrar categorías, tipos, sistemas o ubicaciones con material
create or replace function private.guard_category_delete()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_units bigint; v_qty bigint;
begin
  if current_setting('apistock.bulk_replace', true) = 'on' then return old; end if;
  select count(*) into v_units
    from public.units u join public.item_types t on t.user_id = u.user_id and t.id = u.type_id
   where t.user_id = old.user_id and t.category_id = old.id;
  select coalesce(sum(l.quantity), 0) into v_qty
    from public.stock_lots l join public.item_types t on t.user_id = l.user_id and t.id = l.type_id
   where t.user_id = old.user_id and t.category_id = old.id;
  if v_units > 0 or v_qty > 0 then
    perform private.fail('category_has_stock',
      jsonb_build_object('category_id', old.id, 'units', v_units, 'quantity', v_qty));
  end if;
  return old;
end $$;

create or replace function private.guard_type_delete()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_units bigint; v_qty bigint;
begin
  if current_setting('apistock.bulk_replace', true) = 'on' then return old; end if;
  select count(*) into v_units from public.units where user_id = old.user_id and type_id = old.id;
  select coalesce(sum(quantity), 0) into v_qty from public.stock_lots where user_id = old.user_id and type_id = old.id;
  if v_units > 0 or v_qty > 0 then
    perform private.fail('type_has_stock',
      jsonb_build_object('type_id', old.id, 'units', v_units, 'quantity', v_qty));
  end if;
  return old;
end $$;

create or replace function private.guard_system_delete()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_units bigint; v_qty bigint;
begin
  if current_setting('apistock.bulk_replace', true) = 'on' then return old; end if;
  select count(*) into v_units from public.units where user_id = old.user_id and system_id = old.id;
  select coalesce(sum(quantity), 0) into v_qty from public.stock_lots where user_id = old.user_id and system_id = old.id;
  if v_units > 0 or v_qty > 0 then
    perform private.fail('system_has_stock',
      jsonb_build_object('system_id', old.id, 'units', v_units, 'quantity', v_qty));
  end if;
  return old;
end $$;

create or replace function private.guard_location_delete()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_children bigint; v_units bigint; v_qty bigint;
begin
  if current_setting('apistock.bulk_replace', true) = 'on' then return old; end if;
  select count(*) into v_children from public.locations where user_id = old.user_id and parent_id = old.id;
  if v_children > 0 then
    perform private.fail('location_has_children', jsonb_build_object('location_id', old.id, 'children', v_children));
  end if;
  select count(*) into v_units from public.units where user_id = old.user_id and location_id = old.id;
  select coalesce(sum(quantity), 0) into v_qty from public.stock_lots where user_id = old.user_id and location_id = old.id;
  if v_units > 0 or v_qty > 0 then
    perform private.fail('location_has_stock',
      jsonb_build_object('location_id', old.id, 'units', v_units, 'quantity', v_qty));
  end if;
  return old;
end $$;

-- Cambiar modalidad o uso de sistema de un tipo solo si no tiene material (D12)
create or replace function private.guard_type_change()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_units bigint; v_qty bigint;
begin
  if new.mode is distinct from old.mode or new.uses_system is distinct from old.uses_system then
    select count(*) into v_units from public.units where user_id = old.user_id and type_id = old.id;
    select coalesce(sum(quantity), 0) into v_qty from public.stock_lots where user_id = old.user_id and type_id = old.id;
    if v_units > 0 or v_qty > 0 then
      perform private.fail('type_in_use',
        jsonb_build_object('type_id', old.id, 'units', v_units, 'quantity', v_qty));
    end if;
    delete from public.stock_lots where user_id = old.user_id and type_id = old.id and quantity = 0;
  end if;
  return new;
end $$;

-- Unidades: coherencia de sistema y registro de códigos (no reutilizables)
create or replace function private.check_unit()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  v_type public.item_types%rowtype;
  v_reg  public.code_registry%rowtype;
  v_dev  text;
begin
  if new.code is null then return new; end if;     -- lo reportará NOT NULL
  new.code := upper(btrim(new.code));

  select * into v_type from public.item_types where user_id = new.user_id and id = new.type_id;
  if found then
    if v_type.uses_system and new.system_id is null then
      perform private.fail('system_required', jsonb_build_object('type_id', new.type_id));
    end if;
    if not v_type.uses_system and new.system_id is not null then
      perform private.fail('system_not_allowed', jsonb_build_object('type_id', new.type_id));
    end if;
  end if;   -- si el tipo no existe, lo rechazará la clave foránea

  if current_setting('apistock.bulk_replace', true) = 'on' then return new; end if;

  if tg_op = 'INSERT' or new.code is distinct from old.code then
    select * into v_reg from public.code_registry where user_id = new.user_id and code = new.code;
    if found then
      if v_reg.unit_id is not null then
        if v_reg.unit_id <> new.id then
          perform private.fail('code_taken', jsonb_build_object('code', new.code));
        end if;
      else
        v_dev := nullif(current_setting('apistock.device_id', true), '');
        if v_reg.reserved_by is distinct from v_dev then
          perform private.fail('code_taken', jsonb_build_object('code', new.code));
        end if;
        update public.code_registry set unit_id = new.id, reserved_by = null
         where user_id = new.user_id and code = new.code;
      end if;
    else
      insert into public.code_registry (user_id, code, unit_id) values (new.user_id, new.code, new.id);
    end if;
  end if;
  return new;
end $$;

-- Lotes: solo para tipos "por cantidad" y con sistema coherente
create or replace function private.check_lot()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_type public.item_types%rowtype;
begin
  select * into v_type from public.item_types where user_id = new.user_id and id = new.type_id;
  if found then
    if v_type.mode <> 'bulk' then
      perform private.fail('lots_only_for_bulk', jsonb_build_object('type_id', new.type_id));
    end if;
    if v_type.uses_system and new.system_id is null then
      perform private.fail('system_required', jsonb_build_object('type_id', new.type_id));
    end if;
    if not v_type.uses_system and new.system_id is not null then
      perform private.fail('system_not_allowed', jsonb_build_object('type_id', new.type_id));
    end if;
  end if;
  return new;
end $$;

-- ============================================================================
-- Triggers
-- ============================================================================
create trigger trg_touch before insert or update on public.categories        for each row execute function private.touch_row();
create trigger trg_touch before insert or update on public.systems           for each row execute function private.touch_row();
create trigger trg_touch before insert or update on public.locations         for each row execute function private.touch_row();
create trigger trg_touch before insert or update on public.item_types        for each row execute function private.touch_row();
create trigger trg_touch before insert or update on public.units             for each row execute function private.touch_row();
create trigger trg_touch before insert or update on public.stock_lots        for each row execute function private.touch_row();
create trigger trg_touch before insert or update on public.compatibilities   for each row execute function private.touch_row();
create trigger trg_touch before insert or update on public.recent_operations for each row execute function private.touch_row();

create trigger trg_tombstone after delete on public.categories        for each row execute function private.record_tombstone();
create trigger trg_tombstone after delete on public.systems           for each row execute function private.record_tombstone();
create trigger trg_tombstone after delete on public.locations         for each row execute function private.record_tombstone();
create trigger trg_tombstone after delete on public.item_types        for each row execute function private.record_tombstone();
create trigger trg_tombstone after delete on public.units             for each row execute function private.record_tombstone();
create trigger trg_tombstone after delete on public.stock_lots        for each row execute function private.record_tombstone();
create trigger trg_tombstone after delete on public.compatibilities   for each row execute function private.record_tombstone();
create trigger trg_tombstone after delete on public.recent_operations for each row execute function private.record_tombstone();

create trigger trg_location_tree  before insert or update of parent_id on public.locations for each row execute function private.check_location_tree();
create trigger trg_guard_delete   before delete on public.categories for each row execute function private.guard_category_delete();
create trigger trg_guard_delete   before delete on public.item_types for each row execute function private.guard_type_delete();
create trigger trg_guard_delete   before delete on public.systems    for each row execute function private.guard_system_delete();
create trigger trg_guard_delete   before delete on public.locations  for each row execute function private.guard_location_delete();
create trigger trg_guard_change   before update on public.item_types for each row execute function private.guard_type_change();
create trigger trg_check_unit     before insert or update on public.units      for each row execute function private.check_unit();
create trigger trg_check_lot      before insert or update on public.stock_lots for each row execute function private.check_lot();
