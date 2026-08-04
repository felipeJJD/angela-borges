import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { ToastProvider } from './components/Toast'
import { RequireStudent, RequireAdmin } from './components/Guards'
import { StudentLayout } from './components/StudentLayout'
import { FullScreenLoader } from './components/Spinner'
import { Login } from './pages/Login'
import { Home } from './pages/Home'
import { Treinos } from './pages/Treinos'
import { Perfil } from './pages/Perfil'
import { Admin } from './pages/Admin'

// PDF viewer pulls in pdfjs (~900KB) — load it only when a ficha is opened.
const TreinoViewer = lazy(() =>
  import('./pages/TreinoViewer').then((m) => ({ default: m.TreinoViewer })),
)
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
              <Route path="/treinos" element={<Treinos />} />
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

            {/* PDF viewer — fullscreen, no bottom nav */}
            <Route
              path="/treino/:id"
              element={
                <RequireStudent>
                  <Suspense fallback={<FullScreenLoader label="Abrindo ficha…" />}>
                    <TreinoViewer />
                  </Suspense>
                </RequireStudent>
              }
            />

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
