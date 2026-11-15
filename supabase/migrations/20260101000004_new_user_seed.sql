-- ============================================================================
-- ApiStock · 0004 · Alta de usuario: perfil + catálogo inicial (DECISIONS D17)
-- Se ejecuta en la misma transacción que la creación del usuario en auth.users.
-- is_admin NUNCA se concede aquí: se asigna a mano para el primer administrador (ver supabase/README.md).
-- ============================================================================

create or replace function private.seed_default_catalog(p_uid uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_hive  uuid := gen_random_uuid();
  c_comp  uuid := gen_random_uuid();
  c_nuc   uuid := gen_random_uuid();
  c_fram  uuid := gen_random_uuid();
  c_tool  uuid := gen_random_uuid();
  c_acc   uuid := gen_random_uuid();
  c_feed  uuid := gen_random_uuid();
  c_extr  uuid := gen_random_uuid();
  c_other uuid := gen_random_uuid();
begin
  insert into public.categories (user_id, id, name, icon, sort_order) values
    (p_uid, c_hive,  'Colmenas y cuerpos',          'hive',      1),
    (p_uid, c_comp,  'Componentes',                 'component', 2),
    (p_uid, c_nuc,   'Núcleos',                     'nucleus',   3),
    (p_uid, c_fram,  'Cuadros',                     'frame',     4),
    (p_uid, c_tool,  'Herramientas',                'tool',      5),
    (p_uid, c_acc,   'Accesorios',                  'accessory', 6),
    (p_uid, c_feed,  'Alimentación y tratamientos', 'feed',      7),
    (p_uid, c_extr,  'Extracción y envasado',       'extractor', 8),
    (p_uid, c_other, 'Otros',                       'more',      9);

  insert into public.systems (user_id, id, name, code_letter, color, sort_order) values
    (p_uid, gen_random_uuid(), 'Langstroth', 'L', '#2f5d8a', 1),
    (p_uid, gen_random_uuid(), 'Layens',     'I', '#7a3f8c', 2);

  insert into public.item_types
    (user_id, id, category_id, name, icon, mode, code_prefix, uses_system, attribute_defs, sort_order)
  values
    -- Colmenas y cuerpos: unidades individualizadas, con sistema
    (p_uid, gen_random_uuid(), c_hive, 'Fondo', 'floor', 'unit', 'F', true,
       '[{"key":"sanitario","label":"Sanitario","kind":"boolean"}]'::jsonb, 1),
    (p_uid, gen_random_uuid(), c_hive, 'Cámara de cría', 'brood', 'unit', 'C', true,
       '[{"key":"dim_ext","label":"Dimensiones exteriores (cm)","kind":"text"},{"key":"dim_int","label":"Dimensiones interiores (cm)","kind":"text"}]'::jsonb, 2),
    (p_uid, gen_random_uuid(), c_hive, 'Alza', 'super', 'unit', 'A', true,
       '[{"key":"dim_ext","label":"Dimensiones exteriores (cm)","kind":"text"},{"key":"dim_int","label":"Dimensiones interiores (cm)","kind":"text"}]'::jsonb, 3),
    (p_uid, gen_random_uuid(), c_hive, 'Entretapa', 'inner-cover', 'unit', 'E', true, '[]'::jsonb, 4),
    (p_uid, gen_random_uuid(), c_hive, 'Tapa', 'lid', 'unit', 'T', true, '[]'::jsonb, 5),
    (p_uid, gen_random_uuid(), c_hive, 'Colmena vacía', 'hive', 'unit', 'V', true, '[]'::jsonb, 6),
    -- Componentes: por cantidad, con sistema
    (p_uid, gen_random_uuid(), c_comp, 'Excluidor de reina', 'excluder', 'bulk', 'XR', true, '[]'::jsonb, 1),
    (p_uid, gen_random_uuid(), c_comp, 'Rejilla', 'grid', 'bulk', 'RJ', true, '[]'::jsonb, 2),
    -- Núcleos
    (p_uid, gen_random_uuid(), c_nuc, 'Núcleo', 'nucleus', 'unit', 'N', true,
       '[{"key":"num_cuadros","label":"Número de cuadros","kind":"number"},{"key":"material","label":"Material","kind":"select","options":["Madera","Plástico","Otro"]}]'::jsonb, 1),
    -- Cuadros: por cantidad, con sistema
    (p_uid, gen_random_uuid(), c_fram, 'Cuadro', 'frame', 'bulk', 'CU', true,
       '[{"key":"tipo_cuadro","label":"Tipo de cuadro","kind":"text"}]'::jsonb, 1),
    -- Herramientas: por cantidad, sin sistema
    (p_uid, gen_random_uuid(), c_tool, 'Ahumador', 'smoker', 'bulk', 'AH', false, '[]'::jsonb, 1),
    (p_uid, gen_random_uuid(), c_tool, 'Palanca',  'hive-tool', 'bulk', 'PA', false, '[]'::jsonb, 2),
    (p_uid, gen_random_uuid(), c_tool, 'Cepillo',  'brush', 'bulk', 'CE', false, '[]'::jsonb, 3),
    -- Extracción y envasado: unidades individualizadas, sin sistema
    (p_uid, gen_random_uuid(), c_extr, 'Extractor',       'extractor', 'unit', 'EXT', false, '[]'::jsonb, 1),
    (p_uid, gen_random_uuid(), c_extr, 'Desoperculadora', 'uncapper',  'unit', 'DES', false, '[]'::jsonb, 2),
    (p_uid, gen_random_uuid(), c_extr, 'Madurador',       'tank',      'unit', 'MAD', false, '[]'::jsonb, 3);
end $$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (user_id) values (new.id);
  perform private.seed_default_catalog(new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
