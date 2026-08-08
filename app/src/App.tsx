import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { ToastProvider } from './components/Toast'
import { RequireStudent, RequireAdmin } from './components/Guards'
import { StudentLayout } from './components/StudentLayout'
import { FullScreenLoader } from './components/Spinner'
import { Login } from './pages/Login'
import { Home } from './pages/Home'
import { Perfil } from './pages/Perfil'
import { Admin } from './pages/Admin'

const Anamnese = lazy(() =>
  import('./pages/Anamnese').then((m) => ({ default: m.Anamnese })),
)
const MeuPlano = lazy(() =>
  import('./pages/MeuPlanoPage').then((m) => ({ default: m.MeuPlanoPage })),
)

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<Login />} />

            {/* Student area (bottom nav) */}
            <Route
              element={
                <RequireStudent>
                  <StudentLayout />
                </RequireStudent>
              }
            >
              <Route path="/" element={<Home />} />
              <Route path="/meu-plano" element={<Navigate to="/dieta" replace />} />
              <Route
                path="/dieta"
                element={
                  <Suspense fallback={<FullScreenLoader label="Abrindo sua dieta…" />}>
                    <MeuPlano section="diet" />
                  </Suspense>
                }
              />
              <Route
                path="/treino"
                element={
                  <Suspense fallback={<FullScreenLoader label="Abrindo seu treino…" />}>
                    <MeuPlano section="training" />
                  </Suspense>
                }
              />
              <Route path="/treinos" element={<Navigate to="/treino" replace />} />
              <Route
                path="/anamnese"
                element={
                  <Suspense fallback={<FullScreenLoader label="Abrindo anamnese…" />}>
                    <Anamnese />
                  </Suspense>
                }
              />
              <Route path="/perfil" element={<Perfil />} />
            </Route>

            <Route path="/treino/:id" element={<Navigate to="/treino" replace />} />

            {/* Admin */}
            <Route
              path="/admin"
              element={
                <RequireAdmin>
                  <Admin />
                </RequireAdmin>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
