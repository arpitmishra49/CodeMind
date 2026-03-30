import React from 'react'
import { PanelLeft, Cpu, Wifi, WifiOff, Trash2, RotateCcw } from 'lucide-react'
import { motion } from 'framer-motion'
import { useStore } from '@/store'
import { clearHistory } from '@/services/api'
import toast from 'react-hot-toast'

interface Props {
  isHealthy: boolean | null
}

export default function Header({ isHealthy }: Props) {
  const { sidebarOpen, setSidebarOpen, session, clearMessages } = useStore()

  const handleClearChat = async () => {
    if (!session) return
    try {
      await clearHistory(session.session_id)
      clearMessages()
      toast.success('Chat history cleared')
    } catch {
      clearMessages()
    }
  }

  return (
    <header className="h-14 border-b border-border bg-surface/90 backdrop-blur-xl flex items-center px-4 gap-4 shrink-0 z-10">
      {/* Sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="btn-ghost p-2 -ml-1"
        title="Toggle sidebar"
      >
        <PanelLeft size={16} />
      </button>

      {/* Title */}
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <div className="w-7 h-7 rounded-lg bg-accent/15 border border-accent/25 flex items-center justify-center">
          <Cpu size={13} className="text-accent-glow" />
        </div>
        <span className="font-display font-bold text-sm text-text tracking-wide">CodeMind AI</span>

        {session && (
          <>
            <span className="text-border-bright text-xs">·</span>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs font-mono text-text-muted truncate max-w-[180px]">
                {session.repo_name}
              </span>
              <span className="tag-green hidden sm:inline-flex">
                {session.total_files} files
              </span>
            </div>
          </>
        )}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        {session && (
          <button
            onClick={handleClearChat}
            className="btn-ghost text-xs"
            title="Clear chat"
          >
            <RotateCcw size={13} />
            <span className="hidden sm:block">Clear</span>
          </button>
        )}

        {/* Connection status */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-elevated border border-border">
          {isHealthy === null ? (
            <span className="w-1.5 h-1.5 rounded-full bg-text-dim animate-pulse" />
          ) : isHealthy ? (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="w-1.5 h-1.5 rounded-full bg-emerald"
            />
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-rose animate-pulse" />
          )}
          <span className="text-[11px] font-mono text-text-dim hidden sm:block">
            {isHealthy === null ? 'connecting' : isHealthy ? 'online' : 'offline'}
          </span>
        </div>
      </div>
    </header>
  )
}
