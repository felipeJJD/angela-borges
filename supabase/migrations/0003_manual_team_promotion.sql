-- Progressão de team passa a ser MANUAL: só o admin libera o próximo nível
-- (via edge function set_team). A RPC continua registrando conclusões e
-- informa quando todas as fichas do team foram concluídas, mas não promove.

create or replace function public.complete_workout(p_workout_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_team int;
  v_current int;
  v_total int;
  v_done int;
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

  return json_build_object(
    'advanced', false,
    'team_completed', v_done >= v_total,
    'done', v_done,
    'total', v_total
  );
end;
$$;
