-- ApiStock · pruebas de compatibilidad bidireccional. Ejecutar con: supabase test db
begin;
select plan(15);

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000a1', 'u1@test.local');
do $$ begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
end $$;
set local role authenticated;

-- Catálogo y tres unidades (códigos manuales)
select public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000001","device_id":"dev1","epoch":1,"mutations":[
  {"m":"insert","t":"categories","row":{"id":"10000000-0000-4000-8000-000000000001","name":"CatTest"}},
  {"m":"insert","t":"locations","row":{"id":"c0000000-0000-4000-8000-000000000001","name":"Almacén A"}},
  {"m":"insert","t":"item_types","row":{"id":"a0000000-0000-4000-8000-000000000001","category_id":"10000000-0000-4000-8000-000000000001","name":"TU","mode":"unit","code_prefix":"ZU","uses_system":false}},
  {"m":"insert","t":"units","row":{"id":"b0000000-0000-4000-8000-000000000001","type_id":"a0000000-0000-4000-8000-000000000001","code":"KA-01","status":"new","location_id":"c0000000-0000-4000-8000-000000000001"}},
  {"m":"insert","t":"units","row":{"id":"b0000000-0000-4000-8000-000000000002","type_id":"a0000000-0000-4000-8000-000000000001","code":"KA-02","status":"new","location_id":"c0000000-0000-4000-8000-000000000001"}},
  {"m":"insert","t":"units","row":{"id":"b0000000-0000-4000-8000-000000000003","type_id":"a0000000-0000-4000-8000-000000000001","code":"KA-03","status":"new","location_id":"c0000000-0000-4000-8000-000000000001"}}
]}'::jsonb);

-- 1-3. La pareja se guarda UNA vez y normalizada, aunque se envíe en orden inverso
select is(
  public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000002","device_id":"dev1","epoch":1,"mutations":[
    {"m":"compat_set","unit_a":"b0000000-0000-4000-8000-000000000002","unit_b":"b0000000-0000-4000-8000-000000000001","result":"compatible"}
  ]}'::jsonb)->>'status', 'applied', '01 Registrar compatibilidad entre dos unidades');
select is((select count(*)::int from public.compatibilities), 1, '02 Existe una única fila para la pareja');
select ok((select unit_a < unit_b from public.compatibilities), '03 La pareja se almacena ordenada (unit_a < unit_b)');

-- 4-5. Simetría: aparece desde cualquiera de las dos unidades
select is((select count(*)::int from public.compatibilities
            where unit_a = 'b0000000-0000-4000-8000-000000000001' or unit_b = 'b0000000-0000-4000-8000-000000000001'),
  1, '04 La relación se encuentra desde la unidad 1');
select is((select count(*)::int from public.compatibilities
            where unit_a = 'b0000000-0000-4000-8000-000000000002' or unit_b = 'b0000000-0000-4000-8000-000000000002'),
  1, '05 La misma relación se encuentra desde la unidad 2');

-- 6. Repetir el mismo resultado en el otro orden no cambia nada ni genera conflicto
select is(
  public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000003","device_id":"dev2","epoch":1,"mutations":[
    {"m":"compat_set","unit_a":"b0000000-0000-4000-8000-000000000001","unit_b":"b0000000-0000-4000-8000-000000000002","result":"compatible"}
  ]}'::jsonb)->>'status', 'applied', '06 Un resultado idéntico desde otro dispositivo no genera conflicto');
select is((select version from public.compatibilities), 1, '07 …y no altera la fila');

-- 8. Resultado distinto sin conocer la versión existente = conflicto (gana la primera)
select is(
  public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000004","device_id":"dev2","epoch":1,"mutations":[
    {"m":"compat_set","unit_a":"b0000000-0000-4000-8000-000000000001","unit_b":"b0000000-0000-4000-8000-000000000002","result":"incompatible"}
  ]}'::jsonb)->>'status', 'conflict', '08 Un resultado distinto sin base de versión choca con el existente');

-- 9. Con la versión correcta se puede modificar (incompatible → compatible y viceversa)
select is(
  public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000005","device_id":"dev1","epoch":1,"mutations":[
    {"m":"compat_set","unit_a":"b0000000-0000-4000-8000-000000000001","unit_b":"b0000000-0000-4000-8000-000000000002","result":"fits","note":"Sobresale 1 cm","base_version":1}
  ]}'::jsonb)->>'status', 'applied', '09 Modificar la relación con la versión correcta');

-- 10. Una unidad no puede ser compatible consigo misma
select is(
  public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000006","device_id":"dev1","epoch":1,"mutations":[
    {"m":"compat_set","unit_a":"b0000000-0000-4000-8000-000000000001","unit_b":"b0000000-0000-4000-8000-000000000001","result":"compatible"}
  ]}'::jsonb)->>'reason', 'compat_same_unit', '10 Una unidad no se compara consigo misma');

-- 11-12. Restricciones de la propia base de datos (como propietario)
select public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000007","device_id":"dev1","epoch":1,"mutations":[
  {"m":"compat_set","unit_a":"b0000000-0000-4000-8000-000000000001","unit_b":"b0000000-0000-4000-8000-000000000003","result":"fits"},
  {"m":"compat_set","unit_a":"b0000000-0000-4000-8000-000000000002","unit_b":"b0000000-0000-4000-8000-000000000003","result":"compatible"}
]}'::jsonb);
reset role;
select throws_ok(
  $$insert into public.compatibilities (user_id, id, unit_a, unit_b, result) values
      ('00000000-0000-4000-8000-0000000000a1', gen_random_uuid(),
       'b0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'compatible')$$,
  '23514', null, '11 La base de datos impide guardar la pareja en orden inverso');
select throws_ok(
  $$insert into public.compatibilities (user_id, id, unit_a, unit_b, result) values
      ('00000000-0000-4000-8000-0000000000a1', gen_random_uuid(),
       'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'compatible')$$,
  '23505', null, '12 La base de datos impide dos filas para la misma pareja');

-- 13-15. Eliminar una unidad elimina todas sus relaciones y deja lápidas
do $$ begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
end $$;
set local role authenticated;
select is(
  public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000008","device_id":"dev1","epoch":1,"mutations":[
    {"m":"delete","t":"units","id":"b0000000-0000-4000-8000-000000000001","base_version":1}
  ]}'::jsonb)->>'status', 'applied', '13 Se elimina la unidad 1');
select is((select count(*)::int from public.compatibilities), 1,
  '14 Solo queda la relación que no afectaba a la unidad eliminada (sin relaciones huérfanas)');
select is((select count(*)::int from public.tombstones where table_name = 'compatibilities'), 2,
  '15 Las dos relaciones eliminadas generan lápida para la sincronización');

select * from finish();
rollback;
