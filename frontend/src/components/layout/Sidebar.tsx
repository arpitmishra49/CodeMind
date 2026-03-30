import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FolderOpen, File, ChevronRight, ChevronDown,
  Database, Hash, Layers, Trash2, Plus,
  Code2, GitBranch, Cpu
} from 'lucide-react'
import { useStore } from '@/store'
import { deleteSession } from '@/services/api'
import toast from 'react-hot-toast'

const LANG_COLORS: Record<string, string> = {
  python: '#3b82f6',
  javascript: '#f59e0b',
  typescript: '#6366f1',
  java: '#f97316',
  go: '#06b6d4',
  rust: '#f43f5e',
  cpp: '#8b5cf6',
  c: '#10b981',
  ruby: '#ef4444',
  php: '#a78bfa',
  swift: '#ff6b35',
  kotlin: '#a855f7',
  markdown: '#64748b',
  yaml: '#84cc16',
  json: '#eab308',
  sql: '#06b6d4',
  bash: '#22d3ee',
}

function getLangColor(lang: string) {
  return LANG_COLORS[lang] || '#64748b'
}

interface FileNodeProps {
  name: string
  node: any
  depth?: number
  path?: string
}

function FileNode({ name, node, depth = 0, path = '' }: FileNodeProps) {
  const [open, setOpen] = useState(depth < 2)
  const isFile = node?.type === 'file'
  const fullPath = path ? `${path}/${name}` : name

  if (isFile) {
    return (
      <div
        className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-elevated cursor-default group"
        style={{ paddingLeft: `${(depth + 1) * 12}px` }}
        title={fullPath}
      >
        <File size={11} className="shrink-0" style={{ color: getLangColor(node.language) }} />
        <span className="text-xs text-text-muted truncate font-mono group-hover:text-text transition-colors">
          {name}
        </span>
      </div>
    )
  }

  const children = Object.entries(node || {})

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-elevated text-left"
        style={{ paddingLeft: `${(depth + 1) * 12}px` }}
      >
        {open ? (
          <ChevronDown size={11} className="text-text-dim shrink-0" />
        ) : (
          <ChevronRight size={11} className="text-text-dim shrink-0" />
        )}
        <FolderOpen size={11} className="text-accent-glow shrink-0" />
        <span className="text-xs text-text-muted truncate font-mono">{name}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            {children.map(([childName, childNode]) => (
              <FileNode
                key={childName}
                name={childName}
                node={childNode}
                depth={depth + 1}
                path={fullPath}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function Sidebar() {
  const { session, sidebarOpen, reset, clearMessages } = useStore()

  const handleNewSession = async () => {
    if (!session) return
    if (!confirm('Start a new session? This will clear the current codebase.')) return
    try {
      await deleteSession(session.session_id)
    } catch {}
    reset()
    toast.success('Session cleared')
  }

  const topLangs = Object.entries(session?.languages || {}).slice(0, 6)

  return (
    <AnimatePresence>
      {sidebarOpen && (
        <motion.aside
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 280, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="flex flex-col h-full border-r border-border bg-surface overflow-hidden shrink-0"
        >
          {/* Logo */}
          <div className="flex items-center gap-3 px-5 py-5 border-b border-border">
            <div className="w-8 h-8 rounded-lg bg-accent/20 border border-accent/30 flex items-center justify-center">
              <Cpu size={16} className="text-accent-glow" />
            </div>
            <div>
              <div className="font-display font-bold text-sm text-text tracking-wide">CodeMind</div>
              <div className="text-xs text-text-dim font-mono">AI Assistant</div>
            </div>
          </div>

          {session ? (
            <>
              {/* Repo Info */}
              <div className="px-4 py-4 border-b border-border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GitBranch size={13} className="text-accent-glow" />
                    <span className="text-xs font-display font-semibold text-text truncate max-w-[140px]">
                      {session.repo_name}
                    </span>
                  </div>
                  <span className="tag-green text-[10px]">indexed</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-elevated rounded-lg p-2.5 border border-border">
                    <div className="flex items-center gap-1.5 mb-1">
                      <File size={10} className="text-text-muted" />
                      <span className="text-[10px] text-text-dim font-mono uppercase">Files</span>
                    </div>
                    <div className="text-base font-display font-bold text-text">
                      {session.total_files.toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-elevated rounded-lg p-2.5 border border-border">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Hash size={10} className="text-text-muted" />
                      <span className="text-[10px] text-text-dim font-mono uppercase">Chunks</span>
                    </div>
                    <div className="text-base font-display font-bold text-text">
                      {session.total_chunks.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Languages */}
                {topLangs.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[10px] text-text-dim font-mono uppercase tracking-wider">Languages</div>
                    <div className="flex flex-wrap gap-1">
                      {topLangs.map(([lang, count]) => (
                        <div
                          key={lang}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-border text-[10px] font-mono"
                          style={{ color: getLangColor(lang) }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: getLangColor(lang) }}
                          />
                          {lang}
                          <span className="text-text-dim">·{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* File Tree */}
              <div className="flex-1 overflow-y-auto py-3">
                <div className="px-4 mb-2">
                  <div className="text-[10px] text-text-dim font-mono uppercase tracking-wider flex items-center gap-1.5">
                    <Layers size={10} />
                    File Structure
                  </div>
                </div>
                <div className="space-y-0.5 px-1">
                  {Object.entries(session.file_tree || {}).map(([name, node]) => (
                    <FileNode key={name} name={name} node={node} />
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="p-4 border-t border-border space-y-2">
                <button
                  onClick={clearMessages}
                  className="btn-ghost w-full justify-start text-xs"
                >
                  <Database size={13} />
                  Clear Chat History
                </button>
                <button
                  onClick={handleNewSession}
                  className="btn-ghost w-full justify-start text-xs text-rose/70 hover:text-rose"
                >
                  <Trash2 size={13} />
                  New Session
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center space-y-3">
                <div className="w-12 h-12 rounded-xl bg-border flex items-center justify-center mx-auto">
                  <Code2 size={20} className="text-text-dim" />
                </div>
                <div className="text-sm text-text-muted font-body">No codebase loaded</div>
                <div className="text-xs text-text-dim">Upload a ZIP or enter a GitHub URL to get started</div>
              </div>
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
