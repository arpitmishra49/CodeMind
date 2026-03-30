import React, { useEffect, useState } from 'react'
import { Toaster } from 'react-hot-toast'
import { motion } from 'framer-motion'
import Header from '@/components/layout/Header'
import Sidebar from '@/components/layout/Sidebar'
import ChatView from '@/components/chat/ChatView'
import IngestionPanel from '@/components/chat/IngestionPanel'
import { useStore } from '@/store'
import { checkHealth } from '@/services/api'

export default function App() {
  const { session } = useStore()
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null)

  useEffect(() => {
    const checkBackend = async () => {
      try {
        await checkHealth()
        setIsHealthy(true)
      } catch {
        setIsHealthy(false)
      }
    }
    checkBackend()
    const interval = setInterval(checkBackend, 30_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="h-screen flex flex-col bg-void overflow-hidden">
      {/* Background grid */}
      <div className="fixed inset-0 bg-grid opacity-40 pointer-events-none" />
      {/* Glow orb */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px]
                      bg-gradient-radial from-accent/8 via-accent/3 to-transparent
                      pointer-events-none blur-3xl" />

      {/* Header */}
      <Header isHealthy={isHealthy} />

      {/* Body */}
      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar />

        {/* Main area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Offline banner */}
          {isHealthy === false && (
            <motion.div
              initial={{ y: -40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="flex items-center justify-center gap-2 py-2 bg-rose/10 border-b border-rose/20 text-xs font-mono text-rose"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose animate-pulse" />
              Backend offline — start the FastAPI server on port 8000
            </motion.div>
          )}

          {session && session.status === 'ready' ? (
            <ChatView />
          ) : (
            <IngestionPanel />
          )}
        </main>
      </div>

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#13131e',
            color: '#e2e8f0',
            border: '1px solid #1e1e2e',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '13px',
          },
          success: { iconTheme: { primary: '#10b981', secondary: '#050508' } },
          error: { iconTheme: { primary: '#f43f5e', secondary: '#050508' } },
        }}
      />
    </div>
  )
}
