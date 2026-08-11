-- Ordinary optimistic-concurrency conflicts are application conflicts, not
-- PostgreSQL serialization failures. PT409 lets PostgREST return HTTP 409
-- without triggering retry handling reserved for SQLSTATE class 40.

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
        errcode = 'PT409',
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
      errcode = 'PT409',
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
      errcode = 'PT409',
      message = 'ANAMNESIS_REVISION_CONFLICT',
      detail = format('actual_revision=%s', v_draft.revision);
  end if;
  if v_draft.answers is distinct from p_expected_answers then
    raise exception using errcode = 'PT409', message = 'ANAMNESIS_ANSWERS_CONFLICT';
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

revoke all on function public.save_anamnesis_draft(uuid, text, bigint, jsonb, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.submit_anamnesis_draft(uuid, uuid, text, bigint, jsonb, uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function public.save_anamnesis_draft(uuid, text, bigint, jsonb, uuid)
  to authenticated;
grant execute on function public.submit_anamnesis_draft(uuid, uuid, text, bigint, jsonb, uuid, text)
  to service_role;
