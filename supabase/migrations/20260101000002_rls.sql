-- ============================================================================
-- ApiStock · 0002 · Row Level Security y privilegios
--
-- Modelo: el cliente SOLO LEE sus filas (políticas SELECT). No existe ninguna política
-- INSERT/UPDATE/DELETE y además se revocan los privilegios: toda escritura pasa por las
-- RPC de 0003, que validan, ordenan y son idempotentes.
-- La clave `anon` es pública por diseño: sin privilegios ni políticas no puede leer nada.
-- ============================================================================

alter table public.profiles          enable row level security;
alter table public.categories        enable row level security;
alter table public.systems           enable row level security;
alter table public.locations         enable row level security;
alter table public.item_types        enable row level security;
alter table public.units             enable row level security;
alter table public.stock_lots        enable row level security;
alter table public.compatibilities   enable row level security;
alter table public.recent_operations enable row level security;
alter table public.tombstones        enable row level security;
alter table public.applied_ops       enable row level security;   -- sin políticas: solo servidor
alter table public.code_counters     enable row level security;   -- sin políticas: solo servidor
alter table public.code_registry     enable row level security;   -- sin políticas: solo servidor

create policy profiles_select_own on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));

create policy categories_select_own on public.categories
  for select to authenticated using (user_id = (select auth.uid()));
create policy systems_select_own on public.systems
  for select to authenticated using (user_id = (select auth.uid()));
create policy locations_select_own on public.locations
  for select to authenticated using (user_id = (select auth.uid()));
create policy item_types_select_own on public.item_types
  for select to authenticated using (user_id = (select auth.uid()));
create policy units_select_own on public.units
  for select to authenticated using (user_id = (select auth.uid()));
create policy stock_lots_select_own on public.stock_lots
  for select to authenticated using (user_id = (select auth.uid()));
create policy compatibilities_select_own on public.compatibilities
  for select to authenticated using (user_id = (select auth.uid()));
create policy recent_operations_select_own on public.recent_operations
  for select to authenticated using (user_id = (select auth.uid()));
create policy tombstones_select_own on public.tombstones
  for select to authenticated using (user_id = (select auth.uid()));

-- Privilegios: nada para anon; solo SELECT para authenticated en las tablas que lee el cliente
revoke all on all tables in schema public from anon, authenticated;
grant select on
  public.profiles, public.categories, public.systems, public.locations, public.item_types,
  public.units, public.stock_lots, public.compatibilities, public.recent_operations,
  public.tombstones
to authenticated;

-- Objetos futuros: sin privilegios por defecto para anon/authenticated
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
