import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type QueryType = 'explain' | 'debug' | 'document' | 'review' | 'search' | 'general'

export interface Source {
  file_path: string
  language: string
  content?: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  queryType?: QueryType
  sources?: Source[]
  isStreaming?: boolean
}

export interface Session {
  session_id: string
  repo_name: string
  total_files: number
  total_chunks: number
  languages: Record<string, number>
  file_tree: Record<string, any>
  status: 'indexing' | 'ready' | 'error'
}

interface AppState {
  // Session
  session: Session | null
  setSession: (s: Session | null) => void

  // Messages
  messages: Message[]
  addMessage: (m: Message) => void
  updateMessage: (id: string, updates: Partial<Message>) => void
  clearMessages: () => void

  // UI State
  sidebarOpen: boolean
  setSidebarOpen: (v: boolean) => void
  isIngesting: boolean
  setIsIngesting: (v: boolean) => void
  isQuerying: boolean
  setIsQuerying: (v: boolean) => void

  // Ingestion progress
  ingestProgress: number
  setIngestProgress: (v: number) => void

  // Reset all
  reset: () => void
}

const initialState = {
  session: null,
  messages: [],
  sidebarOpen: true,
  isIngesting: false,
  isQuerying: false,
  ingestProgress: 0,
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      ...initialState,

      setSession: (session) => set({ session }),

      addMessage: (message) =>
        set((state) => ({ messages: [...state.messages, message] })),

      updateMessage: (id, updates) =>
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === id ? { ...m, ...updates } : m
          ),
        })),

      clearMessages: () => set({ messages: [] }),

      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setIsIngesting: (isIngesting) => set({ isIngesting }),
      setIsQuerying: (isQuerying) => set({ isQuerying }),
      setIngestProgress: (ingestProgress) => set({ ingestProgress }),

      reset: () =>
        set({
          ...initialState,
          sidebarOpen: true,
        }),
    }),
    {
      name: 'codemind-store',
      partialize: (state) => ({
        session: state.session,
        messages: state.messages.slice(-100), // persist last 100 messages
        sidebarOpen: state.sidebarOpen,
      }),
    }
  )
)
