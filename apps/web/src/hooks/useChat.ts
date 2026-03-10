'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  attachments?: Array<{ type: string; name: string }>
  thinkingSteps?: Array<{ type: string; label: string }>
  modelId?: string
}

export interface ChatSession {
  id: string
  symbol: string
  title: string | null
  modelId: string
  messageCount: number
  updatedAt: string
}

export interface ThinkingState {
  /** Whether the agent is currently in a thinking/processing phase */
  isThinking: boolean
  /** Current activity description: 'Thinking...', 'Reading files...', 'Searching web...', etc. */
  activity: string | null
  /** List of completed steps/activities for display */
  steps: Array<{ type: string; label: string; timestamp: string }>
}

export interface UseChatReturn {
  /** Current session messages */
  messages: ChatMessage[]
  /** All user sessions */
  sessions: ChatSession[]
  /** Active session id */
  activeSessionId: string | null
  /** Whether response is streaming */
  isStreaming: boolean
  /** Accumulated streaming text */
  streamingText: string
  /** Error message */
  error: string | null
  /** Current model */
  modelId: string
  setModelId: (id: string) => void
  sendMessage: (content: string, attachments?: File[]) => Promise<void>
  /** Cancel an in-flight response (kills Docker container) */
  cancelResponse: () => Promise<void>
  loadSession: (sessionId: string) => Promise<void>
  newSession: () => void
  /** Create a new session with silent initialization (agent reads context, response hidden) */
  initSession: () => Promise<void>
  /** Whether the session is being initialized (agent warmup in progress) */
  isInitializing: boolean
  deleteSession: (sessionId: string) => Promise<void>
  refreshSessions: () => Promise<void>
  /** Agent thinking/reasoning state */
  thinking: ThinkingState
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip the data URL prefix, keep only base64 content
      const base64 = result.split(',')[1] ?? result
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function formatToolActivity(tool: string, input?: Record<string, unknown>): string {
  switch (tool) {
    case 'read':
      return `Reading ${(input?.filePath as string)?.split('/').pop() ?? 'file'}...`
    case 'webfetch':
      return `Fetching ${(input?.url as string)?.replace(/^https?:\/\//, '').split('/')[0] ?? 'URL'}...`
    case 'websearch_web_search_exa':
      return `Searching: ${(input?.query as string)?.slice(0, 40) ?? 'web'}...`
    case 'glob':
      return `Finding files...`
    case 'grep':
      return `Searching code...`
    case 'bash':
      return `Running command...`
    default:
      return `Using ${tool}...`
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [thinking, setThinking] = useState<ThinkingState>({ isThinking: false, activity: null, steps: [] })
  const [isInitializing, setIsInitializing] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const thinkingStepsRef = useRef<Array<{ type: string; label: string; timestamp: string }>>([])
  const [modelId, setModelIdState] = useState<string>('')
  const [refreshInterval, setRefreshInterval] = useState<number>(10)
  const validModelIdsRef = useRef<Set<string>>(new Set())

  const setModelId = useCallback((id: string) => {
    setModelIdState(id)
    // Persist as the default chat model in DB
    fetch('/api/intelligence/models', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'chat', value: id }),
    }).catch(() => { /* ignore */ })
  }, [])

  // Fetch available models + default chat model from DB on mount
  useEffect(() => {
    fetch('/api/intelligence/models')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (Array.isArray(data?.models) && data.models.length > 0) {
          validModelIdsRef.current = new Set(data.models.map((m: { id: string }) => m.id))
          const defaultModel = data?.modelMap?.chat
          if (defaultModel && validModelIdsRef.current.has(defaultModel)) {
            setModelIdState(defaultModel)
          } else {
            // No chat model set, or it's invalid — use first available
            setModelIdState(data.models[0].id)
          }
        }
        // Parse refresh interval from modelMap
        const interval = parseInt(data?.modelMap?.chatDataRefreshInterval || '10', 10)
        setRefreshInterval(interval > 0 ? interval : 0)
      }).catch(() => { /* ignore */ })
  }, [])

  const refreshSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/chat')
      if (!res.ok) return
      const data = await res.json() as ChatSession[]
      setSessions(data ?? [])
    } catch { /* ignore */ }
  }, [])

  const newSession = useCallback(() => {
    setMessages([])
    setActiveSessionId(null)
    setStreamingText('')
    setError(null)
    setThinking({ isThinking: false, activity: null, steps: [] })
  }, [])

  // Silent session initialization — agent reads context files, response is hidden.
  // After init completes, the session has an opencode session ID and user can chat normally.
  const initSession = useCallback(async () => {
    if (isStreaming || isInitializing) return
    setIsInitializing(true)
    setMessages([])
    setActiveSessionId(null)
    setStreamingText('')
    setError(null)
    setThinking({ isThinking: false, activity: null, steps: [] })

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Initialize session',
          modelId,
          init: true,
        }),
      })

      if (!res.ok || !res.body) {
        setError('Failed to initialize session')
        setIsInitializing(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() ?? ''
        for (const chunk of chunks) {
          if (!chunk.trim()) continue
          const lines = chunk.split('\n')
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const raw = line.slice(6).trim()
            if (!raw || raw === '[DONE]') continue
            try {
              const event = JSON.parse(raw) as { type: string; sessionId?: string }
              if (event.type === 'session' && event.sessionId) {
                setActiveSessionId(event.sessionId)
              }
            } catch { /* skip */ }
          }
        }
      }
      await refreshSessions()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Init failed')
    } finally {
      setIsInitializing(false)
    }
  }, [isStreaming, isInitializing, modelId, refreshSessions])

  const loadSession = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`/api/chat/${sessionId}`)
      if (!res.ok) return
      const data = await res.json() as { messages: ChatMessage[]; modelId?: string }
      // Filter out system messages (init warmup) and the assistant response that follows them
      const allMsgs = data.messages ?? []
      const visibleMsgs = allMsgs.filter((msg, i) => {
        if (msg.role === 'system') return false
        // Hide assistant response that immediately follows a system (init) message
        if (msg.role === 'assistant' && i > 0 && allMsgs[i - 1]?.role === 'system') return false
        return true
      })
      setMessages(visibleMsgs)
      setActiveSessionId(sessionId)
      setStreamingText('')
      setError(null)
      // Restore model from session — but only if it's a valid model
      if (data.modelId && validModelIdsRef.current.size > 0) {
        if (validModelIdsRef.current.has(data.modelId)) {
          setModelIdState(data.modelId)
        }
        // If session model is invalid, keep current modelId (already set to a valid one)
      } else if (data.modelId) {
        // Models not loaded yet — set it anyway, will be corrected when models load
        setModelIdState(data.modelId)
      }
    } catch { /* ignore */ }
  }, [])

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      await fetch(`/api/chat/${sessionId}`, { method: 'DELETE' })
    } catch { /* ignore */ }
    if (activeSessionId === sessionId) {
      setMessages([])
      setActiveSessionId(null)
    }
    await refreshSessions()
  }, [activeSessionId, refreshSessions])

  const sendMessage = useCallback(async (content: string, attachments?: File[]) => {
    if (isStreaming) return
    setError(null)

    // Convert attachments to base64
    const attachmentData: Array<{ name: string; data: string; type: string }> = []
    if (attachments && attachments.length > 0) {
      for (const file of attachments) {
        try {
          const data = await fileToBase64(file)
          attachmentData.push({ name: file.name, data, type: file.type })
        } catch { /* ignore failed attachment */ }
      }
    }

    // Optimistic user message
    const userMessage: ChatMessage = {
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
      attachments: attachmentData.map(a => ({ type: a.type, name: a.name })),
    }
    setMessages(prev => [...prev, userMessage])
    setIsStreaming(true)
    setStreamingText('')
    setThinking({ isThinking: true, activity: 'Connecting...', steps: [] })
    thinkingStepsRef.current = []

    let accumulated = ''
    let newSessionId: string | null = null
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    let inactivityTimer: ReturnType<typeof setInterval> | undefined

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({
          message: content,
          modelId,
          sessionId: activeSessionId,
          attachments: attachmentData,
        }),
      })

      if (!res.ok || !res.body) {
        setError('Failed to send message')
        setIsStreaming(false)
        setThinking({ isThinking: false, activity: null, steps: [] })
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let lastEventTime = Date.now()
      inactivityTimer = setInterval(() => {
        if (Date.now() - lastEventTime > 90000) {
          setThinking(prev => ({ ...prev, activity: 'Still waiting for AI response...' }))
        }
      }, 10000)

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() ?? ''

        for (const chunk of chunks) {
          if (!chunk.trim()) continue
          const lines = chunk.split('\n')
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const raw = line.slice(6).trim()
            if (!raw || raw === '[DONE]') continue
            try {
              const event = JSON.parse(raw) as {
                type: string
                phase?: string
                sessionId?: string
                part?: { text?: string; tool?: string; state?: { status?: string; input?: Record<string, unknown> } }
                code?: string
                error?: string
              }

              if (event.type === 'step_start') {
                const label = event.phase === 'db' ? 'Loading data...' : 'Processing...'
                lastEventTime = Date.now()
                setThinking(prev => ({
                  ...prev,
                  isThinking: true,
                  activity: label,
                  steps: [...prev.steps, { type: 'step_start', label, timestamp: new Date().toISOString() }],
                }))
                thinkingStepsRef.current = [...thinkingStepsRef.current, { type: 'step_start', label, timestamp: new Date().toISOString() }]
              } else if (event.type === 'tool_use' && event.part) {
                const toolName = event.part.tool ?? 'tool'
                const status = event.part.state?.status ?? 'running'
                const label = formatToolActivity(toolName, event.part.state?.input)
                if (status === 'running' || status === 'pending') {
                  lastEventTime = Date.now()
                  setThinking(prev => ({ ...prev, activity: label }))
                } else {
                  lastEventTime = Date.now()
                  setThinking(prev => ({
                    ...prev,
                    steps: [...prev.steps, { type: 'tool', label, timestamp: new Date().toISOString() }],
                  }))
                  thinkingStepsRef.current = [...thinkingStepsRef.current, { type: 'tool', label, timestamp: new Date().toISOString() }]
                }
              } else if (event.type === 'session' && event.sessionId) {
                newSessionId = event.sessionId
                setActiveSessionId(event.sessionId)
              } else if (event.type === 'opencode_session') {
                // OpenCode internal session ID captured — no UI action needed,
                // the backend stores it in MongoDB for future resume
              } else if (event.type === 'text' && event.part?.text) {
                lastEventTime = Date.now()
                setThinking(prev => ({ ...prev, isThinking: false, activity: null }))
                accumulated += event.part.text
                setStreamingText(accumulated)
              } else if (event.type === 'done') {
                const capturedSteps = thinkingStepsRef.current.length > 0
                  ? thinkingStepsRef.current.map(s => ({ type: s.type, label: s.label }))
                  : undefined
                setThinking({ isThinking: false, activity: null, steps: [] })
                thinkingStepsRef.current = []
                const assistantMessage: ChatMessage = {
                  role: 'assistant',
                  content: accumulated,
                  timestamp: new Date().toISOString(),
                  thinkingSteps: capturedSteps,
                  modelId,
                }
                setMessages(prev => [...prev, assistantMessage])
                setStreamingText('')
                setIsStreaming(false)
                accumulated = ''
                await refreshSessions()
              } else if (event.type === 'error') {
                const err = event.error as string | { data?: { message?: string }; message?: string } | undefined
                const errMsg = typeof err === 'string' ? err
                  : err?.data?.message ?? err?.message ?? 'Unknown error'
                // Show error as assistant message so it's visible in chat
                const errorMessage: ChatMessage = {
                  role: 'assistant',
                  content: `⚠ ${errMsg}`,
                  timestamp: new Date().toISOString(),
                }
                setMessages(prev => [...prev, errorMessage])
                setStreamingText('')
                setIsStreaming(false)
                setThinking({ isThinking: false, activity: null, steps: [] })
                accumulated = '' // prevent duplicate from 'done' event
              }
            } catch { /* malformed SSE data — skip */ }
          }
        }
      }

      // Handle case where stream ended without 'done' event
      if (accumulated) {
        const capturedStepsFallback = thinkingStepsRef.current.length > 0
          ? thinkingStepsRef.current.map(s => ({ type: s.type, label: s.label }))
          : undefined
        setThinking({ isThinking: false, activity: null, steps: [] })
        thinkingStepsRef.current = []
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: accumulated,
          timestamp: new Date().toISOString(),
          thinkingSteps: capturedStepsFallback,
          modelId,
        }
        setMessages(prev => [...prev, assistantMessage])
        setStreamingText('')
        await refreshSessions()
      }
    } catch (err) {
      // AbortError is expected when user cancels
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Cancelled by user — handled by cancelResponse
      } else {
        setError(err instanceof Error ? err.message : 'Failed to send message')
      }
    } finally {
      clearInterval(inactivityTimer)
      setIsStreaming(false)
      setThinking({ isThinking: false, activity: null, steps: [] })
      abortControllerRef.current = null
    }
  }, [isStreaming, modelId, activeSessionId, refreshSessions])

  const cancelResponse = useCallback(async () => {
    // 1. Abort the SSE fetch stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    // 2. Kill the Docker container via API
    const sid = activeSessionId
    if (sid) {
      try {
        await fetch(`/api/chat/${sid}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'cancel' }),
        })
      } catch { /* ignore */ }
    }

    // 3. If we had partial streaming text, save it as partial assistant message
    setStreamingText(prev => {
      if (prev.trim()) {
        const partialMessage: ChatMessage = {
          role: 'assistant',
          content: prev + '\n\n*[Response cancelled]*',
          timestamp: new Date().toISOString(),
        }
        setMessages(msgs => [...msgs, partialMessage])
      }
      return ''
    })

    setIsStreaming(false)
    setThinking({ isThinking: false, activity: null, steps: [] })
    setError(null)
    await refreshSessions()
  }, [activeSessionId, refreshSessions])

  // On mount: load sessions
  useEffect(() => {
    refreshSessions()
  }, [refreshSessions])

  // Periodic workspace data refresh — keeps workspace files current while session is active
  useEffect(() => {
    if (refreshInterval <= 0 || !activeSessionId) return

    const timer = setInterval(async () => {
      try {
        await fetch('/api/chat/refresh-data', { method: 'POST' })
      } catch { /* ignore */ }
    }, refreshInterval * 1000)

    return () => clearInterval(timer)
  }, [refreshInterval, activeSessionId])



  return {
    messages,
    sessions,
    activeSessionId,
    isStreaming,
    streamingText,
    error,
    modelId,
    setModelId,
    sendMessage,
    cancelResponse,
    loadSession,
    newSession,
    initSession,
    isInitializing,
    deleteSession,
    refreshSessions,
    thinking,
  }
}
