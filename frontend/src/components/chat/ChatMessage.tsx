import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { motion } from 'framer-motion'
import {
  User, Bot, Copy, Check, ChevronDown, ChevronRight,
  FileCode, Zap, Bug, BookOpen, Search, Eye, MessageSquare
} from 'lucide-react'
import { Message, QueryType } from '@/store'
import clsx from 'clsx'
import 'highlight.js/styles/github-dark.css'

const QUERY_TYPE_CONFIG: Record<QueryType, { icon: React.ComponentType<any>; label: string; color: string }> = {
  explain: { icon: BookOpen, label: 'Explanation', color: 'text-accent-glow' },
  debug: { icon: Bug, label: 'Debug', color: 'text-rose' },
  document: { icon: FileCode, label: 'Documentation', color: 'text-emerald' },
  review: { icon: Eye, label: 'Code Review', color: 'text-amber' },
  search: { icon: Search, label: 'Search', color: 'text-accent-glow' },
  general: { icon: MessageSquare, label: 'General', color: 'text-text-muted' },
}

function CodeBlock({ children, className }: { children: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const language = className?.replace('language-', '') || 'code'

  const handleCopy = () => {
    navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative group my-3">
      <div className="flex items-center justify-between px-4 py-2 bg-[#0a0a12] border border-border rounded-t-xl border-b-0">
        <span className="text-[11px] font-mono text-text-dim">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[11px] text-text-dim hover:text-text transition-colors opacity-0 group-hover:opacity-100"
        >
          {copied ? <Check size={11} className="text-emerald" /> : <Copy size={11} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="!rounded-t-none !mt-0 !border-t-0">
        <code className={className}>{children}</code>
      </pre>
    </div>
  )
}

function SourcesPanel({ sources }: { sources: NonNullable<Message['sources']> }) {
  const [open, setOpen] = useState(false)
  if (!sources.length) return null

  const unique = Array.from(new Map(sources.map(s => [s.file_path, s])).values())

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
        {open ? <ChevronDown size={13} className="text-text-dim" /> : <ChevronRight size={13} className="text-text-dim" />}
      </button>
      {open && (
        <div className="px-4 pb-3 pt-2 space-y-1.5 bg-elevated/50">
          {unique.map((src, i) => (
            <div key={i} className="flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: src.language === 'python' ? '#3b82f6' :
                  src.language === 'typescript' ? '#6366f1' :
                  src.language === 'javascript' ? '#f59e0b' : '#64748b' }}
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

interface Props {
  message: Message
}

export default function ChatMessage({ message }: Props) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'
  const qtConfig = message.queryType ? QUERY_TYPE_CONFIG[message.queryType] : null

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
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
        isUser
          ? 'bg-accent/20 border border-accent/30'
          : 'bg-elevated border border-border'
      )}>
        {isUser
          ? <User size={14} className="text-accent-glow" />
          : <Bot size={14} className="text-text-muted" />
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
              {message.content}
            </p>
          ) : (
            <div className="prose-code text-text">
              {message.isStreaming && !message.content ? (
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
                  rehypePlugins={[rehypeHighlight]}
                  components={{
                    code({ node, className, children, ...props }: any) {
                      const isBlock = !props.inline
                      if (isBlock) {
                        return (
                          <CodeBlock className={className}>
                            {String(children).replace(/\n$/, '')}
                          </CodeBlock>
                        )
                      }
                      return <code className={className} {...props}>{children}</code>
                    },
                    pre({ children }: any) {
                      return <>{children}</>
                    },
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              )}
              {message.isStreaming && message.content && (
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

        {/* Copy button for assistant messages */}
        {!isUser && message.content && !message.isStreaming && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 mt-2 text-[11px] text-text-dim hover:text-text transition-colors opacity-0 group-hover:opacity-100 font-mono"
          >
            {copied ? <Check size={11} className="text-emerald" /> : <Copy size={11} />}
            {copied ? 'Copied' : 'Copy response'}
          </button>
        )}
      </div>
    </motion.div>
  )
}
