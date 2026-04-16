import { create } from 'zustand'

interface UiState {
  sidebarOpen: boolean
  filter: string
  toggleSidebar: () => void
  setFilter: (q: string) => void
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: true,
  filter: '',
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setFilter: (q: string) => set({ filter: q }),
}))
