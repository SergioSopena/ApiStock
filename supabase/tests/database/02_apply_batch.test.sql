-- ApiStock · pruebas de apply_batch y reserve_codes. Ejecutar con: supabase test db
begin;
select plan(26);

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000a1', 'u1@test.local');
do $$ begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
end $$;
set local role authenticated;

-- Catálogo de prueba: categoría, 2 ubicaciones, tipo individualizado (TU) y tipo por cantidad (TB)
select is(
  public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000001","device_id":"dev1","epoch":1,"mutations":[
    {"m":"insert","t":"categories","row":{"id":"10000000-0000-4000-8000-000000000001","name":"CatTest"}},
    {"m":"insert","t":"locations","row":{"id":"c0000000-0000-4000-8000-000000000001","name":"Almacén A"}},
    {"m":"insert","t":"locations","row":{"id":"c0000000-0000-4000-8000-000000000002","name":"Almacén B"}},
    {"m":"insert","t":"item_types","row":{"id":"a0000000-0000-4000-8000-000000000001","category_id":"10000000-0000-4000-8000-000000000001","name":"TU","mode":"unit","code_prefix":"ZU","uses_system":false}},
    {"m":"insert","t":"item_types","row":{"id":"a0000000-0000-4000-8000-000000000002","category_id":"10000000-0000-4000-8000-000000000001","name":"TB","mode":"bulk","code_prefix":"ZB","uses_system":false}}
  ]}'::jsonb)->>'status',
  'applied', '01 Alta de catálogo en una operación');

select is(
  array(select jsonb_array_elements_text(public.reserve_codes('dev1', '[{"prefix":"ZU","count":3}]')->'codes'->'ZU')),
  array['ZU-01','ZU-02','ZU-03'], '02 Reserva de 3 códigos correlativos');

select is(
  public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000003","device_id":"dev1","epoch":1,"mutations":[
    {"m":"insert","t":"units","row":{"id":"b0000000-0000-4000-8000-000000000001","type_id":"a0000000-0000-4000-8000-000000000001","code":"ZU-01","status":"new","location_id":"c0000000-0000-4000-8000-000000000001"}},
    {"m":"insert","t":"units","row":{"id":"b0000000-0000-4000-8000-000000000002","type_id":"a0000000-0000-4000-8000-000000000001","code":"ZU-02","status":"new","location_id":"c0000000-0000-4000-8000-000000000001"}},
    {"m":"insert","t":"units","row":{"id":"b0000000-0000-4000-8000-000000000003","type_id":"a0000000-0000-4000-8000-000000000001","code":"ZU-03","status":"new","location_id":"c0000000-0000-4000-8000-000000000001"}}
  ]}'::jsonb)->>'status',
  'applied', '03 Alta múltiple de 3 unidades');
select is((select count(*)::int from public.units), 3, '04 Existen 3 unidades');

-- Idempotencia: reenviar la misma operación no duplica nada
select is(
  (public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000003","device_id":"dev1","epoch":1,"mutations":[
    {"m":"insert","t":"units","row":{"id":"b0000000-0000-4000-8000-000000000001","type_id":"a0000000-0000-4000-8000-000000000001","code":"ZU-01","status":"new","location_id":"c0000000-0000-4000-8000-000000000001"}}
  ]}'::jsonb)->>'duplicate'),
  'true', '05 Operación repetida se detecta como duplicada');
select is((select count(*)::int from public.units), 3, '06 La repetición no duplica unidades');

-- Época distinta
select is(
  public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000004","device_id":"dev1","epoch":99,"mutations":[
    {"m":"lot_delta","type_id":"a0000000-0000-4000-8000-000000000002","location_id":"c0000000-0000-4000-8000-000000000001","delta":1}
  ]}'::jsonb)->>'status',
  'epoch_mismatch', '07 Época incorrecta se rechaza');

-- Mover con versión correcta
select is(
  public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000005","device_id":"dev1","epoch":1,"mutations":[
    {"m":"update","t":"units","id":"b0000000-0000-4000-8000-000000000001","base_version":1,"set":{"location_id":"c0000000-0000-4000-8000-000000000002"}}
  ]}'::jsonb)->>'status',
  'applied', '08 Mover una unidad con la versión correcta');
select is((select location_id::text from public.units where id = 'b0000000-0000-4000-8000-000000000001'),
  'c0000000-0000-4000-8000-000000000002', '09 La unidad está en la nueva ubicación');
select is((select version from public.units where id = 'b0000000-0000-4000-8000-000000000001'), 2,
  '10 La versión de la fila sube a 2');

-- Conflicto: versión obsoleta
select is(
  public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000006","device_id":"dev2","epoch":1,"mutations":[
    {"m":"update","t":"units","id":"b0000000-0000-4000-8000-000000000001","base_version":1,"set":{"status":"good"}}
  ]}'::jsonb)->>'status',
  'conflict', '11 Versión obsoleta produce conflicto');
select is((select status from public.units where id = 'b0000000-0000-4000-8000-000000000001'), 'new',
  '12 El conflicto no modifica la fila');
select is(
  public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000006","device_id":"dev2","epoch":1,"mutations":[
    {"m":"update","t":"units","id":"b0000000-0000-4000-8000-000000000001","base_version":1,"set":{"status":"good"}}
  ]}'::jsonb)->'detail'->'server_row'->>'version',
  '2', '13 El conflicto devuelve la versión del servidor para compararla');

-- Cantidades por delta
select is(
  public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000007","device_id":"dev1","epoch":1,"mutations":[
    {"m":"lot_delta","type_id":"a0000000-0000-4000-8000-000000000002","location_id":"c0000000-0000-4000-8000-000000000001","delta":100}
  ]}'::jsonb)->>'status', 'applied', '14 Alta de 100 unidades agrupadas');
select is(
  public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000008","device_id":"dev1","epoch":1,"mutations":[
    {"m":"lot_delta","type_id":"a0000000-0000-4000-8000-000000000002","location_id":"c0000000-0000-4000-8000-000000000001","delta":-5}
  ]}'::jsonb)->>'status', 'applied', '15 Baja de 5');
select is((select quantity from public.stock_lots where type_id = 'a0000000-0000-4000-8000-000000000002'), 95,
  '16 El total pasa de 100 a 95');
select is(
  public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000009","device_id":"dev1","epoch":1,"mutations":[
    {"m":"lot_delta","type_id":"a0000000-0000-4000-8000-000000000002","location_id":"c0000000-0000-4000-8000-000000000001","delta":-96}
  ]}'::jsonb)->>'reason', 'insufficient_stock', '17 No se permite dejar el total en negativo');
select is((select quantity from public.stock_lots where type_id = 'a0000000-0000-4000-8000-000000000002'), 95,
  '18 La cantidad no cambia tras el rechazo');

-- Individualizar: -1 del lote y +1 ficha, en una sola operación atómica
select is(public.reserve_codes('dev1', '[{"prefix":"ZB","count":1}]')->'codes'->'ZB'->>0, 'ZB-01',
  '19 Código reservado para la unidad individualizada');
select is(
  public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000010","device_id":"dev1","epoch":1,"mutations":[
    {"m":"lot_delta","type_id":"a0000000-0000-4000-8000-000000000002","location_id":"c0000000-0000-4000-8000-000000000001","delta":-1},
    {"m":"insert","t":"units","row":{"id":"b0000000-0000-4000-8000-000000000004","type_id":"a0000000-0000-4000-8000-000000000002","code":"ZB-01","status":"used","location_id":"c0000000-0000-4000-8000-000000000001"}}
  ]}'::jsonb)->>'status', 'applied', '20 Individualizar 1 unidad de un lote');
select is((select quantity from public.stock_lots where type_id = 'a0000000-0000-4000-8000-000000000002'), 94,
  '21 Quedan 94 unidades agrupadas');

-- Atomicidad: si falla la segunda mutación, la primera se deshace
select is(
  public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000011","device_id":"dev1","epoch":1,"mutations":[
    {"m":"lot_delta","type_id":"a0000000-0000-4000-8000-000000000002","location_id":"c0000000-0000-4000-8000-000000000001","delta":-1},
    {"m":"insert","t":"units","row":{"id":"b0000000-0000-4000-8000-000000000005","type_id":"a0000000-0000-4000-8000-000000000002","code":"ZB-99","status":"estropeado","location_id":"c0000000-0000-4000-8000-000000000001"}}
  ]}'::jsonb)->>'sqlstate', '23514', '22 Un estado inválido rechaza toda la operación');
select is((select quantity from public.stock_lots where type_id = 'a0000000-0000-4000-8000-000000000002'), 94,
  '23 La primera mutación se deshizo (atomicidad)');

-- Borrado con versión obsoleta = conflicto; con versión correcta = borrado
select is(
  public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000012","device_id":"dev1","epoch":1,"mutations":[
    {"m":"delete","t":"units","id":"b0000000-0000-4000-8000-000000000003","base_version":9}
  ]}'::jsonb)->>'status', 'conflict', '24 Borrar con versión obsoleta produce conflicto');

-- Validaciones de forma
select is(
  public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000013","device_id":"dev1","epoch":1,"mutations":[
    {"m":"update","t":"units","id":"b0000000-0000-4000-8000-000000000003","set":{"status":"good"}}
  ]}'::jsonb)->>'reason', 'missing_base_version', '25 Actualizar sin base_version se rechaza');

-- Operaciones recientes: máximo 10
select count(*) from generate_series(1, 11) i,
  lateral (select public.apply_batch(jsonb_build_object(
    'op_id', gen_random_uuid(), 'device_id', 'dev1', 'epoch', 1,
    'recent', jsonb_build_object('kind', 'test', 'summary', 'op ' || i, 'inverse', '{}'::jsonb),
    'mutations', jsonb_build_array(jsonb_build_object(
      'm', 'lot_delta', 'type_id', 'a0000000-0000-4000-8000-000000000002',
      'location_id', 'c0000000-0000-4000-8000-000000000002', 'delta', 1)))) as r) x;
select is((select count(*)::int from public.recent_operations), 10,
  '26 Solo se conservan las 10 operaciones recientes');

select * from finish();
rollback;
