-- Fixes da revisão adversarial (2026-06-10)

-- #2: conclusão de ficha SÓ via RPC (security definer) — sem insert direto
drop policy "completions insert own" on public.workout_completions;

-- #3: serializa a progressão por usuária (lock no profile)
create or replace function public.complete_workout(p_workout_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_team int;
  v_current int;
  v_total int;
  v_done int;
  v_advanced boolean := false;
begin
  select team into v_team from public.workouts where id = p_workout_id;
  select current_team into v_current from public.profiles where id = auth.uid() for update;
  if v_team is null or v_current is null then
    raise exception 'workout ou perfil não encontrado';
  end if;
  if v_team > v_current then
    raise exception 'ficha de team superior ao atual';
  end if;

  insert into public.workout_completions (user_id, workout_id)
  values (auth.uid(), p_workout_id)
  on conflict do nothing;

  select count(*) into v_total from public.workouts where team = v_current;
  select count(*) into v_done
    from public.workout_completions wc
    join public.workouts w on w.id = wc.workout_id and w.team = v_current
   where wc.user_id = auth.uid();

  if v_done >= v_total and v_current < 3 then
    update public.profiles set current_team = v_current + 1 where id = auth.uid();
    v_advanced := true;
  end if;

  return json_build_object('advanced', v_advanced, 'done', v_done, 'total', v_total);
end;
$$;

-- #12: PDF só do team atual pra baixo (admin vê tudo)
drop policy "treinos read auth" on storage.objects;
create policy "treinos read by team" on storage.objects
  for select using (
    bucket_id = 'treinos' and (
      public.is_admin() or
      nullif(split_part(split_part(name, '/', 1), '-', 2), '')::int
        <= (select current_team from public.profiles where id = auth.uid())
    )
  );
