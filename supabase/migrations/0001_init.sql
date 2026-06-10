-- Angela Borges PWA — schema inicial
create extension if not exists pgcrypto;

-- ===== Tabelas =====
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'aluna' check (role in ('admin','aluna')),
  current_team int not null default 1 check (current_team between 1 and 3),
  created_at timestamptz not null default now()
);

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  team int not null check (team between 1 and 3),
  title text not null,
  pdf_path text not null,
  sort_order int not null,
  unique (team, sort_order)
);

-- Check-in diário: a aluna marca o treino que fez no dia (1 por dia)
create table public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  workout_id uuid not null references public.workouts(id) on delete cascade,
  done_on date not null default ((now() at time zone 'America/Sao_Paulo'))::date,
  created_at timestamptz not null default now(),
  unique (user_id, done_on)
);

-- Ficha concluída (libera a próxima; todas do team → sobe de team)
create table public.workout_completions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  workout_id uuid not null references public.workouts(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, workout_id)
);

-- ===== Helpers =====
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Perfil automático ao criar usuário (metadata: full_name, role)
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'aluna')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Concluir ficha + progressão automática de team
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
  select current_team into v_current from public.profiles where id = auth.uid();
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

-- ===== RLS =====
alter table public.profiles enable row level security;
alter table public.workouts enable row level security;
alter table public.daily_checkins enable row level security;
alter table public.workout_completions enable row level security;

create policy "own profile select" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "admin profile update" on public.profiles for update using (public.is_admin());
create policy "admin profile delete" on public.profiles for delete using (public.is_admin());

create policy "workouts read" on public.workouts for select using (auth.role() = 'authenticated');
create policy "workouts admin write" on public.workouts for all using (public.is_admin());

create policy "checkins own" on public.daily_checkins for select using (user_id = auth.uid() or public.is_admin());
create policy "checkins insert own" on public.daily_checkins for insert with check (user_id = auth.uid());
create policy "checkins delete own" on public.daily_checkins for delete using (user_id = auth.uid());

create policy "completions own" on public.workout_completions for select using (user_id = auth.uid() or public.is_admin());
create policy "completions insert own" on public.workout_completions for insert with check (user_id = auth.uid());

-- ===== Storage: bucket privado de PDFs =====
insert into storage.buckets (id, name, public)
values ('treinos', 'treinos', false)
on conflict (id) do nothing;

create policy "treinos read auth" on storage.objects
  for select using (bucket_id = 'treinos' and auth.role() = 'authenticated');
