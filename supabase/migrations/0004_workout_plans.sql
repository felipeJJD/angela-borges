-- Plano estruturado extraído dos PDFs (dias, exercícios, séries, vídeos).
-- Conteúdo gated por team (espelha a policy de storage da 0002): NÃO pode ir
-- na tabela workouts, que é legível por todas as alunas autenticadas.
create table public.workout_plans (
  workout_id uuid primary key references public.workouts(id) on delete cascade,
  plan jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.workout_plans enable row level security;

create policy "plans read by team" on public.workout_plans
  for select using (
    public.is_admin() or exists (
      select 1 from public.workouts w
      where w.id = workout_id
        and w.team <= (select current_team from public.profiles where id = auth.uid())
    )
  );

create policy "plans admin write" on public.workout_plans
  for all using (public.is_admin()) with check (public.is_admin());
