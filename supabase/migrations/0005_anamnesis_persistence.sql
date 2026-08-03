-- Persistência versionada da anamnese Angela.
-- Migration estritamente aditiva: não altera nem remove profiles, workouts,
-- check-ins, completions, teams ou o conteúdo legado já existente.

create table public.anamnesis_drafts (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  schema_version text not null check (schema_version = 'angela-anamnesis.v1'),
  revision bigint not null check (revision >= 1),
  status text not null check (status in ('draft', 'submitted')),
  answers jsonb not null default '{}'::jsonb,
  idempotency_key uuid not null unique,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  submitted_at timestamptz,
  unique (user_id, schema_version),
  check (idempotency_key = id),
  check (
    (status = 'draft' and submitted_at is null) or
    (status = 'submitted' and submitted_at is not null)
  )
);

create table public.anamnesis_submissions (
  id uuid primary key,
  draft_id uuid not null unique references public.anamnesis_drafts(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  schema_version text not null check (schema_version = 'angela-anamnesis.v1'),
  revision bigint not null check (revision >= 1),
  status text not null default 'submitted' check (status = 'submitted'),
  answers jsonb not null,
  idempotency_key uuid not null unique,
  correlation_id uuid not null unique,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  submitted_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  check (id = draft_id),
  check (idempotency_key = id),
  check (correlation_id = id)
);

create table public.dashboard_outbox (
  id uuid primary key,
  submission_id uuid not null unique references public.anamnesis_submissions(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  idempotency_key uuid not null unique,
  correlation_id uuid not null unique,
  schema_version text not null check (schema_version = 'angela-anamnesis.v1'),
  payload jsonb not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'retry_wait', 'delivered', 'dead_letter')),
  attempts smallint not null default 0 check (attempts between 0 and 5),
  next_attempt_at timestamptz not null default statement_timestamp(),
  locked_until timestamptz,
  delivered_at timestamptz,
  last_error_code text check (last_error_code is null or length(last_error_code) <= 64),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  check (id = submission_id),
  check (idempotency_key = id),
  check (correlation_id = id),
  check ((status = 'delivered') = (delivered_at is not null))
);

create index dashboard_outbox_retry_idx
  on public.dashboard_outbox (status, next_attempt_at)
  where status in ('pending', 'retry_wait', 'processing');

create or replace function public.angela_anamnesis_v1_keys()
returns text[]
language sql
immutable
set search_path = pg_catalog, public
as $$
  select array[
    'birth_date',
    'height_cm',
    'weight_kg',
    'nutrition_goal',
    'meal_routine',
    'dietary_restrictions',
    'nutrition_challenge',
    'health_history',
    'sleep_quality',
    'water_intake',
    'emotional_eating',
    'meal_preparation',
    'planned_supplements',
    'sweet_craving_times',
    'disliked_foods',
    'food_budget',
    'training_experience_level',
    'training_days_per_week',
    'training_location',
    'injuries_or_limitations',
    'preferred_exercises',
    'conditioning_level',
    'training_background',
    'training_barrier',
    'training_focus_areas'
  ]::text[];
$$;

create or replace function public.is_valid_angela_anamnesis_multi_answer(
  p_answers jsonb,
  p_key text,
  p_allowed text[],
  p_max_selections integer default null,
  p_exclusive_option text default null
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
  v_distinct_count integer;
begin
  if not (p_answers ? p_key) then
    return true;
  end if;
  if jsonb_typeof(p_answers -> p_key) is distinct from 'array' then
    return false;
  end if;

  v_count := jsonb_array_length(p_answers -> p_key);
  if v_count = 0 or (p_max_selections is not null and v_count > p_max_selections) then
    return false;
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_answers -> p_key) as item(value)
     where jsonb_typeof(item.value) is distinct from 'string'
  ) then
    return false;
  end if;
  if exists (
    select 1
      from jsonb_array_elements_text(p_answers -> p_key) as item(value)
     where not (item.value = any(p_allowed))
  ) then
    return false;
  end if;

  select count(distinct item.value)
    into v_distinct_count
    from jsonb_array_elements_text(p_answers -> p_key) as item(value);
  if v_distinct_count <> v_count then
    return false;
  end if;
  if p_exclusive_option is not null
     and (p_answers -> p_key) ? p_exclusive_option
     and v_count > 1 then
    return false;
  end if;

  return true;
end;
$$;

create or replace function public.is_valid_angela_anamnesis_answers(
  p_answers jsonb,
  p_require_complete boolean
)
returns boolean
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  v_keys text[] := public.angela_anamnesis_v1_keys();
  v_key_count integer;
begin
  if jsonb_typeof(p_answers) is distinct from 'object' then
    return false;
  end if;

  if exists (
    select 1
      from jsonb_object_keys(p_answers) as answer_key
     where not (answer_key = any(v_keys))
  ) then
    return false;
  end if;

  if exists (
    select 1
      from jsonb_each(p_answers) as answer_entry
     where jsonb_typeof(answer_entry.value) = 'null'
  ) then
    return false;
  end if;

  select count(*) into v_key_count from jsonb_object_keys(p_answers);
  if p_require_complete and v_key_count <> 25 then
    return false;
  end if;

  if p_answers ? 'birth_date' then
    if jsonb_typeof(p_answers -> 'birth_date') is distinct from 'string'
       or (p_answers ->> 'birth_date') !~ '^\d{4}-\d{2}-\d{2}$' then
      return false;
    end if;
    begin
      if to_char(to_date(p_answers ->> 'birth_date', 'YYYY-MM-DD'), 'YYYY-MM-DD')
           <> (p_answers ->> 'birth_date')
         or to_date(p_answers ->> 'birth_date', 'YYYY-MM-DD') > current_date then
        return false;
      end if;
    exception when others then
      return false;
    end;
  end if;
  if p_answers ? 'height_cm' then
    if jsonb_typeof(p_answers -> 'height_cm') is distinct from 'number'
       or (p_answers ->> 'height_cm')::numeric <> trunc((p_answers ->> 'height_cm')::numeric)
       or (p_answers ->> 'height_cm')::numeric not between 120 and 220 then
      return false;
    end if;
  end if;
  if p_answers ? 'weight_kg' then
    if jsonb_typeof(p_answers -> 'weight_kg') is distinct from 'number'
       or (p_answers ->> 'weight_kg')::numeric not between 35 and 300 then
      return false;
    end if;
  end if;

  if p_answers ? 'injuries_or_limitations'
     and (
       jsonb_typeof(p_answers -> 'injuries_or_limitations') is distinct from 'string'
       or length(trim(p_answers ->> 'injuries_or_limitations')) not between 2 and 500
     ) then
    return false;
  end if;

  if (p_answers ? 'nutrition_goal' and not (p_answers ->> 'nutrition_goal' = any(array['weight_loss', 'muscle_gain', 'general_health']::text[])))
     or (p_answers ? 'nutrition_challenge' and not (p_answers ->> 'nutrition_challenge' = any(array['sweets', 'anxiety_compulsion', 'alcohol', 'overeating', 'meal_planning']::text[])))
     or (p_answers ? 'sleep_quality' and not (p_answers ->> 'sleep_quality' = any(array['excellent', 'good', 'fair', 'poor']::text[])))
     or (p_answers ? 'water_intake' and not (p_answers ->> 'water_intake' = any(array['under_1l', '1_to_1_5l', '1_75_to_2l', 'over_2l']::text[])))
     or (p_answers ? 'emotional_eating' and not (p_answers ->> 'emotional_eating' = any(array['never', 'rarely', 'often', 'always']::text[])))
     or (p_answers ? 'meal_preparation' and not (p_answers ->> 'meal_preparation' = any(array['self', 'family', 'eats_out', 'delivery', 'household_help']::text[])))
     or (p_answers ? 'food_budget' and not (p_answers ->> 'food_budget' = any(array['up_to_200', '200_to_400', '400_to_600', 'over_600']::text[])))
     or (p_answers ? 'training_experience_level' and not (p_answers ->> 'training_experience_level' = any(array['beginner', 'basic', 'intermediate', 'experienced']::text[])))
     or (p_answers ? 'training_days_per_week' and not (p_answers ->> 'training_days_per_week' = any(array['1_2_days', '3_4_days', '5_6_days', 'every_day']::text[])))
     or (p_answers ? 'training_location' and not (p_answers ->> 'training_location' = any(array['gym', 'home_equipment', 'outdoors', 'mixed']::text[])))
     or (p_answers ? 'conditioning_level' and not (p_answers ->> 'conditioning_level' = any(array['very_low', 'low', 'medium', 'good']::text[])))
     or (p_answers ? 'training_background' and not (p_answers ->> 'training_background' = any(array['never_consistent', 'school_sports', 'gym_months', 'diverse_experience']::text[])))
     or (p_answers ? 'training_barrier' and not (p_answers ->> 'training_barrier' = any(array['time', 'motivation', 'knowledge', 'fatigue']::text[]))) then
    return false;
  end if;

  if not public.is_valid_angela_anamnesis_multi_answer(p_answers, 'meal_routine', array['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper', 'late_night_snack']::text[])
     or not public.is_valid_angela_anamnesis_multi_answer(p_answers, 'dietary_restrictions', array['none', 'lactose_intolerance', 'gluten_intolerance', 'other_allergies']::text[], p_exclusive_option => 'none')
     or not public.is_valid_angela_anamnesis_multi_answer(p_answers, 'health_history', array['diabetes', 'hypertension', 'high_cholesterol', 'none']::text[], p_exclusive_option => 'none')
     or not public.is_valid_angela_anamnesis_multi_answer(p_answers, 'planned_supplements', array['none', 'whey_protein', 'creatine', 'pre_workout', 'omega_3', 'multivitamin']::text[], p_exclusive_option => 'none')
     or not public.is_valid_angela_anamnesis_multi_answer(p_answers, 'sweet_craving_times', array['none', 'breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper']::text[], p_exclusive_option => 'none')
     or not public.is_valid_angela_anamnesis_multi_answer(p_answers, 'disliked_foods', array['none', 'kale', 'eggplant', 'cucumber', 'tomato', 'onion', 'garlic', 'pepper', 'carrot', 'broccoli', 'zucchini', 'mushrooms', 'peanuts', 'fish', 'shrimp', 'octopus', 'squid', 'egg', 'cheese', 'milk', 'yogurt', 'whole_grain_bread']::text[], p_exclusive_option => 'none')
     or not public.is_valid_angela_anamnesis_multi_answer(p_answers, 'preferred_exercises', array['strength', 'aerobic', 'functional', 'varied']::text[], p_max_selections => 2)
     or not public.is_valid_angela_anamnesis_multi_answer(p_answers, 'training_focus_areas', array['glutes', 'legs', 'arms', 'back', 'shoulders', 'chest']::text[], p_max_selections => 2) then
    return false;
  end if;

  return true;
end;
$$;

create or replace function public.save_anamnesis_draft(
  p_draft_id uuid,
  p_schema_version text,
  p_expected_revision bigint,
  p_answers jsonb,
  p_idempotency_key uuid
)
returns public.anamnesis_drafts
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_current public.anamnesis_drafts%rowtype;
  v_saved public.anamnesis_drafts%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'ANAMNESIS_AUTH_REQUIRED';
  end if;
  if p_schema_version is distinct from 'angela-anamnesis.v1' then
    raise exception using errcode = '22023', message = 'ANAMNESIS_SCHEMA_MISMATCH';
  end if;
  if p_draft_id is null or p_idempotency_key is distinct from p_draft_id then
    raise exception using errcode = '22023', message = 'ANAMNESIS_IDENTITY_MISMATCH';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception using errcode = '22023', message = 'ANAMNESIS_INVALID_REVISION';
  end if;
  if not public.is_valid_angela_anamnesis_answers(p_answers, false) then
    raise exception using errcode = '22023', message = 'ANAMNESIS_INVALID_ANSWERS';
  end if;

  -- A profile lock serializes the first insert as well as later row locks.
  perform 1 from public.profiles where id = v_user_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'ANAMNESIS_PROFILE_REQUIRED';
  end if;

  select * into v_current
    from public.anamnesis_drafts
   where user_id = v_user_id
     and schema_version = 'angela-anamnesis.v1'
   for update;

  if not found then
    if p_expected_revision <> 0 then
      raise exception using
        errcode = '40001',
        message = 'ANAMNESIS_REVISION_CONFLICT',
        detail = 'actual_revision=0';
    end if;

    insert into public.anamnesis_drafts (
      id, user_id, schema_version, revision, status, answers, idempotency_key
    ) values (
      p_draft_id, v_user_id, 'angela-anamnesis.v1', 1, 'draft', p_answers,
      p_idempotency_key
    )
    returning * into v_saved;
    return v_saved;
  end if;

  if v_current.id <> p_draft_id
     or v_current.idempotency_key <> p_idempotency_key then
    raise exception using errcode = '22023', message = 'ANAMNESIS_IDENTITY_MISMATCH';
  end if;
  if v_current.status = 'submitted' then
    raise exception using errcode = '55000', message = 'ANAMNESIS_ALREADY_SUBMITTED';
  end if;
  if v_current.revision <> p_expected_revision then
    raise exception using
      errcode = '40001',
      message = 'ANAMNESIS_REVISION_CONFLICT',
      detail = format('actual_revision=%s', v_current.revision);
  end if;

  update public.anamnesis_drafts
     set answers = p_answers,
         revision = v_current.revision + 1,
         updated_at = statement_timestamp()
   where id = v_current.id
  returning * into v_saved;

  return v_saved;
end;
$$;

create or replace function public.submit_anamnesis_draft(
  p_user_id uuid,
  p_draft_id uuid,
  p_schema_version text,
  p_expected_revision bigint,
  p_expected_answers jsonb,
  p_idempotency_key uuid,
  p_payload_hash text
)
returns table (
  id uuid,
  user_id uuid,
  schema_version text,
  revision bigint,
  status text,
  answers jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  submitted_at timestamptz,
  idempotency_key uuid,
  correlation_id uuid,
  payload_hash text,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_draft public.anamnesis_drafts%rowtype;
  v_submission public.anamnesis_submissions%rowtype;
  v_now timestamptz;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'ANAMNESIS_USER_REQUIRED';
  end if;
  if p_schema_version is distinct from 'angela-anamnesis.v1' then
    raise exception using errcode = '22023', message = 'ANAMNESIS_SCHEMA_MISMATCH';
  end if;
  if p_draft_id is null or p_idempotency_key is distinct from p_draft_id then
    raise exception using errcode = '22023', message = 'ANAMNESIS_IDENTITY_MISMATCH';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception using errcode = '22023', message = 'ANAMNESIS_INVALID_REVISION';
  end if;
  if not public.is_valid_angela_anamnesis_answers(p_expected_answers, true) then
    raise exception using errcode = '22023', message = 'ANAMNESIS_INCOMPLETE';
  end if;
  if p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'ANAMNESIS_INVALID_PAYLOAD_HASH';
  end if;

  perform 1 from public.profiles where public.profiles.id = p_user_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'ANAMNESIS_PROFILE_REQUIRED';
  end if;

  -- Replays are accepted only for the same immutable logical snapshot.
  select * into v_submission
    from public.anamnesis_submissions
   where public.anamnesis_submissions.idempotency_key = p_idempotency_key
   for share;
  if found then
    if v_submission.user_id <> p_user_id
       or v_submission.draft_id <> p_draft_id
       or v_submission.schema_version <> p_schema_version
       or v_submission.idempotency_key <> p_idempotency_key
       or v_submission.correlation_id <> p_idempotency_key then
      raise exception using errcode = '42501', message = 'ANAMNESIS_SCOPE_MISMATCH';
    end if;
    if v_submission.answers is distinct from p_expected_answers
       or v_submission.payload_hash <> p_payload_hash then
      raise exception using errcode = '22023', message = 'ANAMNESIS_REPLAY_MISMATCH';
    end if;
    select * into v_draft
      from public.anamnesis_drafts
     where public.anamnesis_drafts.id = p_draft_id
       and public.anamnesis_drafts.user_id = p_user_id
     for update;
    if not found
       or v_draft.schema_version <> p_schema_version
       or v_draft.revision <> p_expected_revision
       or v_draft.answers is distinct from p_expected_answers
       or v_draft.status <> 'submitted' then
      raise exception using errcode = '22023', message = 'ANAMNESIS_REPLAY_MISMATCH';
    end if;
    return query select
      v_draft.id, v_draft.user_id, v_draft.schema_version, v_draft.revision,
      v_draft.status, v_draft.answers, v_draft.created_at, v_draft.updated_at,
      v_draft.submitted_at, v_draft.idempotency_key,
      v_submission.correlation_id, v_submission.payload_hash, true;
    return;
  end if;

  select * into v_draft
    from public.anamnesis_drafts
   where public.anamnesis_drafts.id = p_draft_id
     and public.anamnesis_drafts.user_id = p_user_id
     and public.anamnesis_drafts.schema_version = 'angela-anamnesis.v1'
   for update;
  if not found then
    raise exception using errcode = '42501', message = 'ANAMNESIS_DRAFT_NOT_FOUND';
  end if;
  if v_draft.idempotency_key <> p_idempotency_key then
    raise exception using errcode = '22023', message = 'ANAMNESIS_IDENTITY_MISMATCH';
  end if;
  if v_draft.revision <> p_expected_revision then
    raise exception using
      errcode = '40001',
      message = 'ANAMNESIS_REVISION_CONFLICT',
      detail = format('actual_revision=%s', v_draft.revision);
  end if;
  if v_draft.answers is distinct from p_expected_answers then
    raise exception using errcode = '40001', message = 'ANAMNESIS_ANSWERS_CONFLICT';
  end if;

  v_now := statement_timestamp();

  update public.anamnesis_drafts
     set revision = v_draft.revision + 1,
         status = 'submitted',
         updated_at = v_now,
         submitted_at = v_now
   where public.anamnesis_drafts.id = v_draft.id
  returning * into v_draft;

  insert into public.anamnesis_submissions (
    id, draft_id, user_id, schema_version, revision, answers,
    idempotency_key, correlation_id, payload_hash, submitted_at
  ) values (
    v_draft.id, v_draft.id, v_draft.user_id, v_draft.schema_version,
    v_draft.revision, v_draft.answers, v_draft.idempotency_key,
    v_draft.id, p_payload_hash, v_now
  )
  returning * into v_submission;

  insert into public.dashboard_outbox (
    id, submission_id, user_id, idempotency_key, correlation_id,
    schema_version, payload, payload_hash
  ) values (
    v_submission.id, v_submission.id, v_submission.user_id,
    v_submission.idempotency_key, v_submission.correlation_id,
    v_submission.schema_version,
    jsonb_build_object(
      'user_id', v_submission.user_id,
      'schema_version', v_submission.schema_version,
      'answers', v_submission.answers,
      'submitted_at', v_submission.submitted_at,
      'idempotency_key', v_submission.idempotency_key,
      'correlation_id', v_submission.correlation_id,
      'payload_hash', v_submission.payload_hash
    ),
    p_payload_hash
  );

  return query select
    v_draft.id, v_draft.user_id, v_draft.schema_version, v_draft.revision,
    v_draft.status, v_draft.answers, v_draft.created_at, v_draft.updated_at,
    v_draft.submitted_at, v_draft.idempotency_key,
    v_submission.correlation_id, v_submission.payload_hash, false;
end;
$$;

create or replace function public.get_anamnesis_delivery_status(
  p_idempotency_key uuid
)
returns table (
  status text,
  retryable boolean,
  attempts smallint,
  next_attempt_at timestamptz,
  delivered_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'ANAMNESIS_AUTH_REQUIRED';
  end if;
  return query
  select case
           when outbox.status = 'delivered' then 'delivered'
           when outbox.status = 'dead_letter' then 'failed'
           else 'accepted_pending'
         end,
         outbox.status in ('pending', 'retry_wait', 'processing'),
         outbox.attempts,
         outbox.next_attempt_at,
         outbox.delivered_at
    from public.dashboard_outbox as outbox
   where outbox.idempotency_key = p_idempotency_key
     and outbox.user_id = v_user_id;
end;
$$;

create or replace function public.claim_due_dashboard_outbox(
  p_limit integer default 10,
  p_lease_seconds integer default 20
)
returns setof public.dashboard_outbox
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_limit is null or p_lease_seconds is null then
    raise exception using errcode = '22023', message = 'OUTBOX_INVALID_CLAIM_BOUNDS';
  end if;

  update public.dashboard_outbox
     set status = 'dead_letter',
         locked_until = null,
         updated_at = statement_timestamp(),
         last_error_code = coalesce(last_error_code, 'attempts_exhausted')
   where status in ('pending', 'retry_wait', 'processing')
     and attempts >= 5
     and (
       status <> 'processing'
       or locked_until is null
       or locked_until <= statement_timestamp()
     );

  return query
  with due as (
    select outbox.id
      from public.dashboard_outbox as outbox
     where outbox.status in ('pending', 'retry_wait', 'processing')
       and outbox.attempts < 5
       and outbox.next_attempt_at <= statement_timestamp()
       and (
         outbox.status <> 'processing'
         or outbox.locked_until is null
         or outbox.locked_until <= statement_timestamp()
       )
     order by outbox.next_attempt_at, outbox.created_at, outbox.id
     for update skip locked
     limit least(greatest(p_limit, 1), 25)
  ), claimed as (
    update public.dashboard_outbox as outbox
       set status = 'processing',
           attempts = outbox.attempts + 1,
           locked_until = statement_timestamp()
             + make_interval(secs => least(greatest(p_lease_seconds, 5), 30)),
           updated_at = statement_timestamp(),
           last_error_code = null
      from due
     where outbox.id = due.id
    returning outbox.*
  )
  select * from claimed;
end;
$$;

create or replace function public.claim_dashboard_outbox(
  p_correlation_id uuid,
  p_lease_seconds integer default 20
)
returns public.dashboard_outbox
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_item public.dashboard_outbox%rowtype;
begin
  if p_correlation_id is null or p_lease_seconds is null then
    raise exception using errcode = '22023', message = 'OUTBOX_INVALID_CLAIM';
  end if;

  select * into v_item
    from public.dashboard_outbox
   where correlation_id = p_correlation_id
   for update;

  if not found or v_item.status in ('delivered', 'dead_letter') then
    return null;
  end if;
  if v_item.status = 'processing' and v_item.locked_until > statement_timestamp() then
    return null;
  end if;
  if v_item.next_attempt_at > statement_timestamp() then
    return null;
  end if;
  if v_item.attempts >= 5 then
    update public.dashboard_outbox
       set status = 'dead_letter', locked_until = null,
           updated_at = statement_timestamp()
     where id = v_item.id
    returning * into v_item;
    return null;
  end if;

  update public.dashboard_outbox
     set status = 'processing',
         attempts = attempts + 1,
         locked_until = statement_timestamp()
           + make_interval(secs => least(greatest(p_lease_seconds, 5), 30)),
         updated_at = statement_timestamp(),
         last_error_code = null
   where id = v_item.id
  returning * into v_item;
  return v_item;
end;
$$;

create or replace function public.mark_dashboard_outbox_delivered(
  p_correlation_id uuid,
  p_expected_attempt smallint
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_correlation_id is null or p_expected_attempt is null then
    raise exception using errcode = '22023', message = 'OUTBOX_INVALID_DELIVERY_MARK';
  end if;

  update public.dashboard_outbox
     set status = 'delivered', delivered_at = statement_timestamp(),
         locked_until = null, next_attempt_at = statement_timestamp(),
         updated_at = statement_timestamp(), last_error_code = null
   where correlation_id = p_correlation_id
     and status = 'processing'
     and attempts = p_expected_attempt;
  return found;
end;
$$;

create or replace function public.mark_dashboard_outbox_retry(
  p_correlation_id uuid,
  p_expected_attempt smallint,
  p_error_code text,
  p_retry_after_seconds integer
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status text;
begin
  if p_correlation_id is null
     or p_expected_attempt is null
     or p_retry_after_seconds is null then
    raise exception using errcode = '22023', message = 'OUTBOX_INVALID_RETRY_MARK';
  end if;
  if p_error_code !~ '^[a-z0-9_]{1,64}$' then
    raise exception using errcode = '22023', message = 'OUTBOX_INVALID_ERROR_CODE';
  end if;

  update public.dashboard_outbox
     set status = case when attempts >= 5 then 'dead_letter' else 'retry_wait' end,
         next_attempt_at = statement_timestamp()
           + make_interval(secs => least(greatest(p_retry_after_seconds, 5), 300)),
         locked_until = null,
         updated_at = statement_timestamp(),
         last_error_code = p_error_code
   where correlation_id = p_correlation_id
     and status = 'processing'
     and attempts = p_expected_attempt
  returning status into v_status;

  return v_status;
end;
$$;

create or replace function public.prevent_anamnesis_submission_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using errcode = '55000', message = 'ANAMNESIS_SUBMISSION_IMMUTABLE';
end;
$$;

create trigger prevent_anamnesis_submission_mutation
  before update or delete on public.anamnesis_submissions
  for each row execute function public.prevent_anamnesis_submission_mutation();

alter table public.anamnesis_drafts enable row level security;
alter table public.anamnesis_submissions enable row level security;
alter table public.dashboard_outbox enable row level security;

create policy "anamnesis drafts read own"
  on public.anamnesis_drafts for select
  using (user_id = auth.uid());

create policy "anamnesis submissions status read own"
  on public.anamnesis_submissions for select
  using (user_id = auth.uid());

revoke all on public.anamnesis_drafts
  from public, anon, authenticated, service_role;
revoke all on public.anamnesis_submissions
  from public, anon, authenticated, service_role;
revoke all on public.dashboard_outbox
  from public, anon, authenticated, service_role;
grant select on public.anamnesis_drafts to authenticated;
grant select (
  id, draft_id, user_id, schema_version, revision, status,
  idempotency_key, correlation_id, payload_hash, submitted_at, created_at
) on public.anamnesis_submissions to authenticated;
grant select on public.dashboard_outbox to service_role;

revoke all on function public.angela_anamnesis_v1_keys()
  from public, anon, authenticated, service_role;
revoke all on function public.is_valid_angela_anamnesis_multi_answer(jsonb, text, text[], integer, text)
  from public, anon, authenticated, service_role;
revoke all on function public.is_valid_angela_anamnesis_answers(jsonb, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.save_anamnesis_draft(uuid, text, bigint, jsonb, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.submit_anamnesis_draft(uuid, uuid, text, bigint, jsonb, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_anamnesis_delivery_status(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_due_dashboard_outbox(integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_dashboard_outbox(uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.mark_dashboard_outbox_delivered(uuid, smallint)
  from public, anon, authenticated, service_role;
revoke all on function public.mark_dashboard_outbox_retry(uuid, smallint, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.prevent_anamnesis_submission_mutation()
  from public, anon, authenticated, service_role;

grant execute on function public.save_anamnesis_draft(uuid, text, bigint, jsonb, uuid)
  to authenticated;
grant execute on function public.submit_anamnesis_draft(uuid, uuid, text, bigint, jsonb, uuid, text)
  to service_role;
grant execute on function public.get_anamnesis_delivery_status(uuid)
  to authenticated;
grant execute on function public.claim_due_dashboard_outbox(integer, integer)
  to service_role;
grant execute on function public.claim_dashboard_outbox(uuid, integer)
  to service_role;
grant execute on function public.mark_dashboard_outbox_delivered(uuid, smallint)
  to service_role;
grant execute on function public.mark_dashboard_outbox_retry(uuid, smallint, text, integer)
  to service_role;
