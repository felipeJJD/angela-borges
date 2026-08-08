export type AnamnesisAccessStatus = 'required' | 'completed'
export type AnamnesisGateState = 'checking' | AnamnesisAccessStatus | 'error'

export interface SubmittedAnamnesisSource {
  readLatestAnamnesisSubmission(userId: string): Promise<unknown | null>
}
export type AnamnesisGateDecision =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'redirect'; to: '/anamnese' }>
  | Readonly<{ kind: 'allow' }>
  | Readonly<{ kind: 'error' }>

export async function loadAnamnesisAccess(
  source: SubmittedAnamnesisSource,
  userId: string,
): Promise<AnamnesisAccessStatus> {
  if (!userId.trim()) throw new Error('Authenticated user id is required')
  const submission = await source.readLatestAnamnesisSubmission(userId)
  return submission === null ? 'required' : 'completed'
}

export function resolveAnamnesisGate(
  state: AnamnesisGateState,
): AnamnesisGateDecision {
  if (state === 'checking') return { kind: 'loading' }
  if (state === 'required') return { kind: 'redirect', to: '/anamnese' }
  if (state === 'completed') return { kind: 'allow' }
  return { kind: 'error' }
}
