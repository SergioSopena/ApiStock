-- ApiStock · pruebas de seguridad y aislamiento. Ejecutar con: supabase test db
begin;
select plan(15);

-- Dos usuarios (el trigger on_auth_user_created crea perfil y catálogo inicial)
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'u1@test.local'),
  ('00000000-0000-4000-8000-0000000000b2', 'u2@test.local');

-- 1. RLS activo en todas las tablas públicas
select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0, 'RLS activado en todas las tablas públicas');

-- ===== Como usuario 1 =====
do $$ begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
end $$;
set local role authenticated;

select is((select count(*)::int from public.categories), 9,
  'U1 ve exactamente sus 9 categorías iniciales');
select is((select count(*)::int from public.categories where user_id <> '00000000-0000-4000-8000-0000000000a1'), 0,
  'U1 no ve categorías de otros usuarios');
select is((select count(*)::int from public.profiles), 1, 'U1 solo ve su perfil');

select throws_ok(
  $$insert into public.categories (user_id, id, name) values ('00000000-0000-4000-8000-0000000000a1', gen_random_uuid(), 'X')$$,
  '42501', null, 'Insertar directamente en tablas está denegado');
select throws_ok(
  $$update public.categories set name = 'X'$$,
  '42501', null, 'Actualizar directamente está denegado');
select throws_ok(
  $$delete from public.categories$$,
  '42501', null, 'Borrar directamente está denegado');
select throws_ok(
  $$update public.profiles set is_admin = true$$,
  '42501', null, 'Un usuario no puede concederse el rol de administrador');
select throws_ok(
  $$select * from public.code_registry$$,
  '42501', null, 'El registro de códigos no es legible por el cliente');
select throws_ok(
  $$select private.next_seq('00000000-0000-4000-8000-0000000000a1')$$,
  '42501', null, 'El esquema private no es accesible');

select is(
  public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000001","device_id":"d1","epoch":1,
    "mutations":[{"m":"insert","t":"categories","row":{"id":"10000000-0000-4000-8000-000000000001","name":"X",
    "user_id":"00000000-0000-4000-8000-0000000000b2"}}]}'::jsonb)->>'reason',
  'invalid_field', 'El cliente no puede enviar user_id: se rechaza el campo');

-- ===== Rol anónimo =====
reset role;
set local role anon;
select throws_ok($$select * from public.categories$$, '42501', null, 'anon no puede leer tablas');
select throws_ok($$select public.apply_batch('{}'::jsonb)$$, '42501', null, 'anon no puede ejecutar RPC');

-- ===== Claves foráneas compuestas (como propietario, para probar la base de datos en sí) =====
reset role;
insert into public.locations (user_id, id, name) values
  ('00000000-0000-4000-8000-0000000000a1', 'c0000000-0000-4000-8000-000000000001', 'L-U1'),
  ('00000000-0000-4000-8000-0000000000b2', 'c0000000-0000-4000-8000-000000000002', 'L-U2');

select throws_ok(
  $$insert into public.units (user_id, id, type_id, code, status, location_id) values (
      '00000000-0000-4000-8000-0000000000a1', gen_random_uuid(),
      (select id from public.item_types where user_id = '00000000-0000-4000-8000-0000000000b2' and name = 'Extractor'),
      'ZZ-01', 'new', 'c0000000-0000-4000-8000-000000000001')$$,
  '23503', null, 'Una unidad no puede referenciar el tipo de otro usuario');
select throws_ok(
  $$insert into public.units (user_id, id, type_id, code, status, location_id) values (
      '00000000-0000-4000-8000-0000000000a1', gen_random_uuid(),
      (select id from public.item_types where user_id = '00000000-0000-4000-8000-0000000000a1' and name = 'Extractor'),
      'ZZ-02', 'new', 'c0000000-0000-4000-8000-000000000002')$$,
  '23503', null, 'Una unidad no puede referenciar la ubicación de otro usuario');

select * from finish();
rollback;
