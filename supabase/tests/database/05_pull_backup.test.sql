-- ApiStock · pruebas de descarga incremental, exportación e importación. supabase test db
begin;
select plan(24);

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000a1', 'u1@test.local');
do $$ begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
end $$;
set local role authenticated;

select public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000001","device_id":"dev1","epoch":1,"mutations":[
  {"m":"insert","t":"categories","row":{"id":"10000000-0000-4000-8000-000000000001","name":"CatTest"}},
  {"m":"insert","t":"locations","row":{"id":"c0000000-0000-4000-8000-000000000001","name":"Almacén A"}},
  {"m":"insert","t":"item_types","row":{"id":"a0000000-0000-4000-8000-000000000001","category_id":"10000000-0000-4000-8000-000000000001","name":"TU","mode":"unit","code_prefix":"ZU","uses_system":false}},
  {"m":"insert","t":"units","row":{"id":"b0000000-0000-4000-8000-000000000001","type_id":"a0000000-0000-4000-8000-000000000001","code":"KA-01","status":"new","location_id":"c0000000-0000-4000-8000-000000000001"}},
  {"m":"insert","t":"units","row":{"id":"b0000000-0000-4000-8000-000000000002","type_id":"a0000000-0000-4000-8000-000000000001","code":"KA-02","status":"good","location_id":"c0000000-0000-4000-8000-000000000001"}},
  {"m":"compat_set","unit_a":"b0000000-0000-4000-8000-000000000001","unit_b":"b0000000-0000-4000-8000-000000000002","result":"compatible"}
]}'::jsonb);

-- ===== pull_changes =====
select is(public.pull_changes(0, 2000)->>'status', 'ok', '01 Descarga completa correcta');
select ok(jsonb_array_length(public.pull_changes(0, 2000)->'changes') > 30,
  '02 La descarga incluye el catálogo inicial y los datos nuevos');
select is((public.pull_changes(0, 2000)->>'has_more')::boolean, false, '03 Sin más páginas con límite amplio');
select is(jsonb_array_length(public.pull_changes(0, 5)->'changes'), 5, '04 La paginación respeta el límite');
select is((public.pull_changes(0, 5)->>'has_more')::boolean, true, '05 Indica que hay más páginas');
select is(
  jsonb_array_length(public.pull_changes((select seq_counter from public.profiles), 100)->'changes'), 0,
  '06 Desde el último cursor no hay cambios');

select public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000002","device_id":"dev1","epoch":1,"mutations":[
  {"m":"delete","t":"units","id":"b0000000-0000-4000-8000-000000000002","base_version":1}
]}'::jsonb);
select ok(exists(
  select 1 from jsonb_array_elements(
    public.pull_changes((select min(server_seq) - 1 from public.tombstones), 100)->'changes') e
   where e->>'t' = 'tombstones' and e->'r'->>'table' = 'units'),
  '07 El borrado de una unidad llega como lápida en la descarga incremental');

-- ===== export_backup =====
select is(public.export_backup()->>'app_signature', 'apistock-backup', '08 La copia lleva la firma de ApiStock');
select is((public.export_backup()->>'schema_version')::int, 1, '09 La copia lleva versión de esquema');
select is(jsonb_array_length(public.export_backup()->'data'->'units'), 1, '10 La copia contiene las unidades actuales');
select is((public.export_backup()->'data'->'units'->0->'user_id') is null, true, '11 La copia no incluye identificadores internos de usuario');

-- ===== import_backup: validaciones =====
select is(public.import_backup('{"app_signature":"otra-app","schema_version":1,"data":{}}'::jsonb)->>'reason',
  'invalid_signature', '12 Se rechaza un archivo que no es de ApiStock');
select is(public.import_backup(jsonb_build_object('app_signature', 'apistock-backup', 'schema_version', 1,
    'data', jsonb_build_object('pad', repeat('x', 5300000))))->>'reason',
  'import_too_large', '13 Se rechaza un archivo por encima del límite de tamaño');
select is(public.import_backup('{"app_signature":"apistock-backup","schema_version":2,"data":{}}'::jsonb)->>'reason',
  'unsupported_schema_version', '14 Se rechaza una versión de esquema desconocida');
select is(public.import_backup('{"app_signature":"apistock-backup","schema_version":1,"data":{
    "categories":[],"systems":[],"locations":[],"item_types":[],"stock_lots":[],"compatibilities":[],
    "units":[{"id":"b0000000-0000-4000-8000-0000000000ff","type_id":"a0000000-0000-4000-8000-0000000000ff",
              "code":"ZZ-01","status":"new","location_id":"c0000000-0000-4000-8000-0000000000ff"}]}}'::jsonb)->>'sqlstate',
  '23503', '15 Una referencia rota se rechaza');
select is((select count(*)::int from public.units), 1, '16 El rechazo no altera el inventario (atomicidad)');

-- ===== import_backup: ida y vuelta =====
select is(public.import_backup(public.export_backup())->>'status', 'imported', '17 Restaurar la propia copia funciona');
select is((select data_epoch from public.profiles), 2, '18 La importación incrementa la época de datos');

-- Sustitución real: una copia sin unidades deja el inventario sin unidades
select is(
  public.import_backup(jsonb_set(jsonb_set(public.export_backup(), '{data,units}', '[]'),
                                 '{data,compatibilities}', '[]'))->>'status',
  'imported', '19 Importar una copia sin unidades sustituye el inventario');
select is((select count(*)::int from public.units), 0, '20 Las unidades anteriores ya no existen');

-- Las operaciones de la época anterior ya no se aceptan; los códigos no se reutilizan
select is(
  public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000003","device_id":"dev1","epoch":1,"mutations":[
    {"m":"lot_delta","type_id":"a0000000-0000-4000-8000-000000000001","location_id":"c0000000-0000-4000-8000-000000000001","delta":1}
  ]}'::jsonb)->>'status', 'epoch_mismatch', '21 Operaciones de una época anterior se rechazan');
select is(
  public.apply_batch('{"op_id":"e0000000-0000-4000-8000-000000000004","device_id":"dev1","epoch":3,"mutations":[
    {"m":"insert","t":"units","row":{"id":"b0000000-0000-4000-8000-0000000000aa","type_id":"a0000000-0000-4000-8000-000000000001","code":"KA-01","status":"new","location_id":"c0000000-0000-4000-8000-000000000001"}}
  ]}'::jsonb)->>'reason', 'code_taken', '22 Tras importar, un código ya asignado sigue sin poder reutilizarse');

select is((select count(*)::int from public.tombstones), 0, '23 La importación limpia las lápidas anteriores');
select is(public.pull_changes(1, 100)->>'status', 'full_resync_required',
  '24 Un dispositivo con cursor antiguo debe resincronizar por completo');

select * from finish();
rollback;
