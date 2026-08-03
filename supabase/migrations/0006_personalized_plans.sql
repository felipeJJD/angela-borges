-- Entrega versionada e atômica do protocolo personalizado Angela.
-- Migração estritamente aditiva: não altera a Biblioteca, check-ins,
-- completions, teams ou qualquer tabela legada.
--
-- Canonical cross-runtime envelope:
-- {user_id,protocol_id,protocol_version,schema_version,diet,training,generation_metadata}
-- snapshot_hash é fornecido pela Dashboard e preservado sem recomputação SQL.

create or replace function public.is_complete_angela_plan_snapshot(
  p_diet jsonb,
  p_training jsonb,
  p_generation_metadata jsonb
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  meal jsonb;
  food jsonb;
  day_item jsonb;
  exercise jsonb;
  v_workout_days integer := 0;
begin
  if jsonb_typeof(p_diet) is distinct from 'object'
    or jsonb_typeof(p_training) is distinct from 'object'
    or jsonb_typeof(p_generation_metadata) is distinct from 'object'
    or octet_length(p_diet::text) > 262144
    or octet_length(p_training::text) > 262144
    or octet_length(p_generation_metadata::text) > 8192 then
    return false;
  end if;

  if not (p_generation_metadata ?& array[
      'catalogVersion',
      'engineVersion',
      'promptVersion',
      'ragVersion',
      'schemaVersion'
    ])
    or (select count(*) from jsonb_object_keys(p_generation_metadata)) <> 5
    or exists (
      select 1
        from jsonb_each(p_generation_metadata) as metadata_item(key, value)
       where metadata_item.key not in (
         'catalogVersion',
         'engineVersion',
         'promptVersion',
         'ragVersion',
         'schemaVersion'
       )
          or jsonb_typeof(metadata_item.value) is distinct from 'string'
          or metadata_item.value #>> '{}' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    ) then
    return false;
  end if;

  if not (p_diet ?& array[
      'goal',
      'daily_calories',
      'macros',
      'water_liters',
      'notes',
      'meals'
    ])
    or jsonb_typeof(p_diet->'goal') is distinct from 'string'
    or btrim(p_diet->>'goal') = ''
    or length(p_diet->>'goal') > 500
    or jsonb_typeof(p_diet->'daily_calories') is distinct from 'number'
    or (p_diet->>'daily_calories')::numeric < 1
    or jsonb_typeof(p_diet->'macros') is distinct from 'object'
    or not ((p_diet->'macros') ?& array[
      'protein_g', 'carbs_g', 'fat_g', 'fiber_g'
    ])
    or jsonb_typeof(p_diet->'macros'->'protein_g') is distinct from 'number'
    or jsonb_typeof(p_diet->'macros'->'carbs_g') is distinct from 'number'
    or jsonb_typeof(p_diet->'macros'->'fat_g') is distinct from 'number'
    or jsonb_typeof(p_diet->'macros'->'fiber_g') is distinct from 'number'
    or jsonb_typeof(p_diet->'water_liters') is distinct from 'number'
    or jsonb_typeof(p_diet->'notes') is distinct from 'string'
    or not (jsonb_typeof(p_diet->'meals') = 'array')
    or jsonb_array_length(p_diet->'meals') not between 1 and 8 then
    return false;
  end if;

  for meal in select value from jsonb_array_elements(p_diet->'meals') loop
    if jsonb_typeof(meal) is distinct from 'object'
      or not (meal ?& array['order', 'name', 'time', 'calories', 'foods'])
      or jsonb_typeof(meal->'order') is distinct from 'number'
      or (meal->>'order')::numeric < 1
      or trunc((meal->>'order')::numeric) <> (meal->>'order')::numeric
      or jsonb_typeof(meal->'name') is distinct from 'string'
      or btrim(meal->>'name') = ''
      or length(meal->>'name') > 500
      or jsonb_typeof(meal->'time') is distinct from 'string'
      or btrim(meal->>'time') = ''
      or length(meal->>'time') > 20
      or jsonb_typeof(meal->'calories') is distinct from 'number'
      or not (jsonb_typeof(meal->'foods') = 'array')
      or jsonb_array_length(meal->'foods') not between 1 and 50 then
      return false;
    end if;

    for food in select value from jsonb_array_elements(meal->'foods') loop
      if jsonb_typeof(food) is distinct from 'object'
        or not (food ?& array[
          'name',
          'quantity',
          'unit',
          'calories',
          'protein_g',
          'carbs_g',
          'fat_g',
          'substitutions'
        ])
        or jsonb_typeof(food->'name') is distinct from 'string'
        or btrim(food->>'name') = ''
        or length(food->>'name') > 500
        or jsonb_typeof(food->'quantity') is distinct from 'number'
        or jsonb_typeof(food->'unit') is distinct from 'string'
        or btrim(food->>'unit') = ''
        or length(food->>'unit') > 50
        or jsonb_typeof(food->'calories') is distinct from 'number'
        or jsonb_typeof(food->'protein_g') is distinct from 'number'
        or jsonb_typeof(food->'carbs_g') is distinct from 'number'
        or jsonb_typeof(food->'fat_g') is distinct from 'number'
        or jsonb_typeof(food->'substitutions') is distinct from 'array'
        or jsonb_array_length(food->'substitutions') > 50
        or exists (
          select 1
            from jsonb_array_elements(food->'substitutions') as substitution(value)
           where jsonb_typeof(substitution.value) is distinct from 'string'
              or length(substitution.value #>> '{}') > 500
        ) then
        return false;
      end if;
    end loop;
  end loop;

  if not (p_training ?& array[
      'goal',
      'split',
      'frequency',
      'duration_minutes',
      'notes',
      'days'
    ])
    or jsonb_typeof(p_training->'goal') is distinct from 'string'
    or btrim(p_training->>'goal') = ''
    or length(p_training->>'goal') > 500
    or jsonb_typeof(p_training->'split') is distinct from 'string'
    or btrim(p_training->>'split') = ''
    or length(p_training->>'split') > 500
    or jsonb_typeof(p_training->'frequency') is distinct from 'number'
    or (p_training->>'frequency')::numeric < 1
    or trunc((p_training->>'frequency')::numeric) <> (p_training->>'frequency')::numeric
    or jsonb_typeof(p_training->'duration_minutes') is distinct from 'number'
    or (p_training->>'duration_minutes')::numeric < 1
    or trunc((p_training->>'duration_minutes')::numeric) <>
       (p_training->>'duration_minutes')::numeric
    or jsonb_typeof(p_training->'notes') is distinct from 'string'
    or not (jsonb_typeof(p_training->'days') = 'array')
    or jsonb_array_length(p_training->'days') not between 1 and 7 then
    return false;
  end if;

  for day_item in select value from jsonb_array_elements(p_training->'days') loop
    if jsonb_typeof(day_item) is distinct from 'object'
      or not (day_item ?& array[
        'day_label',
        'name',
        'muscle_groups',
        'warmup',
        'cooldown',
        'exercises'
      ])
      or (
        day_item ? 'type'
        and day_item->>'type' not in ('workout', 'rest')
      )
      or jsonb_typeof(day_item->'day_label') is distinct from 'string'
      or btrim(day_item->>'day_label') = ''
      or length(day_item->>'day_label') > 500
      or jsonb_typeof(day_item->'name') is distinct from 'string'
      or btrim(day_item->>'name') = ''
      or length(day_item->>'name') > 500
      or jsonb_typeof(day_item->'muscle_groups') is distinct from 'array'
      or jsonb_array_length(day_item->'muscle_groups') > 50
      or exists (
        select 1
          from jsonb_array_elements(day_item->'muscle_groups') as muscle_group(value)
         where jsonb_typeof(muscle_group.value) is distinct from 'string'
            or length(muscle_group.value #>> '{}') > 500
      )
      or jsonb_typeof(day_item->'warmup') is distinct from 'string'
      or jsonb_typeof(day_item->'cooldown') is distinct from 'string'
      or not (jsonb_typeof(day_item->'exercises') = 'array')
      or jsonb_array_length(day_item->'exercises') > 50 then
      return false;
    end if;

    if coalesce(day_item->>'type', 'workout') = 'workout' then
      if jsonb_array_length(day_item->'exercises') = 0 then
        return false;
      end if;
      v_workout_days := v_workout_days + 1;
    elsif jsonb_array_length(day_item->'exercises') <> 0 then
      return false;
    end if;

    for exercise in select value from jsonb_array_elements(day_item->'exercises') loop
      if jsonb_typeof(exercise) is distinct from 'object'
        or not (exercise ?& array[
          'order',
          'name',
          'muscle_group',
          'sets',
          'reps',
          'rest_seconds',
          'technique',
          'notes',
          'substitutions'
        ])
        or jsonb_typeof(exercise->'order') is distinct from 'number'
        or (exercise->>'order')::numeric < 1
        or trunc((exercise->>'order')::numeric) <> (exercise->>'order')::numeric
        or jsonb_typeof(exercise->'name') is distinct from 'string'
        or btrim(exercise->>'name') = ''
        or length(exercise->>'name') > 500
        or jsonb_typeof(exercise->'muscle_group') is distinct from 'string'
        or btrim(exercise->>'muscle_group') = ''
        or length(exercise->>'muscle_group') > 500
        or jsonb_typeof(exercise->'sets') is distinct from 'number'
        or (exercise->>'sets')::numeric < 1
        or trunc((exercise->>'sets')::numeric) <> (exercise->>'sets')::numeric
        or jsonb_typeof(exercise->'reps') is distinct from 'string'
        or btrim(exercise->>'reps') = ''
        or length(exercise->>'reps') > 100
        or jsonb_typeof(exercise->'rest_seconds') is distinct from 'number'
        or (exercise->>'rest_seconds')::numeric < 0
        or trunc((exercise->>'rest_seconds')::numeric) <>
           (exercise->>'rest_seconds')::numeric
        or jsonb_typeof(exercise->'technique') not in ('null', 'string')
        or jsonb_typeof(exercise->'notes') not in ('null', 'string')
        or jsonb_typeof(exercise->'substitutions') is distinct from 'array'
        or jsonb_array_length(exercise->'substitutions') > 50
        or exists (
          select 1
            from jsonb_array_elements(exercise->'substitutions') as substitution(value)
           where jsonb_typeof(substitution.value) is distinct from 'string'
              or length(substitution.value #>> '{}') > 500
        ) then
        return false;
      end if;
    end loop;
  end loop;

  return v_workout_days > 0;
exception
  when data_exception or numeric_value_out_of_range then
    return false;
end;
$$;

create table public.angela_personalized_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  protocol_id uuid not null,
  protocol_version bigint not null check (
    protocol_version >= 1 and protocol_version <= 9007199254740991
  ),
  delivery_sequence bigint generated always as identity unique,
  schema_version text not null check (schema_version = 'angela-plan.v1'),
  snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  diet jsonb not null,
  training jsonb not null,
  generation_metadata jsonb not null,
  state text not null default 'staged'
    check (state in ('staged', 'active', 'superseded')),
  staged_at timestamptz not null default statement_timestamp(),
  activated_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (user_id, protocol_id, protocol_version),
  check (
    public.is_complete_angela_plan_snapshot(
      diet,
      training,
      generation_metadata
    )
  ),
  check (
    (state = 'staged' and activated_at is null and superseded_at is null) or
    (state = 'active' and activated_at is not null and superseded_at is null) or
    (state = 'superseded' and activated_at is null and superseded_at is not null) or
    (state = 'superseded' and activated_at is not null and superseded_at is not null)
  ),
  check (activated_at is null or activated_at >= staged_at),
  check (superseded_at is null or superseded_at >= staged_at),
  check (superseded_at is null or superseded_at >= activated_at)
);

create unique index angela_personalized_plans_one_active_user_idx
  on public.angela_personalized_plans (user_id)
  where state = 'active';

create index angela_personalized_plans_delivery_idx
  on public.angela_personalized_plans (
    user_id,
    protocol_id,
    protocol_version
  );

create index angela_personalized_plans_fence_idx
  on public.angela_personalized_plans (user_id, delivery_sequence desc);

create or replace function public.prevent_angela_plan_payload_change()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if old.user_id is distinct from new.user_id
    or old.protocol_id is distinct from new.protocol_id
    or old.protocol_version is distinct from new.protocol_version
    or old.delivery_sequence is distinct from new.delivery_sequence
    or old.schema_version is distinct from new.schema_version
    or old.snapshot_hash is distinct from new.snapshot_hash
    or old.diet is distinct from new.diet
    or old.training is distinct from new.training
    or old.generation_metadata is distinct from new.generation_metadata
    or old.staged_at is distinct from new.staged_at
    or old.created_at is distinct from new.created_at then
    raise exception using
      errcode = '22023',
      message = 'ANGELA_PLAN_SNAPSHOT_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger angela_personalized_plans_payload_immutable
before update on public.angela_personalized_plans
for each row execute function public.prevent_angela_plan_payload_change();

create or replace function public.read_angela_plan_delivery(
  p_user_id uuid,
  p_protocol_id uuid,
  p_protocol_version bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_plan public.angela_personalized_plans%rowtype;
  v_training_exercises integer;
begin
  if p_user_id is null
    or p_protocol_id is null
    or p_protocol_version is null
    or p_protocol_version < 1
    or p_protocol_version > 9007199254740991 then
    raise exception using
      errcode = '22023',
      message = 'ANGELA_PLAN_IDENTITY_REQUIRED';
  end if;

  select plan.*
    into v_plan
    from public.angela_personalized_plans as plan
   where plan.user_id = p_user_id
     and plan.protocol_id = p_protocol_id
     and plan.protocol_version = p_protocol_version;

  if not found then
    return jsonb_build_object('found', false);
  end if;

  select coalesce(sum(jsonb_array_length(day_item.value->'exercises')), 0)::integer
    into v_training_exercises
    from jsonb_array_elements(v_plan.training->'days') as day_item(value);

  return jsonb_build_object(
    'found', true,
    'plan_version_id', v_plan.id,
    'state', v_plan.state,
    'user_id', v_plan.user_id,
    'protocol_id', v_plan.protocol_id,
    'protocol_version', v_plan.protocol_version,
    'schema_version', v_plan.schema_version,
    'diet', v_plan.diet,
    'training', v_plan.training,
    'generation_metadata', v_plan.generation_metadata,
    'snapshot_hash', v_plan.snapshot_hash,
    'counts', jsonb_build_object(
      'diet_meals', jsonb_array_length(v_plan.diet->'meals'),
      'training_days', jsonb_array_length(v_plan.training->'days'),
      'training_exercises', v_training_exercises
    )
  );
end;
$$;

create or replace function public.stage_angela_plan(
  p_user_id uuid,
  p_protocol_id uuid,
  p_protocol_version bigint,
  p_schema_version text,
  p_snapshot_hash text,
  p_diet jsonb,
  p_training jsonb,
  p_generation_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_existing public.angela_personalized_plans%rowtype;
begin
  if p_user_id is null
    or p_protocol_id is null
    or p_protocol_version is null
    or p_protocol_version < 1
    or p_protocol_version > 9007199254740991
    or p_schema_version is distinct from 'angela-plan.v1'
    or p_snapshot_hash is null
    or p_snapshot_hash !~ '^[0-9a-f]{64}$'
    or not public.is_complete_angela_plan_snapshot(
      p_diet,
      p_training,
      p_generation_metadata
    ) then
    raise exception using
      errcode = '22023',
      message = 'ANGELA_PLAN_SNAPSHOT_INCOMPLETE';
  end if;

  perform 1
    from public.profiles
   where id = p_user_id
   for update;
  if not found then
    raise exception using
      errcode = '23503',
      message = 'ANGELA_PLAN_USER_NOT_FOUND';
  end if;

  select plan.*
    into v_existing
    from public.angela_personalized_plans as plan
   where plan.user_id = p_user_id
     and plan.protocol_id = p_protocol_id
     and plan.protocol_version = p_protocol_version
   for update;

  if found then
    if v_existing.snapshot_hash is distinct from p_snapshot_hash
      or v_existing.schema_version is distinct from p_schema_version
      or v_existing.diet is distinct from p_diet
      or v_existing.training is distinct from p_training
      or v_existing.generation_metadata is distinct from p_generation_metadata then
      raise exception using
        errcode = '23505',
        message = 'ANGELA_PLAN_STAGE_CONFLICT';
    end if;

    return jsonb_build_object(
      'replayed', true,
      'delivery', public.read_angela_plan_delivery(
        p_user_id,
        p_protocol_id,
        p_protocol_version
      )
    );
  end if;

  begin
    insert into public.angela_personalized_plans (
      user_id,
      protocol_id,
      protocol_version,
      schema_version,
      snapshot_hash,
      diet,
      training,
      generation_metadata
    ) values (
      p_user_id,
      p_protocol_id,
      p_protocol_version,
      p_schema_version,
      p_snapshot_hash,
      p_diet,
      p_training,
      p_generation_metadata
    );
  exception
    when unique_violation then
      select plan.*
        into v_existing
        from public.angela_personalized_plans as plan
       where plan.user_id = p_user_id
         and plan.protocol_id = p_protocol_id
         and plan.protocol_version = p_protocol_version
       for update;

      if not found then
        raise;
      end if;
      if v_existing.snapshot_hash is distinct from p_snapshot_hash
        or v_existing.schema_version is distinct from p_schema_version
        or v_existing.diet is distinct from p_diet
        or v_existing.training is distinct from p_training
        or v_existing.generation_metadata is distinct from p_generation_metadata then
        raise exception using
          errcode = '23505',
          message = 'ANGELA_PLAN_STAGE_CONFLICT';
      end if;

      return jsonb_build_object(
        'replayed', true,
        'delivery', public.read_angela_plan_delivery(
          p_user_id,
          p_protocol_id,
          p_protocol_version
        )
      );
  end;

  return jsonb_build_object(
    'replayed', false,
    'delivery', public.read_angela_plan_delivery(
      p_user_id,
      p_protocol_id,
      p_protocol_version
    )
  );
end;
$$;

create or replace function public.activate_angela_plan(
  p_user_id uuid,
  p_protocol_id uuid,
  p_protocol_version bigint,
  p_snapshot_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_target public.angela_personalized_plans%rowtype;
  v_newest_sequence bigint;
  v_now timestamptz := statement_timestamp();
begin
  if p_user_id is null
    or p_protocol_id is null
    or p_protocol_version is null
    or p_protocol_version < 1
    or p_protocol_version > 9007199254740991
    or p_snapshot_hash is null
    or p_snapshot_hash !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = '22023',
      message = 'ANGELA_PLAN_ACTIVATION_INCOMPLETE';
  end if;

  perform 1
    from public.profiles
   where id = p_user_id
   for update;
  if not found then
    raise exception using
      errcode = '23503',
      message = 'ANGELA_PLAN_USER_NOT_FOUND';
  end if;

  select plan.*
    into v_target
    from public.angela_personalized_plans as plan
   where plan.user_id = p_user_id
     and plan.protocol_id = p_protocol_id
     and plan.protocol_version = p_protocol_version
   for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'ANGELA_PLAN_NOT_STAGED';
  end if;
  if v_target.snapshot_hash is distinct from p_snapshot_hash then
    raise exception using
      errcode = '22023',
      message = 'ANGELA_PLAN_HASH_MISMATCH';
  end if;

  if v_target.state in ('active', 'superseded') then
    return jsonb_build_object(
      'replayed', true,
      'delivery', public.read_angela_plan_delivery(
        p_user_id,
        p_protocol_id,
        p_protocol_version
      )
    );
  end if;

  select max(plan.delivery_sequence)
    into v_newest_sequence
    from public.angela_personalized_plans as plan
   where plan.user_id = p_user_id
     and plan.state in ('active', 'staged');

  if v_target.delivery_sequence < v_newest_sequence then
    update public.angela_personalized_plans
       set state = 'superseded',
           activated_at = null,
           superseded_at = v_now,
           updated_at = v_now
     where id = v_target.id
       and state = 'staged';

    return jsonb_build_object(
      'replayed', true,
      'delivery', public.read_angela_plan_delivery(
        p_user_id,
        p_protocol_id,
        p_protocol_version
      )
    );
  end if;

  update public.angela_personalized_plans
     set state = 'superseded',
         superseded_at = v_now,
         updated_at = v_now
   where user_id = p_user_id
     and state in ('active', 'staged')
     and delivery_sequence < v_target.delivery_sequence;

  update public.angela_personalized_plans
     set state = 'active',
         activated_at = v_now,
         superseded_at = null,
         updated_at = v_now
   where id = v_target.id
     and state = 'staged';

  if not found then
    raise exception using
      errcode = '40001',
      message = 'ANGELA_PLAN_ACTIVATION_RACE';
  end if;

  return jsonb_build_object(
    'replayed', false,
    'delivery', public.read_angela_plan_delivery(
      p_user_id,
      p_protocol_id,
      p_protocol_version
    )
  );
end;
$$;

alter table public.angela_personalized_plans enable row level security;

create policy "Angela active plan read own"
on public.angela_personalized_plans
for select
to authenticated
using (user_id = auth.uid() and state = 'active');

revoke all on public.angela_personalized_plans
  from public, anon, authenticated, service_role;

grant select (
  id,
  user_id,
  protocol_id,
  protocol_version,
  schema_version,
  snapshot_hash,
  diet,
  training,
  generation_metadata,
  state,
  staged_at,
  activated_at,
  superseded_at,
  created_at,
  updated_at
) on public.angela_personalized_plans to authenticated;

revoke all on function public.is_complete_angela_plan_snapshot(jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.prevent_angela_plan_payload_change()
  from public, anon, authenticated, service_role;
revoke all on function public.stage_angela_plan(uuid, uuid, bigint, text, text, jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.read_angela_plan_delivery(uuid, uuid, bigint)
  from public, anon, authenticated, service_role;
revoke all on function public.activate_angela_plan(uuid, uuid, bigint, text)
  from public, anon, authenticated, service_role;

grant execute on function public.stage_angela_plan(uuid, uuid, bigint, text, text, jsonb, jsonb, jsonb)
  to service_role;
grant execute on function public.read_angela_plan_delivery(uuid, uuid, bigint)
  to service_role;
grant execute on function public.activate_angela_plan(uuid, uuid, bigint, text)
  to service_role;
