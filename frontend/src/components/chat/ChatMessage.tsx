import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { motion } from 'framer-motion'
import {
  User, Bot, Copy, Check, ChevronDown, ChevronRight,
  FileCode, Bug, BookOpen, Search, Eye, MessageSquare
} from 'lucide-react'
import { Message, QueryType } from '@/store'
import clsx from 'clsx'

const QUERY_TYPE_CONFIG: Record<QueryType, { icon: React.ComponentType<any>; label: string; color: string }> = {
  explain:  { icon: BookOpen,      label: 'Explanation',   color: 'text-accent-glow' },
  debug:    { icon: Bug,           label: 'Debug',         color: 'text-rose' },
  document: { icon: FileCode,      label: 'Documentation', color: 'text-emerald' },
  review:   { icon: Eye,           label: 'Code Review',   color: 'text-amber' },
  search:   { icon: Search,        label: 'Search',        color: 'text-accent-glow' },
  general:  { icon: MessageSquare, label: 'General',       color: 'text-text-muted' },
}

// ── Safe string extractor ─────────────────────────────────────────────────
function extractText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(extractText).join('')
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    // LangChain / Gemini chunk shapes
    if (typeof obj.content === 'string') return obj.content
    if (typeof obj.text === 'string')    return obj.text
    if (typeof obj.message === 'string') return obj.message
    if (typeof obj.output === 'string')  return obj.output
    // Recurse into known wrapper keys
    for (const key of ['content', 'text', 'message', 'output', 'answer', 'result']) {
      if (obj[key] !== undefined) return extractText(obj[key])
    }
    // Last resort: JSON stringify so it's at least readable
    try { return JSON.stringify(value, null, 2) } catch { return '' }
  }
  return String(value)
}

// ── Code block with copy button ───────────────────────────────────────────
function CodeBlock({ children, className }: { children: unknown; className?: string }) {
  const [copied, setCopied] = useState(false)
  const code = extractText(children).replace(/\n$/, '')
  const language = className?.replace('language-', '') || 'code'

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative group my-3 rounded-xl overflow-hidden border border-border">
      <div className="flex items-center justify-between px-4 py-2 bg-[#0a0a12] border-b border-border">
        <span className="text-[11px] font-mono text-text-dim">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[11px] text-text-dim hover:text-text transition-colors"
        >
          {copied
            ? <><Check size={11} className="text-emerald" /> Copied</>
            : <><Copy size={11} /> Copy</>
          }
        </button>
      </div>
      <pre className="overflow-x-auto p-4 bg-[#0a0a12] m-0">
        <code className={clsx('text-[0.82rem] font-mono text-slate-300', className)}>
          {code}
        </code>
      </pre>
    </div>
  )
}

// ── Sources panel ─────────────────────────────────────────────────────────
function SourcesPanel({ sources }: { sources: NonNullable<Message['sources']> }) {
  const [open, setOpen] = useState(false)
  if (!sources.length) return null

  const unique = Array.from(new Map(sources.map(s => [s.file_path, s])).values())

  const LANG_COLORS: Record<string, string> = {
    python: '#3b82f6', javascript: '#f59e0b', typescript: '#6366f1',
    java: '#f97316', go: '#06b6d4', rust: '#f43f5e', cpp: '#8b5cf6',
  }

  return (
    <div className="mt-3 border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-elevated hover:bg-border transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <FileCode size={13} className="text-text-muted" />
          <span className="text-xs font-mono text-text-muted">
            {unique.length} source{unique.length !== 1 ? 's' : ''} referenced
          </span>
        </div>
        {open
          ? <ChevronDown size={13} className="text-text-dim" />
          : <ChevronRight size={13} className="text-text-dim" />
        }
      </button>
      {open && (
        <div className="px-4 pb-3 pt-2 space-y-1.5 bg-elevated/50">
          {unique.map((src, i) => (
            <div key={i} className="flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: LANG_COLORS[src.language] || '#64748b' }}
              />
              <span className="text-[11px] font-mono text-text-muted truncate">{src.file_path}</span>
              <span className="text-[10px] font-mono text-text-dim shrink-0">{src.language}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────
interface Props { message: Message }

export default function ChatMessage({ message }: Props) {
  const [copied, setCopied] = useState(false)
  const isUser  = message.role === 'user'
  const qtConfig = message.queryType ? QUERY_TYPE_CONFIG[message.queryType] : null

  // Always guarantee content is a plain string before rendering
  const safeContent = extractText(message.content)

  const handleCopy = () => {
    navigator.clipboard.writeText(safeContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={clsx('flex gap-4 group', isUser ? 'flex-row-reverse' : 'flex-row')}
    >
      {/* Avatar */}
      <div className={clsx(
        'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-1',
        isUser ? 'bg-accent/20 border border-accent/30' : 'bg-elevated border border-border'
      )}>
        {isUser
          ? <User size={14} className="text-accent-glow" />
          : <Bot  size={14} className="text-text-muted" />
        }
      </div>

      {/* Bubble */}
      <div className={clsx('flex-1 min-w-0', isUser ? 'flex flex-col items-end' : '')}>
        {/* Meta row */}
        <div className={clsx(
          'flex items-center gap-2 mb-2',
          isUser ? 'flex-row-reverse' : 'flex-row'
        )}>
          <span className="text-xs font-display font-semibold text-text-muted">
            {isUser ? 'You' : 'CodeMind AI'}
          </span>
          {qtConfig && !isUser && (
            <div className={clsx('flex items-center gap-1 text-[11px] font-mono', qtConfig.color)}>
              <qtConfig.icon size={11} />
              {qtConfig.label}
            </div>
          )}
          <span className="text-[10px] text-text-dim font-mono">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        <div className={clsx(
          'rounded-2xl px-5 py-4 max-w-[90%]',
          isUser
            ? 'bg-accent/15 border border-accent/25 rounded-tr-sm'
            : 'bg-elevated border border-border rounded-tl-sm'
        )}>
          {isUser ? (
            <p className="text-sm font-body text-text leading-relaxed whitespace-pre-wrap">
              {safeContent}
            </p>
          ) : (
            <div className="prose-code text-text">
              {/* Thinking indicator */}
              {message.isStreaming && !safeContent ? (
                <div className="flex items-center gap-2 py-1">
                  <div className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <motion.span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-accent"
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-text-muted font-mono">Thinking...</span>
                </div>
              ) : (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // Route ALL code (block + inline) through safe extractor
                    code({ className, children, ...props }: any) {
                      const isBlock = !props.inline && (
                        className?.startsWith('language-') ||
                        extractText(children).includes('\n')
                      )
                      if (isBlock) {
                        return (
                          <CodeBlock className={className}>
                            {children}
                          </CodeBlock>
                        )
                      }
                      return (
                        <code
                          className="bg-accent/10 border border-accent/20 text-violet-300 px-1.5 py-0.5 rounded text-[0.82em] font-mono"
                          {...props}
                        >
                          {extractText(children)}
                        </code>
                      )
                    },
                    // Prevent double-wrapping pre tags
                    pre({ children }: any) {
                      return <>{children}</>
                    },
                    // Safe rendering for all text nodes
                    p({ children }: any) {
                      return (
                        <p className="mb-3 last:mb-0 leading-relaxed text-slate-300">
                          {children}
                        </p>
                      )
                    },
                    li({ children }: any) {
                      return <li className="mb-1 text-slate-300">{children}</li>
                    },
                    strong({ children }: any) {
                      return <strong className="font-semibold text-white">{children}</strong>
                    },
                    h1({ children }: any) {
                      return <h1 className="text-lg font-display font-bold text-white mt-4 mb-2">{children}</h1>
                    },
                    h2({ children }: any) {
                      return <h2 className="text-base font-display font-semibold text-white mt-4 mb-2">{children}</h2>
                    },
                    h3({ children }: any) {
                      return <h3 className="text-sm font-display font-semibold text-white mt-3 mb-1">{children}</h3>
                    },
                    blockquote({ children }: any) {
                      return (
                        <blockquote className="border-l-2 border-accent pl-4 my-3 text-slate-400 italic">
                          {children}
                        </blockquote>
                      )
                    },
                  }}
                >
                  {safeContent}
                </ReactMarkdown>
              )}
              {message.isStreaming && safeContent && (
                <span className="typing-cursor" />
              )}
            </div>
          )}
        </div>

        {/* Sources */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="max-w-[90%] w-full mt-1">
            <SourcesPanel sources={message.sources} />
          </div>
        )}

        {/* Copy button */}
        {!isUser && safeContent && !message.isStreaming && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 mt-2 text-[11px] text-text-dim hover:text-text transition-colors opacity-0 group-hover:opacity-100 font-mono"
          >
            {copied
              ? <><Check size={11} className="text-emerald" /> Copied</>
              : <><Copy size={11} /> Copy response</>
            }
          </button>
        )}
      </div>
    </motion.div>
  )
}