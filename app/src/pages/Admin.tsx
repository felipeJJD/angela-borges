import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import {
  listStudents,
  createStudent,
  deleteStudent,
  resetPassword,
  setTeam,
  suggestPassword,
  type Student,
} from '../lib/admin'
import { TEAM_LABELS } from '../lib/supabase'
import { relativeDay } from '../lib/dates'
import { useToast } from '../components/Toast'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Sheet } from '../components/Sheet'
import { CopyField } from '../components/CopyField'
import { TeamBadge } from '../components/TeamBadge'
import {
  IconPlus,
  IconSearch,
  IconLogout,
  IconTrash,
  IconKey,
  IconCheck,
} from '../components/icons'

export function Admin() {
  const { signOut, profile } = useAuth()
  const toast = useToast()

  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [detail, setDetail] = useState<Student | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await listStudents()
      setStudents(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar alunas.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Initial fetch of students on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return students
    return students.filter(
      (s) =>
        s.full_name.toLowerCase().includes(q) ||
        (s.email ?? '').toLowerCase().includes(q),
    )
  }, [students, query])

  return (
    <div className="mx-auto min-h-[100dvh] max-w-md bg-ink">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-ink/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <img
            src="/brand/logo-round.jpeg"
            alt=""
            className="h-11 w-11 rounded-full border border-coral/40 object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="text-display text-lg leading-tight text-white">Painel</p>
            <p className="truncate text-xs text-muted">
              {profile?.full_name ?? 'Admin'} · {students.length} alunas
            </p>
          </div>
          <button
            onClick={() => void signOut()}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-muted hover:text-red-300"
            aria-label="Sair"
          >
            <IconLogout className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="relative mt-3">
          <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou e-mail"
            className="h-11 w-full rounded-2xl border border-border bg-surface pl-11 pr-4 text-sm text-white placeholder:text-muted-2 focus:border-coral/50 focus:outline-none focus:ring-2 focus:ring-coral/20"
          />
        </div>
      </header>

      <main className="space-y-2.5 px-4 pb-28 pt-4">
        {loading ? (
          [0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-[72px] rounded-2xl" />
          ))
        ) : error ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <p className="text-muted">{error}</p>
            <Button variant="outline" onClick={() => void load()}>
              Tentar de novo
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <span className="text-4xl">🙅‍♀️</span>
            <p className="text-muted">
              {query ? 'Nenhuma aluna encontrada.' : 'Nenhuma aluna cadastrada ainda.'}
            </p>
            {!query && (
              <Button className="mt-2" onClick={() => setCreateOpen(true)}>
                <IconPlus className="h-5 w-5" />
                Cadastrar primeira aluna
              </Button>
            )}
          </div>
        ) : (
          filtered.map((s) => (
            <button
              key={s.id}
              onClick={() => setDetail(s)}
              className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-left transition-colors hover:bg-surface-2 active:scale-[0.99]"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-coral/15 text-display text-lg text-coral-bright">
                {s.full_name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-white">{s.full_name}</p>
                <p className="truncate text-xs text-muted">{s.email ?? '—'}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <TeamBadge team={s.current_team} size="sm" showLabel={false} />
                  <span className="text-[11px] text-muted-2">
                    {s.workouts_completed} {s.workouts_completed === 1 ? 'ficha' : 'fichas'} · {relativeDay(s.last_checkin)}
                  </span>
                </div>
              </div>
            </button>
          ))
        )}
      </main>

      {/* FAB */}
      <button
        onClick={() => setCreateOpen(true)}
        className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-40 flex h-14 items-center gap-2 rounded-full bg-gradient-to-br from-coral-bright to-coral-deep px-5 font-semibold text-white glow-coral active:scale-95"
      >
        <IconPlus className="h-6 w-6" />
        Nova aluna
      </button>

      <CreateStudentSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false)
          toast.show('Aluna cadastrada! 🎉', 'success')
          void load()
        }}
      />

      {detail && (
        <StudentDetailSheet
          student={detail}
          onClose={() => setDetail(null)}
          onChanged={() => void load()}
        />
      )}
    </div>
  )
}

// ── Create student ───────────────────────────────────
function CreateStudentSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Nova aluna">
      {/* Remount on each open so fields reset cleanly (key driven by parent) */}
      {open && <CreateStudentForm key="create-form" onCreated={onCreated} />}
    </Sheet>
  )
}

function CreateStudentForm({ onCreated }: { onCreated: () => void }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState(() => suggestPassword())
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (!name.trim() || !email.trim() || password.length < 6) {
      toast.show('Preencha nome, e-mail e senha (mín. 6).', 'error')
      return
    }
    setSubmitting(true)
    try {
      await createStudent({
        full_name: name.trim(),
        email: email.trim(),
        password,
      })
      onCreated()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao cadastrar.'
      toast.show(
        msg.toLowerCase().includes('already')
          ? 'Já existe uma conta com esse e-mail.'
          : msg,
        'error',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="space-y-3">
        <Input
          id="c-name"
          label="Nome completo"
          placeholder="Maria Silva"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
        />
        <Input
          id="c-email"
          label="E-mail"
          type="email"
          inputMode="email"
          placeholder="maria@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="off"
        />
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-sm font-medium text-muted">Senha</span>
            <button
              type="button"
              onClick={() => setPassword(suggestPassword())}
              className="text-xs font-medium text-coral-bright hover:underline"
            >
              Gerar outra
            </button>
          </div>
          <CopyField value={password} />
        </div>
      </div>

      <Button
        size="lg"
        full
        className="mt-5"
        loading={submitting}
        onClick={() => void submit()}
      >
        <IconCheck className="h-5 w-5" />
        Cadastrar aluna
      </Button>
    </>
  )
}

// ── Student detail / actions ─────────────────────────
function StudentDetailSheet({
  student,
  onClose,
  onChanged,
}: {
  student: Student
  onClose: () => void
  onChanged: () => void
}) {
  const toast = useToast()
  const [team, setTeamVal] = useState<1 | 2 | 3>(student.current_team)
  const [savingTeam, setSavingTeam] = useState(false)
  const [newPwd, setNewPwd] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const changeTeam = async (t: 1 | 2 | 3) => {
    setTeamVal(t)
    if (t === student.current_team) return
    setSavingTeam(true)
    try {
      await setTeam(student.id, t)
      toast.show(`Movida para o Team ${t}.`, 'success')
      onChanged()
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Erro ao mudar o team.', 'error')
      setTeamVal(student.current_team)
    } finally {
      setSavingTeam(false)
    }
  }

  const doReset = async () => {
    setResetting(true)
    const pwd = suggestPassword()
    try {
      await resetPassword(student.id, pwd)
      setNewPwd(pwd)
      toast.show('Senha redefinida. Copie e envie para a aluna.', 'success')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Erro ao resetar senha.', 'error')
    } finally {
      setResetting(false)
    }
  }

  const doDelete = async () => {
    setDeleting(true)
    try {
      await deleteStudent(student.id)
      toast.show('Aluna excluída.', 'info')
      onChanged()
      onClose()
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Erro ao excluir.', 'error')
      setDeleting(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title={student.full_name}>
      <p className="-mt-2 mb-4 text-sm text-muted">{student.email ?? '—'}</p>

      {/* Team selector */}
      <div className="mb-5">
        <span className="mb-2 block text-sm font-medium text-muted">Nível (Team)</span>
        <div className="grid grid-cols-3 gap-2">
          {([1, 2, 3] as const).map((t) => (
            <button
              key={t}
              disabled={savingTeam}
              onClick={() => void changeTeam(t)}
              className={`rounded-2xl border py-3 text-center transition-all disabled:opacity-60 ${
                team === t
                  ? 'border-coral/60 bg-coral/15 text-coral-bright'
                  : 'border-border bg-surface text-muted hover:bg-surface-2'
              }`}
            >
              <span className="block text-display text-lg leading-none">Team {t}</span>
              <span className="text-[11px]">{TEAM_LABELS[t]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Reset password */}
      <div className="mb-5 space-y-2.5">
        {newPwd ? (
          <CopyField label="Nova senha (copie e envie)" value={newPwd} />
        ) : (
          <Button
            variant="ghost"
            full
            loading={resetting}
            onClick={() => void doReset()}
          >
            <IconKey className="h-5 w-5" />
            Resetar senha
          </Button>
        )}
      </div>

      {/* Delete */}
      {confirmDelete ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm text-red-200">
            Tem certeza? Isso exclui a conta de <b>{student.full_name}</b> e todo o
            progresso. Não dá pra desfazer.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              variant="outline"
              full
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              full
              loading={deleting}
              onClick={() => void doDelete()}
            >
              Excluir mesmo
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="ghost"
          full
          onClick={() => setConfirmDelete(true)}
          className="text-red-300"
        >
          <IconTrash className="h-5 w-5" />
          Excluir aluna
        </Button>
      )}
    </Sheet>
  )
}
