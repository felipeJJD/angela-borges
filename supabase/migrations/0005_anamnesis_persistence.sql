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

create or replace function public.is_valid_angela_anamnesis_answers(
  p_answers jsonb,
  p_require_complete boolean
)
returns boolean
language plpgsql
immutable
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

  if p_answers ? 'birth_date'
     and jsonb_typeof(p_answers -> 'birth_date') is distinct from 'string' then
    return false;
  end if;
  if p_answers ? 'height_cm' then
    if jsonb_typeof(p_answers -> 'height_cm') is distinct from 'number'
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

  if exists (
    select 1
      from unnest(array[
        'nutrition_goal', 'nutrition_challenge', 'sleep_quality',
        'water_intake', 'emotional_eating', 'meal_preparation', 'food_budget',
        'training_experience_level', 'training_days_per_week',
        'training_location', 'injuries_or_limitations', 'conditioning_level',
        'training_background', 'training_barrier'
      ]) as scalar_keys(scalar_key)
     where p_answers ? scalar_key
       and jsonb_typeof(p_answers -> scalar_key) is distinct from 'string'
  ) then
    return false;
  end if;

  if exists (
    select 1
      from unnest(array[
        'meal_routine', 'dietary_restrictions', 'health_history',
        'planned_supplements', 'sweet_craving_times', 'disliked_foods',
        'preferred_exercises', 'training_focus_areas'
      ]) as multi_keys(multi_key)
     where p_answers ? multi_key
       and jsonb_typeof(p_answers -> multi_key) is distinct from 'array'
  ) then
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
  p_draft_id uuid,
  p_schema_version text,
  p_expected_revision bigint,
  p_idempotency_key uuid
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
  v_user_id uuid := auth.uid();
  v_draft public.anamnesis_drafts%rowtype;
  v_submission public.anamnesis_submissions%rowtype;
  v_now timestamptz;
  v_hash text;
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

  perform 1 from public.profiles where public.profiles.id = v_user_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'ANAMNESIS_PROFILE_REQUIRED';
  end if;

  -- Duplicate delivery replays the one immutable logical submission, even
  -- when the caller still holds the pre-submit expected revision.
  select * into v_submission
    from public.anamnesis_submissions
   where public.anamnesis_submissions.idempotency_key = p_idempotency_key
   for share;
  if found then
    if v_submission.user_id <> v_user_id or v_submission.draft_id <> p_draft_id then
      raise exception using errcode = '42501', message = 'ANAMNESIS_SCOPE_MISMATCH';
    end if;
    select * into v_draft
      from public.anamnesis_drafts
     where public.anamnesis_drafts.id = p_draft_id
       and public.anamnesis_drafts.user_id = v_user_id;
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
     and public.anamnesis_drafts.user_id = v_user_id
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
  if not public.is_valid_angela_anamnesis_answers(v_draft.answers, true) then
    raise exception using errcode = '22023', message = 'ANAMNESIS_INCOMPLETE';
  end if;

  v_now := statement_timestamp();
  v_hash := encode(
    digest(
      convert_to(
        jsonb_build_object(
          'schema_version', v_draft.schema_version,
          'answers', v_draft.answers
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

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
    v_draft.id, v_hash, v_now
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
    v_submission.payload_hash
  );

  return query select
    v_draft.id, v_draft.user_id, v_draft.schema_version, v_draft.revision,
    v_draft.status, v_draft.answers, v_draft.created_at, v_draft.updated_at,
    v_draft.submitted_at, v_draft.idempotency_key,
    v_submission.correlation_id, v_submission.payload_hash, false;
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
revoke all on function public.is_valid_angela_anamnesis_answers(jsonb, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.save_anamnesis_draft(uuid, text, bigint, jsonb, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.submit_anamnesis_draft(uuid, text, bigint, uuid)
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
grant execute on function public.submit_anamnesis_draft(uuid, text, bigint, uuid)
  to authenticated;
grant execute on function public.claim_dashboard_outbox(uuid, integer)
  to service_role;
grant execute on function public.mark_dashboard_outbox_delivered(uuid, smallint)
  to service_role;
grant execute on function public.mark_dashboard_outbox_retry(uuid, smallint, text, integer)
  to service_role;
