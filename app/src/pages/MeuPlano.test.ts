import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { AngelaPersonalizedPlanState } from '../features/personalized-plan/AngelaPersonalizedPlan'
import { MeuPlanoView } from './MeuPlano'

function render(state: AngelaPersonalizedPlanState, online = true): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ['/meu-plano'] },
      createElement(MeuPlanoView, {
        state,
        online,
        reloading: false,
        onReload: vi.fn(),
      }),
    ),
  )
}

describe('Meu Plano observable states', () => {
  it('sends a student without submitted anamnesis to the real anamnesis flow', () => {
    const html = render({ kind: 'empty' })
    expect(html).toContain('Seu plano começa pela anamnese')
    expect(html).toContain('Responder anamnese')
    expect(html).toContain('href="/anamnese"')
  })

  it('shows an honest atomic building state without fixture or ETA', () => {
    const html = render({
      kind: 'building',
      submittedAt: '2026-08-03T17:00:00.000Z',
      deliveryStatus: 'delivered',
    })
    expect(html).toContain('Estamos montando seu plano')
    expect(html).toContain('Dieta e treino serão publicados juntos')
    expect(html).toContain('Atualizar status')
    expect(html).not.toMatch(/minutos|amanhã|em breve às/i)
  })

  it('does not claim a session-cached version while offline without a publication', () => {
    const html = render({ kind: 'empty' }, false)
    expect(html).toContain('Não podemos confirmar o status')
    expect(html).not.toContain('carregada nesta sessão')
  })

  it('shows a recoverable failure instead of a simulated plan', () => {
    const html = render({
      kind: 'failed',
      reason: 'unavailable',
      retryable: true,
    })
    expect(html).toContain('Não conseguimos confirmar seu plano')
    expect(html).toContain('Tentar novamente')
  })

  it('shows a safe terminal pipeline failure without retry or anamnesis CTA', () => {
    const html = render({
      kind: 'failed',
      reason: 'pipeline-failed',
      code: 'plan_generation_failed',
      retryable: false,
    })
    expect(html).toContain('Seu plano precisa de revisão')
    expect(html).toContain('Nossa equipe precisa revisar o processamento')
    expect(html).not.toContain('Tentar novamente')
    expect(html).not.toContain('Revisar anamnese')
    expect(html).not.toContain('href="/anamnese"')
    expect(html).not.toContain('plan_generation_failed')
  })

  it('renders diet and training from the same published version with safe metadata', () => {
    const html = render(
      {
        kind: 'published',
        plan: {
          planVersionId: '33333333-3333-4333-8333-333333333333',
          userId: '22222222-2222-4222-8222-222222222222',
          protocolId: '11111111-1111-4111-8111-111111111111',
          protocolVersion: 3,
          schemaVersion: 'angela-plan.v1',
          snapshotHash:
            'fa3af851c7b7929761867755f5850b89ec17e601f356b17caac1e0b7edbb2008',
          state: 'active',
          diet: {
            notes: 'Evite bebidas durante as refeições.',
            meals: [
              {
                name: 'Almoço',
                time: '12:00',
                foods: [
                  {
                    name: 'Arroz',
                    quantity: 100,
                    unit: 'g',
                    substitutions: ['Batata-doce', 'Mandioca'],
                  },
                ],
              },
            ],
          },
          training: {
            notes: 'Priorize a execução controlada.',
            days: [
              {
                name: 'Treino A',
                day_label: 'Dia 1',
                warmup: 'Mobilidade de quadril por 5 minutos.',
                cooldown: 'Alongamento leve por 3 minutos.',
                exercises: [
                  {
                    name: 'Agachamento',
                    sets: 3,
                    reps: '12',
                    rest_seconds: 75,
                    notes: 'Mantenha os joelhos alinhados.',
                    video_url: 'https://www.youtube.com/watch?v=tuwHzzPdaGc',
                    substitutions: ['Leg press', 'Agachamento goblet'],
                  },
                ],
              },
            ],
          },
          generationMetadata: {
            catalogVersion: 'consultoria-open-catalog.2026-07-20',
            engineVersion: 'angela-consultoria-engine.v1',
            promptVersion: 'angela-consultoria-prompts.v1',
            ragVersion: 'consultoria-open-rag-node.v1',
            schemaVersion: 'angela-protocol-draft.v1',
          },
          counts: { dietMeals: 1, trainingDays: 1, trainingExercises: 1 },
          stagedAt: '2026-08-03T18:00:00.000Z',
          activatedAt: '2026-08-03T18:05:00.000Z',
          createdAt: '2026-08-03T18:00:00.000Z',
          updatedAt: '2026-08-03T18:05:00.000Z',
        },
      },
      false,
    )

    expect(html).toContain('Plano publicado')
    expect(html).toContain('Versão 3')
    expect(html).toContain('1 refeição')
    expect(html).toContain('1 dia')
    expect(html).toContain('1 exercício')
    expect(html).toContain('Almoço')
    expect(html).toContain('Arroz')
    expect(html).toContain('Evite bebidas durante as refeições.')
    expect(html).toContain('Substituições: Batata-doce, Mandioca')
    expect(html).toContain('Treino A')
    expect(html).toContain('Agachamento')
    expect(html).toContain('Priorize a execução controlada.')
    expect(html).toContain('Aquecimento:')
    expect(html).toContain('Mobilidade de quadril por 5 minutos.')
    expect(html).toContain('Desaquecimento:')
    expect(html).toContain('Alongamento leve por 3 minutos.')
    expect(html).toContain('Descanso: 75 segundos')
    expect(html).toContain('Mantenha os joelhos alinhados.')
    expect(html).toContain('Substituições: Leg press, Agachamento goblet')
    expect(html).toContain('Assistir vídeo')
    expect(html).toContain(
      'href="https://www.youtube.com/watch?v=tuwHzzPdaGc"',
    )
    expect(html).toContain('target="_blank"')
    expect(html).toContain('carregada nesta sessão')
    expect(html).not.toContain('qualityWarnings')
  })
})
