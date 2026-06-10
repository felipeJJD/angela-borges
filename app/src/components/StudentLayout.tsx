import { Outlet } from 'react-router-dom'
import { BottomNav } from './BottomNav'

export function StudentLayout() {
  return (
    <div className="mx-auto min-h-[100dvh] max-w-md bg-ink">
      <main className="pb-nav">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
