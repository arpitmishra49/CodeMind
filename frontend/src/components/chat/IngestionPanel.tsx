import React, { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, Github, ArrowRight, Loader2, CheckCircle2,
  FileArchive, AlertCircle, Zap, Shield, Brain
} from 'lucide-react'
import { useStore } from '@/store'
import { ingestZip, ingestGitHub } from '@/services/api'
import toast from 'react-hot-toast'
import clsx from 'clsx'

type Tab = 'upload' | 'github'

const FEATURES = [
  { icon: Brain, label: 'AI-Powered RAG', desc: 'Semantic code search across your entire repo' },
  { icon: Zap, label: 'Agentic Planning', desc: 'Agent decides explain / debug / document / review' },
  { icon: Shield, label: 'Context-Aware', desc: 'Answers grounded in your actual codebase' },
]

const EXAMPLE_REPOS = [
  'https://github.com/fastapi/fastapi',
  'https://github.com/vercel/next.js',
  'https://github.com/tiangolo/sqlmodel',
]

export default function IngestionPanel() {
  const [tab, setTab] = useState<Tab>('github')
  const [githubUrl, setGithubUrl] = useState('')
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const { setSession, setIsIngesting, isIngesting, setIngestProgress, ingestProgress } = useStore()

  const onDrop = useCallback((files: File[]) => {
    const file = files[0]
    if (file && file.name.endsWith('.zip')) {
      setUploadedFile(file)
    } else {
      toast.error('Please upload a .zip file')
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/zip': ['.zip'] },
    maxFiles: 1,
    disabled: isIngesting,
  })

  const handleIngest = async () => {
    try {
      setIsIngesting(true)
      setIngestProgress(10)

      let result: any

      if (tab === 'github') {
        if (!githubUrl.trim()) {
          toast.error('Please enter a GitHub URL')
          return
        }
        if (!githubUrl.includes('github.com')) {
          toast.error('Please enter a valid GitHub URL')
          return
        }

        toast.loading('Cloning repository...', { id: 'ingest' })
        setIngestProgress(30)
        result = await ingestGitHub(githubUrl.trim())

      } else {
        if (!uploadedFile) {
          toast.error('Please select a ZIP file')
          return
        }

        toast.loading('Processing repository...', { id: 'ingest' })
        setIngestProgress(30)
        result = await ingestZip(uploadedFile)
      }

      setIngestProgress(90)

      if (result.status === 'ready') {
        setSession(result)
        toast.success(`Indexed ${result.total_files} files, ${result.total_chunks} chunks`, { id: 'ingest' })
        setIngestProgress(100)
      } else {
        throw new Error(result.message || 'Ingestion failed')
      }
    } catch (err: any) {
      toast.error(err.message || 'Ingestion failed', { id: 'ingest' })
    } finally {
      setIsIngesting(false)
      setTimeout(() => setIngestProgress(0), 1000)
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center p-8 overflow-y-auto">
      <div className="w-full max-w-2xl space-y-8 animate-slide-up">

        {/* Hero */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-xs font-mono text-accent-glow mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            Agentic RAG · LangGraph · FAISS
          </div>
          <h1 className="font-display font-bold text-4xl text-text leading-tight">
            Understand Any
            <span className="text-gradient"> Codebase</span>
          </h1>
          <p className="text-text-muted font-body text-base max-w-md mx-auto leading-relaxed">
            Upload your repository and ask anything — explain architecture, debug errors,
            generate docs, or review code quality.
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-3 gap-3">
          {FEATURES.map(({ icon: Icon, label, desc }) => (
            <div key={label} className="glass rounded-xl p-4 text-center space-y-2">
              <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/20 flex items-center justify-center mx-auto">
                <Icon size={14} className="text-accent-glow" />
              </div>
              <div className="text-xs font-display font-semibold text-text">{label}</div>
              <div className="text-[11px] text-text-dim leading-relaxed">{desc}</div>
            </div>
          ))}
        </div>

        {/* Ingestion Card */}
        <div className="glass rounded-2xl p-1 border border-border">
          {/* Tabs */}
          <div className="flex p-1 gap-1 bg-void/50 rounded-xl mb-1">
            {(['github', 'upload'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={clsx(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-body font-medium transition-all duration-200',
                  tab === t
                    ? 'bg-elevated text-text shadow-sm border border-border-bright'
                    : 'text-text-muted hover:text-text'
                )}
              >
                {t === 'github' ? <Github size={15} /> : <FileArchive size={15} />}
                {t === 'github' ? 'GitHub URL' : 'Upload ZIP'}
              </button>
            ))}
          </div>

          <div className="p-5 space-y-4">
            <AnimatePresence mode="wait">
              {tab === 'github' ? (
                <motion.div
                  key="github"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="space-y-3"
                >
                  <div className="relative">
                    <Github size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim" />
                    <input
                      type="url"
                      value={githubUrl}
                      onChange={(e) => setGithubUrl(e.target.value)}
                      placeholder="https://github.com/owner/repository"
                      className="input-base pl-10"
                      disabled={isIngesting}
                      onKeyDown={(e) => e.key === 'Enter' && handleIngest()}
                    />
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {EXAMPLE_REPOS.map((url) => {
                      const name = url.split('/').slice(-2).join('/')
                      return (
                        <button
                          key={url}
                          onClick={() => setGithubUrl(url)}
                          className="text-[11px] font-mono text-text-dim hover:text-accent-glow bg-border hover:bg-accent/10 hover:border-accent/20 border border-transparent px-2 py-1 rounded-md transition-all"
                        >
                          {name}
                        </button>
                      )
                    })}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="upload"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <div
                    {...getRootProps()}
                    className={clsx(
                      'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200',
                      isDragActive
                        ? 'border-accent bg-accent/5'
                        : uploadedFile
                        ? 'border-emerald/50 bg-emerald/5'
                        : 'border-border hover:border-border-bright hover:bg-elevated/50'
                    )}
                  >
                    <input {...getInputProps()} />
                    {uploadedFile ? (
                      <div className="space-y-2">
                        <CheckCircle2 size={28} className="text-emerald mx-auto" />
                        <div className="text-sm font-body text-text">{uploadedFile.name}</div>
                        <div className="text-xs text-text-muted">
                          {(uploadedFile.size / 1024 / 1024).toFixed(1)} MB · Click to replace
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Upload size={28} className={clsx('mx-auto', isDragActive ? 'text-accent' : 'text-text-dim')} />
                        <div className="text-sm font-body text-text">
                          {isDragActive ? 'Drop it here' : 'Drop your repository ZIP'}
                        </div>
                        <div className="text-xs text-text-muted">or click to browse · Max 500MB</div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Progress bar */}
            {isIngesting && ingestProgress > 0 && (
              <div className="space-y-1.5">
                <div className="h-1.5 bg-border rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-accent to-accent-glow rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${ingestProgress}%` }}
                    transition={{ ease: 'easeOut', duration: 0.5 }}
                  />
                </div>
                <div className="text-[11px] text-text-dim text-center font-mono">
                  {ingestProgress < 30 ? 'Connecting...' :
                   ingestProgress < 60 ? 'Parsing & chunking files...' :
                   ingestProgress < 90 ? 'Building vector index...' :
                   'Finalizing...'}
                </div>
              </div>
            )}

            <button
              onClick={handleIngest}
              disabled={isIngesting || (tab === 'github' ? !githubUrl.trim() : !uploadedFile)}
              className="btn-primary w-full justify-center py-3 text-sm font-semibold animate-pulse-glow"
            >
              {isIngesting ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Indexing Codebase...
                </>
              ) : (
                <>
                  <Zap size={15} />
                  Index Codebase
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-text-dim font-mono">
          Powered by LangGraph · FAISS · OpenAI / Ollama
        </p>
      </div>
    </div>
  )
}
