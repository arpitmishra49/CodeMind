import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || ''

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 120_000,
})

// Request interceptor
api.interceptors.request.use((config) => {
  return config
})

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.detail ||
      error.response?.data?.message ||
      error.message ||
      'An unexpected error occurred'
    return Promise.reject(new Error(message))
  }
)

// ── Ingestion ─────────────────────────────────────────────

export async function ingestZip(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await api.post('/api/ingest/zip', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function ingestGitHub(githubUrl: string) {
  const { data } = await api.post('/api/ingest/github', {
    github_url: githubUrl,
  })
  return data
}

export async function getSession(sessionId: string) {
  const { data } = await api.get(`/api/ingest/session/${sessionId}`)
  return data
}

export async function deleteSession(sessionId: string) {
  const { data } = await api.delete(`/api/ingest/session/${sessionId}`)
  return data
}

// ── Chat ──────────────────────────────────────────────────

export async function queryChat(sessionId: string, message: string) {
  const { data } = await api.post('/api/chat/query', {
    session_id: sessionId,
    message,
    stream: false,
  })
  return data
}

export async function clearHistory(sessionId: string) {
  const { data } = await api.delete(`/api/chat/history/${sessionId}`)
  return data
}

// ── Streaming ─────────────────────────────────────────────

export function createStreamingQuery(
  sessionId: string,
  message: string,
  callbacks: {
    onPlan?: (queryType: string) => void
    onSources?: (sources: any[]) => void
    onToken?: (token: string) => void
    onDone?: (fullResponse: string) => void
    onError?: (error: string) => void
  }
): () => void {
  const controller = new AbortController()

  const run = async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message, stream: true }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        callbacks.onError?.(errData.detail || `HTTP ${response.status}`)
        return
      }

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value, { stream: true })
        const lines = text.split('\n').filter((l) => l.startsWith('data: '))

        for (const line of lines) {
          try {
            const json = JSON.parse(line.slice(6))
            switch (json.type) {
              case 'plan':
                callbacks.onPlan?.(json.query_type)
                break
              case 'sources':
                callbacks.onSources?.(json.sources)
                break
              case 'token':
                callbacks.onToken?.(json.content)
                break
              case 'done':
                callbacks.onDone?.(json.full_response)
                break
              case 'error':
                callbacks.onError?.(json.message)
                break
            }
          } catch {
            // Ignore parse errors for incomplete chunks
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        callbacks.onError?.(err.message || 'Stream failed')
      }
    }
  }

  run()
  return () => controller.abort()
}

// ── Health ────────────────────────────────────────────────

export async function checkHealth() {
  const { data } = await api.get('/api/health')
  return data
}

export default api
