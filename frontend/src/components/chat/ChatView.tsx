import React, { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Code2, Bug, BookOpen, FileCode, Eye } from 'lucide-react'
import ChatMessage from './ChatMessage'
import ChatInput from './ChatInput'
import { useStore, Message } from '@/store'
import { createStreamingQuery } from '@/services/api'
import toast from 'react-hot-toast'

const STARTER_PROMPTS = [
  { icon: BookOpen, text: 'Explain the overall architecture of this codebase', color: 'text-accent-glow' },
  { icon: Code2, text: 'What are the main entry points of this application?', color: 'text-emerald' },
  { icon: Bug, text: 'Are there any obvious bugs or anti-patterns?', color: 'text-rose' },
  { icon: FileCode, text: 'Generate a README for this repository', color: 'text-amber' },
  { icon: Eye, text: 'Review the security posture of this codebase', color: 'text-text-muted' },
]

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export default function ChatView() {
  const {
    session,
    messages,
    addMessage,
    updateMessage,
    isQuerying,
    setIsQuerying,
  } = useStore()

  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<(() => void) | null>(null)
  const [streamingId, setStreamingId] = useState<string | null>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = useCallback(
    async (userMessage: string) => {
      if (!session || isQuerying) return

      // Add user message
      const userMsg: Message = {
        id: generateId(),
        role: 'user',
        content: userMessage,
        timestamp: Date.now(),
      }
      addMessage(userMsg)

      // Add placeholder AI message
      const aiId = generateId()
      const aiMsg: Message = {
        id: aiId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
      }
      addMessage(aiMsg)
      setStreamingId(aiId)
      setIsQuerying(true)

      let fullContent = ''
      let sources: any[] = []
      let queryType: string = 'general'

      const abort = createStreamingQuery(session.session_id, userMessage, {
        onPlan: (type) => {
          queryType = type
        },
        onSources: (srcs) => {
          sources = srcs
          updateMessage(aiId, { sources: srcs })
        },
        onToken: (token) => {
          fullContent += token
          updateMessage(aiId, { content: fullContent })
        },
        onDone: (response) => {
          updateMessage(aiId, {
            content: response || fullContent,
            isStreaming: false,
            queryType: queryType as any,
            sources,
          })
          setIsQuerying(false)
          setStreamingId(null)
          abortRef.current = null
        },
        onError: (err) => {
          updateMessage(aiId, {
            content: `**Error:** ${err}\n\nPlease try again or check that the backend is running.`,
            isStreaming: false,
          })
          setIsQuerying(false)
          setStreamingId(null)
          toast.error(err)
        },
      })

      abortRef.current = abort
    },
    [session, isQuerying, addMessage, updateMessage, setIsQuerying]
  )

  const handleStop = () => {
    abortRef.current?.()
    if (streamingId) {
      updateMessage(streamingId, { isStreaming: false })
    }
    setIsQuerying(false)
    setStreamingId(null)
  }

  const handleStarterPrompt = (text: string) => {
    handleSend(text)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 py-12 space-y-8">
            {/* Welcome */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center space-y-3"
            >
              <div className="w-14 h-14 rounded-2xl bg-accent/15 border border-accent/25 flex items-center justify-center mx-auto">
                <Sparkles size={22} className="text-accent-glow" />
              </div>
              <h2 className="font-display font-bold text-xl text-text">
                {session?.repo_name ? `${session.repo_name} is ready` : 'Ready to explore'}
              </h2>
              <p className="text-sm text-text-muted font-body max-w-sm">
                Ask anything about{' '}
                {session?.repo_name ? (
                  <span className="text-text font-medium">{session.repo_name}</span>
                ) : (
                  'the codebase'
                )}
                . I can explain, debug, document, or review any part of your code.
              </p>
            </motion.div>

            {/* Starter prompts */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="w-full max-w-2xl grid grid-cols-1 gap-2"
            >
              {STARTER_PROMPTS.map(({ icon: Icon, text, color }) => (
                <button
                  key={text}
                  onClick={() => handleStarterPrompt(text)}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-elevated border border-border
                             hover:border-border-bright hover:bg-border/50 transition-all duration-200 text-left group"
                >
                  <Icon size={15} className={`${color} shrink-0`} />
                  <span className="text-sm font-body text-text-muted group-hover:text-text transition-colors">
                    {text}
                  </span>
                </button>
              ))}
            </motion.div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
            <AnimatePresence initial={false}>
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}
            </AnimatePresence>
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        disabled={!session || session.status !== 'ready'}
        isStreaming={isQuerying}
      />
    </div>
  )
}
