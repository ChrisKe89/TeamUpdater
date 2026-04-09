import { createContext, useContext, type ReactNode } from 'react'
import { useSyncRuntime, type SyncRuntimeState, type SyncRuntimeActions } from '../hooks/useSyncRuntime'

export type SyncRuntimeContextValue = SyncRuntimeState & SyncRuntimeActions

export const SyncRuntimeContext = createContext<SyncRuntimeContextValue | null>(null)

export function SyncRuntimeProvider({ children }: { children: ReactNode }) {
  const runtime = useSyncRuntime()
  return <SyncRuntimeContext.Provider value={runtime}>{children}</SyncRuntimeContext.Provider>
}

export function useSyncRuntimeContext(): SyncRuntimeContextValue {
  const ctx = useContext(SyncRuntimeContext)
  if (!ctx) throw new Error('useSyncRuntimeContext must be used within SyncRuntimeProvider')
  return ctx
}
