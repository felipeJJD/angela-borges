# Comunidade Angela Borges — PWA de Treinos

PWA mobile-first para as alunas da Comunidade Angela Borges. Login, treinos semanais em PDF,
check-in diário, conclusão de fichas com progressão Team 1 → 2 → 3 liberada pelo admin, e painel
administrativo para gestão das alunas. Visual dark + coral, identidade da marca.

## Stack

- **Frontend:** Vite + React 19 + TypeScript + Tailwind v4 + vite-plugin-pwa
- **PDF:** react-pdf (links de vídeo dos exercícios clicáveis)
- **Backend:** Supabase (Auth, Postgres + RLS, Storage privado, Edge Function)
- **Projeto Supabase:** `avkmryapdiwsgwbvgkwe`

## Estrutura

```
app/                      PWA (Vite). cd app && npm install && npm run dev
supabase/
  migrations/
    0001_init.sql         schema, RLS, RPC complete_workout, trigger, bucket
    0002_security_fixes.sql  hardening (conclusão só via RPC, storage gated por team)
    0003_manual_team_promotion.sql  progressão de team manual (só admin libera)
    0004_workout_plans.sql  planos estruturados (jsonb) com RLS por team
  functions/admin-users/  edge function de gestão (create/delete/reset/set_team/list)
scripts/setup_db.py       upload dos PDFs + seed workouts + cria admin
scripts/extract_plans.py  extração one-time dos PDFs -> scripts/plans/*.json
scripts/seed_plans.py     upsert dos planos em workout_plans
scripts/plans/            fonte revisável dos planos extraídos (1 json por ficha)
```

## Modelo de dados

- `profiles` — id (→ auth.users), full_name, role (admin|aluna), current_team (1-3)
- `workouts` — 34 fichas: Team 1 (12), Team 2 (7), Team 3 (15). Cada ficha = PDF da semana.
- `daily_checkins` — 1 check-in por dia (unique user_id + done_on)
- `workout_completions` — fichas concluídas; escrita **só** via RPC `complete_workout`
- `workout_plans` — plano estruturado (jsonb: dias → exercícios com séries/reps/descanso/observação/vídeos) extraído dos PDFs; leitura gated por team (mesma regra do storage)
- RPC `complete_workout(p_workout_id)` — marca concluída e sinaliza `team_completed`; a subida de team é **manual, só pelo admin** (via edge function `set_team`)

## Funcionalidades

**Aluna:** semana atual com check-ins, marcar treino do dia, abrir ficha nativa (dias da
semana em chips, cards de exercício com séries/reps/descanso/observações e player de
YouTube embutido; "Ver PDF" como opção), concluir ficha, celebração ao completar todas
as fichas do nível (admin libera o próximo), perfil.

**Admin:** lista de alunas (team, fichas, último check-in), criar conta, mudar team,
resetar senha, excluir aluna.

## Segurança

- Signup público **desabilitado** — contas criadas só pelo admin via edge function.
- Trigger força `role='aluna'` (admin é promovido manualmente via SQL).
- Conclusão de ficha só pela RPC com gate de team; insert direto bloqueado por RLS.
- Storage de PDFs liberado apenas para o team atual da aluna (ou admin).

## Rodar local

```bash
cd app
npm install
npm run dev      # http://localhost:5173
npm run build    # bundle de produção em dist/
```

O `app/.env` já vem versionado com `VITE_SUPABASE_URL` e a `VITE_SUPABASE_ANON_KEY`
(chaves **públicas** — o acesso é protegido por RLS no Supabase), então é só clonar,
`npm install` e `npm run dev`. Não precisa configurar nada.

> A `service_role` key NUNCA está no repositório. Só URL + anon key, que já são
> expostas no JS de qualquer app Supabase.
