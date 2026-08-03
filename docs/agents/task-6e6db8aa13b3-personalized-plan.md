# Angela PWA — entrega atômica de Meu Plano

## Resultado

Este corte implementa os tickets #15 e a metade PWA dos #12/#14 sem tocar
ambientes vivos, `dashboard-caos` ou `angela-worker`. A rota autenticada
`/meu-plano` virou a entrada primária do protocolo personalizado e só renderiza
uma linha `active` completa; dieta e treino vêm obrigatoriamente do mesmo
snapshot versionado. A rota `/treinos` permanece como **Biblioteca**, com as 34
fichas, os Team Locks, check-ins, completions e rotas legadas preservados.

## Contrato cross-runtime congelado

O `snapshot_hash` é SHA-256 do JSON canônico com chaves recursivamente em ordem
lexical do objeto exato abaixo, sem estado ou timestamps:

```text
{user_id,protocol_id,protocol_version,schema_version,diet,training,generation_metadata}
```

Os testes PWA copiam sem variante independente a fixture da Dashboard em
`app/src/features/personalized-plan/fixtures/angela-plan-hash.contract.json`.
Ela preserva o `canonical_json` compartilhado e o SHA-256
`fa3af851c7b7929761867755f5850b89ec17e601f356b17caac1e0b7edbb2008`.
O arquivo copiado é byte a byte idêntico ao da Dashboard (SHA-256 do arquivo
`4b7ddeaeaf1967575199d0588b914852b34d246e2d13fa799c83afcd6a5d223e`).
O SQL não recalcula o hash: preserva o hash esperado e torna imutável a dupla
payload/hash; a Dashboard deve recalcular o readback antes de ativar. O PWA
também serializa o snapshot pelo mesmo algoritmo lexical e calcula SHA-256 com
Web Crypto antes de liberar o estado `published`.

As assinaturas RPC são exatamente:

```sql
stage_angela_plan(p_user_id,p_protocol_id,p_protocol_version,p_schema_version,p_snapshot_hash,p_diet,p_training,p_generation_metadata)
read_angela_plan_delivery(p_user_id,p_protocol_id,p_protocol_version)
activate_angela_plan(p_user_id,p_protocol_id,p_protocol_version,p_snapshot_hash)
```

As três RPCs são executáveis somente pelo papel privilegiado do backend. O PWA
não chama essas RPCs nem contém credencial privilegiada; ele lê diretamente uma
única linha ativa sob RLS autenticada.

### Readback exato

Ausência:

```json
{"found":false}
```

Versão encontrada:

```json
{
  "found": true,
  "plan_version_id": "uuid",
  "state": "staged|active|superseded",
  "user_id": "uuid",
  "protocol_id": "uuid",
  "protocol_version": 1,
  "schema_version": "angela-plan.v1",
  "diet": {},
  "training": {},
  "generation_metadata": {},
  "snapshot_hash": "sha256-lowercase-hex",
  "counts": {
    "diet_meals": 0,
    "training_days": 0,
    "training_exercises": 0
  }
}
```

`stage_angela_plan` e `activate_angela_plan` envolvem esse objeto como
`{"replayed": boolean, "delivery": <readback>}`. Staging idêntico é replay;
staging da mesma chave com qualquer diferença de schema, hash, dieta, treino ou
metadados falha com `ANGELA_PLAN_STAGE_CONFLICT`. Ativação confere o hash e
supersede a ativa anterior na mesma transação. Replay de uma versão antiga já
supersedida retorna `replayed=true` e `delivery.state="superseded"`, sem reativar
nem substituir a versão ativa mais nova.

Cada insert recebe um `delivery_sequence` identity interno, ausente do hash, do
readback e dos grants do PWA. Sob o lock da profile, ativar a sequência mais nova
terminaliza todas as sequências antigas `active|staged`; uma ativação atrasada
de uma staged antiga devolve replay superseded e não altera a ativa nova. O
insert também converge em `unique_violation`: relê a tupla e só aceita replay
se schema, hash e todos os payloads forem idênticos. As RPCs `SECURITY DEFINER`
usam somente `pg_catalog` no `search_path` e referências públicas qualificadas.

## Frontend

O módulo profundo `AngelaPersonalizedPlan` expõe apenas `load()` sobre um port de
leitura autenticada. O adapter Supabase consulta uma única row de
`angela_personalized_plans`, a última submissão real da anamnese e o status de
entrega já existente. O módulo valida dono, versão, estrutura completa, hash
canônico calculado no runtime, metadados seguros e timestamps antes de liberar `published`; qualquer row
parcial ou de outra conta falha fechada.

Estados observáveis:

- `empty`: chama o fluxo real em `/anamnese`;
- `building`: não promete ETA, faz polling limitado (8 tentativas a cada 15 s),
  oferece refresh manual e explica que dieta/treino serão publicados juntos;
- `failed`: não fabrica fixture e oferece retry somente quando honesto;
- `published`: mostra dieta e treino da mesma row, counts e metadados seguros;
- offline: só menciona versão carregada na sessão quando há publicação; estados
  vazio/montando/falhou dizem apenas que o status não pode ser confirmado.

Login de aluna, fallback de rota e `start_url` do PWA apontam para
`/meu-plano`. `/`, `/treinos`, `/treino/:id`, `/anamnese` e `/perfil` continuam
existindo; o Início legado preserva check-ins e progresso. A conclusão da
anamnese agora leva a `Ver meu plano` em `/meu-plano`.

## Evidência TDD e gates

RED observado antes da implementação:

- seis asserções falharam pela ausência de `0006_personalized_plans.sql`;
- o módulo profundo e a página falharam por imports inexistentes;
- sentinelas falharam pela ausência de `/meu-plano` e do adapter;
- o redirect autenticado ainda devolvia `/` em vez de `/meu-plano`.

GREEN:

- `npm test`: 21 arquivos, 103 testes aprovados;
- `npm run lint`: aprovado;
- `npm run build`: aprovado, inclusive geração do service worker PWA;
- PostgreSQL 17 descartável: migration + teste comportamental aprovados com
  staging, replay, conflito, incompletude, hash mismatch, readback/counts,
  ativação, fence `staged-old → activate-new → delayed activate-old`,
  supersedência, replay terminal, RPCs sob `service_role`, negação direta a
  `authenticated` e RLS entre duas contas sintéticas;
- `git diff --check`: aprovado;
- scans de segredo, PII e contratos estrangeiros: aprovados sem conteúdo bruto;
- TestSprite CLI 0.4.0 e autenticação: preflight aprovado; execução pendente
  porque este worktree não possui URL implantada. Nenhum localhost foi enviado.

## Arquivos principais

- `supabase/migrations/0006_personalized_plans.sql`
- `supabase/tests/0006_personalized_plans_test.sql`
- `supabase/tests/bootstrap_personalized_plans.sql`
- `app/src/features/personalized-plan/AngelaPersonalizedPlan.ts`
- `app/src/features/personalized-plan/AngelaPlanRefreshPolicy.ts`
- `app/src/features/personalized-plan/SupabaseAngelaPlanDeliverySource.ts`
- `app/src/features/personalized-plan/useAngelaPersonalizedPlan.ts`
- `app/src/pages/MeuPlano.tsx`
- `app/src/pages/MeuPlanoPage.tsx`
- `app/src/pages/Anamnese.tsx`
- `app/src/App.tsx`
- `app/src/components/BottomNav.tsx`
- `app/src/pages/Treinos.tsx`

## Riscos e próximos gates

- A migration foi exercitada apenas em PostgreSQL descartável e não foi aplicada
  a nenhum Supabase vivo.
- A Dashboard precisa aceitar `superseded` como readback terminal não publicável
  em replays antigos; o coordenador confirmou esse alinhamento fora deste
  worktree.
- TestSprite permanece pendente até existir uma URL implantada com este commit.
- Não houve device smoke ou QA visual em navegador implantado; testes SSR,
  lint, TypeScript e build cobrem o corte local.
- `npm ci` reportou o baseline do lockfile com 1 vulnerabilidade moderada e 4
  altas; atualização de dependências não pertence a estes tickets.
