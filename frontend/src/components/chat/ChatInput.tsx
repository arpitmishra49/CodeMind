import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Send, Loader2, Mic, Bug, BookOpen, FileCode, Eye, Search, Sparkles
} from 'lucide-react'
import clsx from 'clsx'

interface QuickAction {
  icon: React.ComponentType<any>
  label: string
  prefix: string
  color: string
}

const QUICK_ACTIONS: QuickAction[] = [
  { icon: BookOpen, label: 'Explain', prefix: 'Explain how ', color: 'text-accent-glow' },
  { icon: Bug, label: 'Debug', prefix: 'Debug this error: ', color: 'text-rose' },
  { icon: FileCode, label: 'Document', prefix: 'Generate documentation for ', color: 'text-emerald' },
  { icon: Eye, label: 'Review', prefix: 'Review the code in ', color: 'text-amber' },
  { icon: Search, label: 'Find', prefix: 'Find all instances of ', color: 'text-text-muted' },
]

const PLACEHOLDER_SUGGESTIONS = [
  'Explain the authentication flow...',
  'Debug the error in the payment module...',
  'How does the data pipeline work?',
  'Generate docs for the API endpoints...',
  'Find all database queries...',
  'Review the security of this module...',
]

interface Props {
  onSend: (message: string) => void
  disabled?: boolean
  isStreaming?: boolean
}

export default function ChatInput({ onSend, disabled, isStreaming }: Props) {
  const [value, setValue] = useState('')
  const [placeholderIdx, setPlaceholderIdx] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Rotate placeholder
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIdx(i => (i + 1) % PLACEHOLDER_SUGGESTIONS.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
  }, [value])

  const handleSend = () => {
    const trimmed = value.trim()
    if (!trimmed || disabled || isStreaming) return
    onSend(trimmed)
    setValue('')
    textareaRef.current!.style.height = 'auto'
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleQuickAction = (action: QuickAction) => {
    setValue(action.prefix)
    textareaRef.current?.focus()
  }

  const canSend = value.trim().length > 0 && !disabled && !isStreaming

  return (
    <div className="border-t border-border bg-surface/80 backdrop-blur-xl px-4 py-4">
      {/* Quick Actions */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1 scrollbar-none">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.label}
            onClick={() => handleQuickAction(action)}
            disabled={disabled || isStreaming}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono whitespace-nowrap',
              'bg-elevated border border-border hover:border-border-bright',
              'transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed',
              action.color
            )}
          >
            <action.icon size={11} />
            {action.label}
          </button>
        ))}
      </div>

      {/* Input area */}
      <div className={clsx(
        'relative rounded-xl border transition-all duration-200',
        value.length > 0 ? 'border-accent/50 glow-accent' : 'border-border'
      )}>
        <div className="bg-elevated rounded-xl overflow-hidden">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled || isStreaming}
            rows={1}
            className={clsx(
              'w-full resize-none bg-transparent px-4 pt-4 pb-3',
              'text-text text-sm font-body leading-relaxed',
              'placeholder-text-dim focus:outline-none',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
            placeholder={PLACEHOLDER_SUGGESTIONS[placeholderIdx]}
            style={{ maxHeight: '200px' }}
          />

          {/* Bottom bar */}
          <div className="flex items-center justify-between px-4 pb-3">
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-text-dim font-mono">
                {value.length > 0 && `${value.length} chars`}
              </span>
              <span className="text-[11px] text-text-dim font-mono hidden sm:block">
                {isStreaming ? (
                  <span className="flex items-center gap-1.5 text-accent-glow">
                    <Sparkles size={10} className="animate-pulse" />
                    AI is responding...
                  </span>
                ) : (
                  'Enter to send · Shift+Enter for newline'
                )}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Character limit indicator */}
              {value.length > 2000 && (
                <span className={clsx(
                  'text-[11px] font-mono',
                  value.length > 4000 ? 'text-rose' : 'text-amber'
                )}>
                  {value.length}/4000
                </span>
              )}

              <button
                onClick={handleSend}
                disabled={!canSend}
                className={clsx(
                  'w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200',
                  canSend
                    ? 'bg-accent hover:bg-accent-glow text-white shadow-lg shadow-accent/25'
                    : 'bg-border text-text-dim cursor-not-allowed'
                )}
              >
                {isStreaming ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Send size={15} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center mt-2.5 gap-1">
        <span className="text-[10px] text-text-dim font-mono">CodeMind AI may make mistakes.</span>
        <span className="text-[10px] text-text-dim font-mono">Always verify critical code changes.</span>
      </div>
    </div>
  )
}
