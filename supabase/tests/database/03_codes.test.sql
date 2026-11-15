-- ApiStock · pruebas de códigos (reserva, unicidad, no reutilización). supabase test db
begin;
select plan(13);

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000a1', 'u1@test.local');
do $$ begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
end $$;
set local role authenticated;

select public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000001","device_id":"dev1","epoch":1,"mutations":[
  {"m":"insert","t":"categories","row":{"id":"10000000-0000-4000-8000-000000000001","name":"CatTest"}},
  {"m":"insert","t":"locations","row":{"id":"c0000000-0000-4000-8000-000000000001","name":"Almacén A"}},
  {"m":"insert","t":"item_types","row":{"id":"a0000000-0000-4000-8000-000000000001","category_id":"10000000-0000-4000-8000-000000000001","name":"TU","mode":"unit","code_prefix":"ZU","uses_system":false}}
]}'::jsonb);

-- 1-2. Reservas correlativas y sin solapamiento entre dispositivos
select is(
  array(select jsonb_array_elements_text(public.reserve_codes('dev1', '[{"prefix":"ZU","count":5}]')->'codes'->'ZU')),
  array['ZU-01','ZU-02','ZU-03','ZU-04','ZU-05'], '01 Dispositivo 1 reserva ZU-01..05');
select is(
  array(select jsonb_array_elements_text(public.reserve_codes('dev2', '[{"prefix":"ZU","count":2}]')->'codes'->'ZU')),
  array['ZU-06','ZU-07'], '02 Dispositivo 2 recibe un bloque distinto');

-- 3. Un código reservado por otro dispositivo no se puede usar
select is(
  public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000002","device_id":"dev1","epoch":1,"mutations":[
    {"m":"insert","t":"units","row":{"id":"b0000000-0000-4000-8000-000000000006","type_id":"a0000000-0000-4000-8000-000000000001","code":"ZU-06","status":"new","location_id":"c0000000-0000-4000-8000-000000000001"}}
  ]}'::jsonb)->>'reason', 'code_taken', '03 Código reservado por otro dispositivo: rechazado');

-- 4-5. Cada dispositivo usa los suyos
select is(
  public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000003","device_id":"dev2","epoch":1,"mutations":[
    {"m":"insert","t":"units","row":{"id":"b0000000-0000-4000-8000-000000000006","type_id":"a0000000-0000-4000-8000-000000000001","code":"ZU-06","status":"new","location_id":"c0000000-0000-4000-8000-000000000001"}}
  ]}'::jsonb)->>'status', 'applied', '04 El dispositivo propietario de la reserva sí puede usarlo');
select is(
  public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000004","device_id":"dev1","epoch":1,"mutations":[
    {"m":"insert","t":"units","row":{"id":"b0000000-0000-4000-8000-000000000001","type_id":"a0000000-0000-4000-8000-000000000001","code":"ZU-01","status":"new","location_id":"c0000000-0000-4000-8000-000000000001"}}
  ]}'::jsonb)->>'status', 'applied', '05 El dispositivo 1 usa su propio código');

-- 6. Editar un código a uno ya asignado
select is(
  public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000005","device_id":"dev1","epoch":1,"mutations":[
    {"m":"update","t":"units","id":"b0000000-0000-4000-8000-000000000001","base_version":1,"set":{"code":"ZU-06"}}
  ]}'::jsonb)->>'reason', 'code_taken', '06 Editar un código a otro ya asignado: rechazado');

-- 7. Un código eliminado no se reutiliza
select is(
  public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000006","device_id":"dev1","epoch":1,"mutations":[
    {"m":"delete","t":"units","id":"b0000000-0000-4000-8000-000000000001","base_version":1},
    {"m":"insert","t":"units","row":{"id":"b0000000-0000-4000-8000-000000000009","type_id":"a0000000-0000-4000-8000-000000000001","code":"ZU-01","status":"new","location_id":"c0000000-0000-4000-8000-000000000001"}}
  ]}'::jsonb)->>'reason', 'code_taken', '07 Un código de una unidad eliminada no puede reasignarse a otra');

-- 8. Pero deshacer (misma id, mismo código) sí funciona
select is(
  public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000007","device_id":"dev1","epoch":1,"mutations":[
    {"m":"delete","t":"units","id":"b0000000-0000-4000-8000-000000000001","base_version":1}
  ]}'::jsonb)->>'status', 'applied', '08 Se elimina la unidad ZU-01');
select is(
  public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000008","device_id":"dev1","epoch":1,"mutations":[
    {"m":"insert","t":"units","row":{"id":"b0000000-0000-4000-8000-000000000001","type_id":"a0000000-0000-4000-8000-000000000001","code":"ZU-01","status":"new","location_id":"c0000000-0000-4000-8000-000000000001"}}
  ]}'::jsonb)->>'status', 'applied', '09 Deshacer la baja restaura la misma unidad con su código');

-- 10. Formato de código inválido
select is(
  public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000009","device_id":"dev1","epoch":1,"mutations":[
    {"m":"insert","t":"units","row":{"id":"b0000000-0000-4000-8000-000000000010","type_id":"a0000000-0000-4000-8000-000000000001","code":"zu 01","status":"new","location_id":"c0000000-0000-4000-8000-000000000001"}}
  ]}'::jsonb)->>'sqlstate', '23514', '10 Un código con formato inválido se rechaza');

-- 11-12. Límites de reserva
select throws_ok($$select public.reserve_codes('dev1', '[{"prefix":"ZU","count":201}]')$$,
  'AS002', 'invalid_request', '11 No se pueden reservar más de 200 códigos de una vez');
select throws_ok($$select public.reserve_codes('dev1', '[{"prefix":"zu","count":1}]')$$,
  'AS002', 'invalid_request', '12 El prefijo debe ser mayúsculas y dígitos');

-- 13. La reserva salta códigos que ya se asignaron a mano
select public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000011","device_id":"dev1","epoch":1,"mutations":[
  {"m":"insert","t":"units","row":{"id":"b0000000-0000-4000-8000-000000000011","type_id":"a0000000-0000-4000-8000-000000000001","code":"ZU-08","status":"new","location_id":"c0000000-0000-4000-8000-000000000001"}}
]}'::jsonb);
select is(
  array(select jsonb_array_elements_text(public.reserve_codes('dev1', '[{"prefix":"ZU","count":2}]')->'codes'->'ZU')),
  array['ZU-09','ZU-10'], '13 La reserva salta ZU-08, ya asignado manualmente');

select * from finish();
rollback;
