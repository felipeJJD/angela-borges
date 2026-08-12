import { Outlet } from 'react-router-dom'
import { BottomNav } from './BottomNav'

export function StudentLayout() {
  return (
    <div className="student-shell relative isolate mx-auto min-h-[100dvh] max-w-md overflow-x-hidden bg-ink">
      <main className="relative z-10 pb-nav">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
