-- Run after a disposable database has loaded 0006_personalized_plans.sql.
-- All identities and plan contents below are synthetic.
begin;

insert into auth.users (id)
values
  ('22222222-2222-4222-8222-222222222222'),
  ('55555555-5555-4555-8555-555555555555');

insert into public.profiles (id, full_name, role, current_team)
values
  ('22222222-2222-4222-8222-222222222222', 'Synthetic Owner', 'aluna', 1),
  ('55555555-5555-4555-8555-555555555555', 'Synthetic Other', 'aluna', 1);

do $$
begin
  if has_function_privilege(
    'authenticated',
    'public.stage_angela_plan(uuid,uuid,bigint,timestamp with time zone,text,text,jsonb,jsonb,jsonb)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.read_angela_plan_delivery(uuid,uuid,bigint)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.activate_angela_plan(uuid,uuid,bigint,text)',
    'execute'
  ) then
    raise exception 'authenticated unexpectedly executes a delivery RPC';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.stage_angela_plan(uuid,uuid,bigint,timestamp with time zone,text,text,jsonb,jsonb,jsonb)',
    'execute'
  ) or not has_function_privilege(
    'service_role',
    'public.read_angela_plan_delivery(uuid,uuid,bigint)',
    'execute'
  ) or not has_function_privilege(
    'service_role',
    'public.activate_angela_plan(uuid,uuid,bigint,text)',
    'execute'
  ) then
    raise exception 'service_role cannot execute every delivery RPC';
  end if;
  if has_table_privilege('authenticated', 'public.angela_personalized_plans', 'insert')
    or has_table_privilege('authenticated', 'public.angela_personalized_plans', 'update')
    or has_table_privilege('authenticated', 'public.angela_personalized_plans', 'delete') then
    raise exception 'authenticated unexpectedly mutates personalized plans';
  end if;
  if has_column_privilege(
    'authenticated',
    'public.angela_personalized_plans',
    'source_protocol_updated_at',
    'select'
  ) then
    raise exception 'source protocol timestamp escaped the service-only readback';
  end if;
end;
$$;

set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$
begin
  begin
    perform public.read_angela_plan_delivery(
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111',
      3
    );
    raise exception 'authenticated direct RPC unexpectedly succeeded: read';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.activate_angela_plan(
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111',
      3,
      repeat('a', 64)
    );
    raise exception 'authenticated direct RPC unexpectedly succeeded: activate';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.stage_angela_plan(
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null
    );
    raise exception 'authenticated direct RPC unexpectedly succeeded: stage';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
reset role;

set local role service_role;
do $$
declare
  v_diet jsonb := '{
    "water_liters": 2.5,
    "notes": "",
    "daily_calories": 1800,
    "goal": "Saude",
    "macros": {
      "protein_g": 120,
      "fiber_g": 25,
      "fat_g": 60,
      "carbs_g": 180
    },
    "meals": [{
      "name": "Almoco",
      "time": "12:00",
      "order": 1,
      "calories": 500,
      "foods": [{
        "name": "Arroz",
        "quantity": 100,
        "unit": "g",
        "calories": 130,
        "protein_g": 3,
        "carbs_g": 28,
        "fat_g": 1,
        "substitutions": ["Batata"]
      }]
    }]
  }'::jsonb;
  v_training jsonb := '{
    "goal": "Forca",
    "split": "A",
    "frequency": 1,
    "duration_minutes": 30,
    "notes": "",
    "days": [{
      "name": "Treino A",
      "type": "workout",
      "day_label": "Dia 1",
      "muscle_groups": ["pernas"],
      "warmup": "5 min",
      "cooldown": "Alongar",
      "exercises": [{
        "name": "Agachamento",
        "order": 1,
        "muscle_group": "pernas",
        "sets": 3,
        "reps": "12",
        "rest_seconds": 60,
        "technique": null,
        "notes": null,
        "substitutions": ["Agachamento livre"]
      }]
    }]
  }'::jsonb;
  v_metadata jsonb := '{
    "catalogVersion": "consultoria-open-catalog.2026-07-20",
    "engineVersion": "angela-consultoria-engine.v1",
    "promptVersion": "angela-consultoria-prompts.v1",
    "ragVersion": "consultoria-open-rag-node.v1",
    "schemaVersion": "angela-protocol-draft.v1"
  }'::jsonb;
  v_result jsonb;
begin
  begin
    perform public.stage_angela_plan(
      null,
      '11111111-1111-4111-8111-111111111111',
      3,
      '2026-08-03 17:00:00+00',
      'angela-plan.v1',
      'fa3af851c7b7929761867755f5850b89ec17e601f356b17caac1e0b7edbb2008',
      v_diet,
      v_training,
      v_metadata
    );
    raise exception 'null owner unexpectedly staged';
  exception when invalid_parameter_value then
    if sqlerrm <> 'ANGELA_PLAN_SNAPSHOT_INCOMPLETE' then raise; end if;
  end;

  begin
    perform public.stage_angela_plan(
      '22222222-2222-4222-8222-222222222222',
      '44444444-4444-4444-8444-444444444444',
      1,
      null,
      'angela-plan.v1',
      repeat('4', 64),
      v_diet,
      v_training,
      v_metadata
    );
    raise exception 'null source protocol timestamp unexpectedly staged';
  exception when invalid_parameter_value then
    if sqlerrm <> 'ANGELA_PLAN_SNAPSHOT_INCOMPLETE' then raise; end if;
  end;

  v_result := public.stage_angela_plan(
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111',
    3,
    '2026-08-03 17:00:00+00',
    'angela-plan.v1',
    'fa3af851c7b7929761867755f5850b89ec17e601f356b17caac1e0b7edbb2008',
    v_diet,
    v_training,
    v_metadata
  );
  if (v_result->>'replayed')::boolean
    or v_result#>>'{delivery,state}' <> 'staged' then
    raise exception 'first old stage failed: %', v_result;
  end if;

  v_result := public.stage_angela_plan(
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111',
    3,
    '2026-08-03 17:00:00+00',
    'angela-plan.v1',
    'fa3af851c7b7929761867755f5850b89ec17e601f356b17caac1e0b7edbb2008',
    v_diet,
    v_training,
    v_metadata
  );
  if not (v_result->>'replayed')::boolean then
    raise exception 'identical stage was not idempotent';
  end if;

  begin
    perform public.stage_angela_plan(
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111',
      3,
      '2026-08-03 17:00:00+00',
      'angela-plan.v1',
      repeat('a', 64),
      jsonb_set(v_diet, '{goal}', '"Outro"'),
      v_training,
      v_metadata
    );
    raise exception 'conflicting stage unexpectedly succeeded';
  exception when unique_violation then
    if sqlerrm <> 'ANGELA_PLAN_STAGE_CONFLICT' then raise; end if;
  end;

  begin
    perform public.stage_angela_plan(
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111',
      3,
      '2026-08-03 17:00:01+00',
      'angela-plan.v1',
      'fa3af851c7b7929761867755f5850b89ec17e601f356b17caac1e0b7edbb2008',
      v_diet,
      v_training,
      v_metadata
    );
    raise exception 'source timestamp swap unexpectedly succeeded';
  exception when unique_violation then
    if sqlerrm <> 'ANGELA_PLAN_STAGE_CONFLICT' then raise; end if;
  end;

  begin
    perform public.stage_angela_plan(
      '22222222-2222-4222-8222-222222222222',
      '77777777-7777-4777-8777-777777777777',
      1,
      '2026-08-03 16:30:00+00',
      'angela-plan.v1',
      repeat('c', 64),
      '{"meals":[{}]}'::jsonb,
      v_training,
      v_metadata
    );
    raise exception 'partial diet unexpectedly staged';
  exception when invalid_parameter_value then
    if sqlerrm <> 'ANGELA_PLAN_SNAPSHOT_INCOMPLETE' then raise; end if;
  end;

  begin
    perform public.stage_angela_plan(
      '22222222-2222-4222-8222-222222222222',
      '88888888-8888-4888-8888-888888888888',
      1,
      '2026-08-03 16:30:00+00',
      'angela-plan.v1',
      repeat('e', 64),
      v_diet,
      v_training - 'days',
      v_metadata
    );
    raise exception 'partial training unexpectedly staged';
  exception when invalid_parameter_value then
    if sqlerrm <> 'ANGELA_PLAN_SNAPSHOT_INCOMPLETE' then raise; end if;
  end;

  v_result := public.read_angela_plan_delivery(
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111',
    3
  );
  if v_result->>'found' <> 'true'
    or v_result->>'plan_version_id' is null
    or v_result->>'state' <> 'staged'
    or v_result->>'user_id' <> '22222222-2222-4222-8222-222222222222'
    or v_result->>'protocol_id' <> '11111111-1111-4111-8111-111111111111'
    or (v_result->>'protocol_version')::bigint <> 3
    or (v_result->>'source_protocol_updated_at')::timestamptz <>
       '2026-08-03 17:00:00+00'::timestamptz
    or v_result->>'schema_version' <> 'angela-plan.v1'
    or v_result->'diet' is distinct from v_diet
    or v_result->'training' is distinct from v_training
    or v_result->'generation_metadata' is distinct from v_metadata
    or v_result->>'snapshot_hash' <> 'fa3af851c7b7929761867755f5850b89ec17e601f356b17caac1e0b7edbb2008'
    or (v_result#>>'{counts,diet_meals}')::integer <> 1
    or (v_result#>>'{counts,training_days}')::integer <> 1
    or (v_result#>>'{counts,training_exercises}')::integer <> 1 then
    raise exception 'exact stage readback diverged: %', v_result;
  end if;
  if (select count(*) from jsonb_object_keys(v_result)) <> 13
    or exists (
      select 1
        from jsonb_object_keys(v_result) as readback_key(key)
       where readback_key.key not in (
         'found', 'plan_version_id', 'state', 'user_id', 'protocol_id',
         'protocol_version', 'source_protocol_updated_at', 'schema_version',
         'diet', 'training',
         'generation_metadata', 'snapshot_hash', 'counts'
       )
    )
    or (select count(*) from jsonb_object_keys(v_result->'counts')) <> 3 then
    raise exception 'readback has extra or missing fields: %', v_result;
  end if;

  -- Stage the newer tuple after the old tuple, but activate neither yet.
  v_result := public.stage_angela_plan(
    '22222222-2222-4222-8222-222222222222',
    '66666666-6666-4666-8666-666666666666',
    4,
    '2026-08-03 18:00:00+00',
    'angela-plan.v1',
    repeat('b', 64),
    v_diet,
    v_training,
    v_metadata
  );
  if v_result#>>'{delivery,state}' <> 'staged' then
    raise exception 'new tuple did not stage: %', v_result;
  end if;
end;
$$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$
begin
  if (select count(*) from public.angela_personalized_plans) <> 0 then
    raise exception 'staged plans must be invisible to their owner';
  end if;
end;
$$;
reset role;

set local role service_role;
do $$
declare
  v_diet jsonb := '{
    "water_liters": 2.5,
    "notes": "",
    "daily_calories": 1800,
    "goal": "Saude",
    "macros": {"protein_g":120,"fiber_g":25,"fat_g":60,"carbs_g":180},
    "meals": [{
      "name":"Almoco","time":"12:00","order":1,"calories":500,
      "foods":[{"name":"Arroz","quantity":100,"unit":"g","calories":130,
        "protein_g":3,"carbs_g":28,"fat_g":1,"substitutions":["Batata"]}]
    }]
  }'::jsonb;
  v_training jsonb := '{
    "goal":"Forca","split":"A","frequency":1,"duration_minutes":30,"notes":"",
    "days":[{"name":"Treino A","type":"workout","day_label":"Dia 1",
      "muscle_groups":["pernas"],"warmup":"5 min","cooldown":"Alongar",
      "exercises":[{"name":"Agachamento","order":1,"muscle_group":"pernas",
        "sets":3,"reps":"12","rest_seconds":60,"technique":null,"notes":null,
        "substitutions":["Agachamento livre"]}]}]
  }'::jsonb;
  v_metadata jsonb := '{
    "catalogVersion":"consultoria-open-catalog.2026-07-20",
    "engineVersion":"angela-consultoria-engine.v1",
    "promptVersion":"angela-consultoria-prompts.v1",
    "ragVersion":"consultoria-open-rag-node.v1",
    "schemaVersion":"angela-protocol-draft.v1"
  }'::jsonb;
  v_result jsonb;
  v_new_delivery jsonb;
begin
  begin
    perform public.activate_angela_plan(
      '22222222-2222-4222-8222-222222222222',
      '66666666-6666-4666-8666-666666666666',
      4,
      repeat('d', 64)
    );
    raise exception 'hash mismatch unexpectedly activated';
  exception when invalid_parameter_value then
    if sqlerrm <> 'ANGELA_PLAN_HASH_MISMATCH' then raise; end if;
  end;

  v_result := public.activate_angela_plan(
    '22222222-2222-4222-8222-222222222222',
    '66666666-6666-4666-8666-666666666666',
    4,
    repeat('b', 64)
  );
  if (v_result->>'replayed')::boolean
    or v_result#>>'{delivery,state}' <> 'active' then
    raise exception 'new activation failed: %', v_result;
  end if;

  v_result := public.activate_angela_plan(
    '22222222-2222-4222-8222-222222222222',
    '66666666-6666-4666-8666-666666666666',
    4,
    repeat('b', 64)
  );
  if not (v_result->>'replayed')::boolean
    or v_result#>>'{delivery,state}' <> 'active' then
    raise exception 'new activation replay failed: %', v_result;
  end if;

  -- Required interleaving: activate-new -> first-stage-old -> activate-old.
  v_result := public.stage_angela_plan(
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    2,
    '2026-08-03 16:00:00+00',
    'angela-plan.v1',
    repeat('f', 64),
    v_diet,
    v_training,
    v_metadata
  );
  if (v_result->>'replayed')::boolean
    or v_result#>>'{delivery,state}' <> 'staged' then
    raise exception 'first late-old stage failed: %', v_result;
  end if;

  v_result := public.activate_angela_plan(
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    2,
    repeat('f', 64)
  );
  v_new_delivery := public.read_angela_plan_delivery(
    '22222222-2222-4222-8222-222222222222',
    '66666666-6666-4666-8666-666666666666',
    4
  );
  if not (v_result->>'replayed')::boolean
    or v_result#>>'{delivery,state}' <> 'superseded'
    or v_new_delivery->>'state' <> 'active'
    or (v_new_delivery->>'source_protocol_updated_at')::timestamptz <>
       '2026-08-03 18:00:00+00'::timestamptz then
    raise exception 'ANGELA_PLAN_ACTIVATION_STALE first-stage fence failed: old %, new %',
      v_result,
      v_new_delivery;
  end if;

  -- Equal source timestamps with different identities fail safe to the active row.
  v_result := public.stage_angela_plan(
    '22222222-2222-4222-8222-222222222222',
    '99999999-9999-4999-8999-999999999999',
    5,
    '2026-08-03 18:00:00+00',
    'angela-plan.v1',
    repeat('9', 64),
    v_diet,
    v_training,
    v_metadata
  );
  if v_result#>>'{delivery,state}' <> 'staged' then
    raise exception 'equal-timestamp tuple did not stage: %', v_result;
  end if;

  v_result := public.activate_angela_plan(
    '22222222-2222-4222-8222-222222222222',
    '99999999-9999-4999-8999-999999999999',
    5,
    repeat('9', 64)
  );
  v_new_delivery := public.read_angela_plan_delivery(
    '22222222-2222-4222-8222-222222222222',
    '66666666-6666-4666-8666-666666666666',
    4
  );
  if not (v_result->>'replayed')::boolean
    or v_result#>>'{delivery,state}' <> 'superseded'
    or v_new_delivery->>'state' <> 'active' then
    raise exception 'equal source timestamp replaced active identity: target %, active %',
      v_result,
      v_new_delivery;
  end if;

  -- Required interleaving: staged-old -> activate-new -> delayed activate-old.
  v_result := public.activate_angela_plan(
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111',
    3,
    'fa3af851c7b7929761867755f5850b89ec17e601f356b17caac1e0b7edbb2008'
  );
  v_new_delivery := public.read_angela_plan_delivery(
    '22222222-2222-4222-8222-222222222222',
    '66666666-6666-4666-8666-666666666666',
    4
  );
  if not (v_result->>'replayed')::boolean
    or v_result#>>'{delivery,state}' <> 'superseded'
    or v_result#>>'{delivery,plan_version_id}' is null
    or v_new_delivery->>'state' <> 'active' then
    raise exception 'ANGELA_PLAN_ACTIVATION_STALE fence failed: old %, new %',
      v_result,
      v_new_delivery;
  end if;
end;
$$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$
declare
  v_visible record;
begin
  if (select count(*) from public.angela_personalized_plans) <> 1 then
    raise exception 'owner must see exactly one active plan';
  end if;
  select protocol_id, protocol_version
    into v_visible
    from public.angela_personalized_plans;
  if v_visible.protocol_id <> '66666666-6666-4666-8666-666666666666'
    or v_visible.protocol_version <> 4 then
    raise exception 'owner regressed to an old active plan';
  end if;
end;
$$;

set local request.jwt.claim.sub = '55555555-5555-4555-8555-555555555555';
do $$
begin
  if (select count(*) from public.angela_personalized_plans) <> 0 then
    raise exception 'foreign student can see another plan';
  end if;
end;
$$;

reset role;
rollback;
