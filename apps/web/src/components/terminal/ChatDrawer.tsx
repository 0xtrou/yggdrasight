'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import { ModelDropdown } from './ModelDropdown'
import type { ModelInfo } from './ModelDropdown'
import { useChat } from '@/hooks/useChat'
import type { ChatMessage } from '@/hooks/useChat'


const MONO_FONT = "'SF Mono', 'JetBrains Mono', 'Fira Code', monospace"

interface ChatDrawerProps {
  open: boolean
  onClose: () => void
}

export function ChatDrawer({ open, onClose }: ChatDrawerProps) {

  const {
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
    thinking,
  } = useChat()

  const [sessionsExpanded, setSessionsExpanded] = useState(false)
  const [inputText, setInputText] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [hoveredSession, setHoveredSession] = useState<string | null>(null)
  const [sendHovered, setSendHovered] = useState(false)
  const [attachHovered, setAttachHovered] = useState(false)
  const [newSessionHovered, setNewSessionHovered] = useState(false)
  const [cancelHovered, setCancelHovered] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [models, setModels] = useState<ModelInfo[]>([])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText, thinking.activity])

  useEffect(() => {
    fetch('/api/intelligence/models')
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data) => {
        if (data.models && Array.isArray(data.models)) {
          setModels(data.models)
        }
      })
      .catch(() => { /* ignore */ })
  }, [])

  const handleSend = useCallback(async () => {
    const text = inputText.trim()
    if (!text || isStreaming) return
    const file = selectedFile ? [selectedFile] : undefined
    setInputText('')
    setSelectedFile(null)
    await sendMessage(text, file)
  }, [inputText, isStreaming, selectedFile, sendMessage])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    setSelectedFile(file)
    e.target.value = ''
  }, [])

  const handleDeleteSession = useCallback(
    async (e: React.MouseEvent, sessionId: string) => {
      e.stopPropagation()
      await deleteSession(sessionId)
    },
    [deleteSession],
  )

  return (
    <>
      <style>{`
        @keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes chatDrawerIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .chat-markdown p { margin: 0 0 8px 0; }
        .chat-markdown p:last-child { margin-bottom: 0; }
        .chat-markdown code { background: rgba(255,255,255,0.06); padding: 1px 4px; border-radius: 2px; font-size: 10px; }
        .chat-markdown pre { background: rgba(255,255,255,0.04); border: 1px solid var(--color-terminal-border); border-radius: 2px; padding: 8px; margin: 6px 0; overflow-x: auto; }
        .chat-markdown pre code { background: none; padding: 0; font-size: 10px; }
        .chat-markdown ul, .chat-markdown ol { margin: 4px 0; padding-left: 16px; }
        .chat-markdown li { margin: 2px 0; }
        .chat-markdown h1, .chat-markdown h2, .chat-markdown h3 { color: var(--color-terminal-amber); margin: 8px 0 4px; font-size: 11px; letter-spacing: 0.05em; }
        .chat-markdown h1 { font-size: 12px; }
        .chat-markdown blockquote { border-left: 2px solid var(--color-terminal-amber); padding-left: 8px; margin: 4px 0; color: var(--color-terminal-dim); }
        .chat-markdown a { color: var(--color-terminal-amber); text-decoration: none; }
        .chat-markdown table { border-collapse: collapse; margin: 6px 0; width: 100%; }
        .chat-markdown th, .chat-markdown td { border: 1px solid var(--color-terminal-border); padding: 3px 6px; font-size: 10px; }
        .chat-markdown th { background: rgba(255,255,255,0.04); font-weight: 700; }
        details > summary::-webkit-details-marker { display: none; }
        details[open] > summary > span:first-child { transform: rotate(90deg); display: inline-block; }
      `}</style>

      {/* Drawer */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: fullscreen ? '100vw' : '450px',
          height: '100%',
          zIndex: 900,
          background: 'var(--color-terminal-bg)',
          borderLeft: '1px solid var(--color-terminal-border)',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: MONO_FONT,
          fontSize: '11px',
          color: 'var(--color-terminal-text)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.2s ease, width 0.2s ease',
          overflow: 'hidden',
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            height: '40px',
            minHeight: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 12px',
            borderBottom: '1px solid var(--color-terminal-border)',
            flexShrink: 0,
            gap: '8px',
          }}
        >
          <span
            style={{
              color: 'var(--color-terminal-amber)',
              letterSpacing: '0.08em',
              fontWeight: 700,
              fontSize: '11px',
            }}
          >
            CHAT
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
            <div style={{ width: '140px' }}>
              <ModelDropdown
                value={modelId}
                onChange={setModelId}
                models={models}
              />
            </div>

            <button
              onClick={() => setFullscreen(f => !f)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-terminal-dim)',
                fontFamily: MONO_FONT,
                fontSize: '13px',
                padding: '0 2px',
                lineHeight: 1,
              }}
              title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {fullscreen ? '⛶' : '⛶'}
            </button>

            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-terminal-dim)',
                fontFamily: MONO_FONT,
                fontSize: '14px',
                padding: '0 2px',
                lineHeight: 1,
              }}
              title="Close chat"
            >
              ×
            </button>
          </div>
        </div>

        {/* ── Sessions section ── */}
        <div
          style={{
            flexShrink: 0,
            borderBottom: '1px solid var(--color-terminal-border)',
          }}
        >
          <div
            style={{
              height: '30px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 12px',
              cursor: 'pointer',
              userSelect: 'none',
            }}
            onClick={() => setSessionsExpanded((v) => !v)}
          >
            <span
              style={{
                fontSize: '10px',
                letterSpacing: '0.1em',
                color: 'var(--color-terminal-dim)',
                fontWeight: 700,
              }}
            >
              {sessionsExpanded ? '▾' : '▸'} SESSIONS
              {sessions.length > 0 && (
                <span
                  style={{
                    marginLeft: '6px',
                    color: 'var(--color-terminal-amber)',
                    opacity: 0.7,
                  }}
                >
                  ({sessions.length})
                </span>
              )}
            </span>

            <button
              onClick={(e) => {
                e.stopPropagation()
                initSession()
              }}
              onMouseEnter={() => setNewSessionHovered(true)}
              onMouseLeave={() => setNewSessionHovered(false)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: newSessionHovered ? 'var(--color-terminal-amber)' : 'var(--color-terminal-dim)',
                fontFamily: MONO_FONT,
                fontSize: '10px',
                letterSpacing: '0.05em',
                padding: '0',
                transition: 'color 0.1s ease',
              }}
            >
              + NEW
            </button>
          </div>

          {sessionsExpanded && (
            <div
              style={{
                maxHeight: '160px',
                overflowY: 'auto',
                borderTop: '1px solid var(--color-terminal-border)',
              }}
            >
              {sessions.length === 0 ? (
                <div
                  style={{
                    padding: '8px 12px',
                    color: 'var(--color-terminal-dim)',
                    fontSize: '10px',
                    opacity: 0.6,
                    letterSpacing: '0.04em',
                  }}
                >
                  NO SESSIONS
                </div>
              ) : (
                sessions.map((session) => {
                  const isActive = session.id === activeSessionId
                  const isHovered = hoveredSession === session.id
                  return (
                    <div
                      key={session.id}
                      onMouseEnter={() => setHoveredSession(session.id)}
                      onMouseLeave={() => setHoveredSession(null)}
                      onClick={() => loadSession(session.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 12px',
                        cursor: 'pointer',
                        background: isActive
                          ? 'rgba(255,170,0,0.08)'
                          : isHovered
                            ? 'rgba(255,255,255,0.03)'
                            : 'transparent',
                        borderLeft: isActive ? '2px solid var(--color-terminal-amber)' : '2px solid transparent',
                        transition: 'background 0.1s ease',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: '10px',
                            color: isActive ? 'var(--color-terminal-amber)' : 'var(--color-terminal-text)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            letterSpacing: '0.03em',
                          }}
                        >
                          {session.title ?? `SESSION ${session.id.slice(-6).toUpperCase()}`}
                        </div>
                        <div
                          style={{
                            fontSize: '9px',
                            color: 'var(--color-terminal-dim)',
                            marginTop: '1px',
                            letterSpacing: '0.04em',
                          }}
                        >
                          {session.messageCount} MSG · {new Date(session.updatedAt).toLocaleDateString()}
                        </div>
                      </div>

                      {isHovered && (
                        <button
                          onClick={(e) => handleDeleteSession(e, session.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--color-terminal-red, #f87171)',
                            fontFamily: MONO_FONT,
                            fontSize: '12px',
                            padding: '0 0 0 8px',
                            flexShrink: 0,
                            lineHeight: 1,
                          }}
                          title="Delete session"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>

        {/* ── Messages area ── */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {/* No active session — prompt user to start */}
          {!activeSessionId && !isInitializing && messages.length === 0 && !isStreaming && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '16px',
                flex: 1,
                minHeight: '120px',
              }}
            >
              <div
                style={{
                  color: 'var(--color-terminal-dim)',
                  fontSize: '10px',
                  letterSpacing: '0.06em',
                  opacity: 0.5,
                  textAlign: 'center',
                }}
              >
                ASK ANYTHING ABOUT YOUR PORTFOLIO
              </div>
              <button
                onClick={() => initSession()}
                style={{
                  background: 'rgba(0, 255, 136, 0.06)',
                  border: '1px solid rgba(0, 255, 136, 0.25)',
                  color: '#00ff88',
                  fontFamily: MONO_FONT,
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  padding: '10px 24px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(0, 255, 136, 0.12)'
                  e.currentTarget.style.borderColor = 'rgba(0, 255, 136, 0.5)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(0, 255, 136, 0.06)'
                  e.currentTarget.style.borderColor = 'rgba(0, 255, 136, 0.25)'
                }}
              >
                ▸ START NEW CHAT
              </button>
            </div>
          )}

          {/* Initializing spinner — agent is booting up */}
          {isInitializing && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                flex: 1,
                minHeight: '120px',
              }}
            >
              <div style={{
                width: '24px',
                height: '24px',
                border: '2px solid rgba(0, 255, 136, 0.15)',
                borderTop: '2px solid #00ff88',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
              <div style={{
                color: 'var(--color-terminal-amber)',
                fontSize: '10px',
                letterSpacing: '0.08em',
                fontWeight: 700,
              }}>
                BOOTING AGENT\u2026
              </div>
              <div style={{
                color: 'var(--color-terminal-dim)',
                fontSize: '9px',
                letterSpacing: '0.04em',
                opacity: 0.5,
              }}>
                READING WORKSPACE DATA
              </div>
            </div>
          )}

          {/* Active session with no messages yet */}
          {activeSessionId && messages.length === 0 && !isStreaming && !isInitializing && (
            <div
              style={{
                color: 'var(--color-terminal-dim)',
                fontSize: '10px',
                letterSpacing: '0.06em',
                opacity: 0.5,
                textAlign: 'center',
                marginTop: '24px',
              }}
            >
              AGENT READY — ASK A QUESTION
            </div>
          )}

          {messages.map((msg: ChatMessage, idx: number) => (
            <MessageBubble key={idx} message={msg} />
          ))}

          {/* Thinking / activity indicator */}
          {isStreaming && (thinking.isThinking || !streamingText) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '9px', color: 'var(--color-terminal-amber)', letterSpacing: '0.1em', fontWeight: 700 }}>
                AI ▸
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px', letterSpacing: '0.05em' }}>
                  {thinking.activity ?? 'Connecting...'}
                </span>
                <span style={{ display: 'inline-block', color: 'var(--color-terminal-amber)', animation: 'blink 1s step-end infinite', fontSize: '10px' }}>
                  ●
                </span>
              </div>
              {thinking.steps.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                  {thinking.steps.slice(-5).map((step, i) => (
                    <div key={i} style={{ fontSize: '9px', color: 'var(--color-terminal-dim)', opacity: 0.6, letterSpacing: '0.03em' }}>
                      ✓ {step.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Streaming text */}
          {isStreaming && streamingText && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '9px', color: 'var(--color-terminal-amber)', letterSpacing: '0.1em', fontWeight: 700 }}>
                AI ▸
              </span>
              <div className="chat-markdown" style={{ color: 'var(--color-terminal-text)', fontSize: '11px', lineHeight: '1.6', wordBreak: 'break-word' }}>
                <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                  {streamingText}
                </ReactMarkdown>
                <span style={{ display: 'inline-block', color: 'var(--color-terminal-amber)', animation: 'blink 1s step-end infinite', marginLeft: '1px', fontSize: '13px', lineHeight: 1 }}>
                  ▊
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ── Error display ── */}
        {error && (
          <div
            style={{
              padding: '6px 12px',
              color: 'var(--color-terminal-red, #f87171)',
              fontSize: '10px',
              letterSpacing: '0.04em',
              borderTop: '1px solid var(--color-terminal-border)',
              flexShrink: 0,
            }}
          >
            ⚠ {error}
          </div>
        )}

        {/* ── Input area (only when session active or streaming) ── */}
        {(activeSessionId || isStreaming) && (
        <div
          style={{
            flexShrink: 0,
            borderTop: '1px solid var(--color-terminal-border)',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {selectedFile && (
            <div
              style={{
                fontSize: '9px',
                color: 'var(--color-terminal-amber)',
                letterSpacing: '0.05em',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>📎</span>
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}
              >
                {selectedFile.name}
              </span>
              <button
                onClick={() => setSelectedFile(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-terminal-dim)',
                  fontFamily: MONO_FONT,
                  fontSize: '11px',
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          )}

          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              onMouseEnter={() => setAttachHovered(true)}
              onMouseLeave={() => setAttachHovered(false)}
              disabled={isStreaming || isInitializing}
              title="Attach image"
              style={{
                background: 'none',
                border: 'none',
                cursor: isStreaming || isInitializing ? 'not-allowed' : 'pointer',
                color: attachHovered && !isStreaming && !isInitializing ? 'var(--color-terminal-amber)' : 'var(--color-terminal-dim)',
                fontFamily: MONO_FONT,
                fontSize: '14px',
                padding: '4px 2px',
                flexShrink: 0,
                opacity: isStreaming || isInitializing ? 0.4 : 1,
                transition: 'color 0.1s ease',
                lineHeight: 1,
              }}
            >
              📎
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />

            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isStreaming || isInitializing}
              placeholder="ASK ABOUT MARKET CONDITIONS..."
              rows={2}
              style={{
                flex: 1,
                background: 'var(--color-terminal-panel, #0d0d0d)',
                border: '1px solid var(--color-terminal-border)',
                color: isStreaming ? 'var(--color-terminal-dim)' : 'var(--color-terminal-text)',
                fontFamily: MONO_FONT,
                fontSize: '11px',
                padding: '6px 8px',
                resize: 'none',
                letterSpacing: '0.02em',
                lineHeight: '1.5',
                outline: 'none',
              }}
            />

            {isStreaming ? (
              <button
                onClick={cancelResponse}
                onMouseEnter={() => setCancelHovered(true)}
                onMouseLeave={() => setCancelHovered(false)}
                title="Cancel response (kill agent)"
                style={{
                  background: cancelHovered ? 'rgba(248, 113, 113, 0.12)' : 'none',
                  border: '1px solid var(--color-terminal-red, #f87171)',
                  cursor: 'pointer',
                  color: cancelHovered ? '#fff' : 'var(--color-terminal-red, #f87171)',
                  fontFamily: MONO_FONT,
                  fontSize: '10px',
                  padding: '6px 10px',
                  flexShrink: 0,
                  letterSpacing: '0.06em',
                  fontWeight: 700,
                  transition: 'all 0.1s ease',
                  lineHeight: 1,
                }}
              >
                ■ STOP
              </button>
            ) : (
              <button
                onClick={handleSend}
                onMouseEnter={() => setSendHovered(true)}
                onMouseLeave={() => setSendHovered(false)}
                disabled={!inputText.trim()}
                title="Send (Enter)"
                style={{
                  background: 'none',
                  border: '1px solid var(--color-terminal-border)',
                  cursor: !inputText.trim() ? 'not-allowed' : 'pointer',
                  color:
                    sendHovered && inputText.trim()
                      ? 'var(--color-terminal-amber)'
                      : 'var(--color-terminal-dim)',
                  fontFamily: MONO_FONT,
                  fontSize: '14px',
                  padding: '6px 10px',
                  flexShrink: 0,
                  opacity: !inputText.trim() ? 0.4 : 1,
                  transition: 'color 0.1s ease',
                  lineHeight: 1,
                }}
              >
                →
              </button>
            )}
          </div>
        </div>
        )}
      </div>
    </>
  )
}

// ── MessageBubble ──────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const prefixColor = isUser ? 'var(--color-terminal-green, #4ade80)' : 'var(--color-terminal-amber)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {isUser ? (
        <span style={{ fontSize: '9px', color: prefixColor, letterSpacing: '0.1em', fontWeight: 700 }}>
          USER ▸
        </span>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            fontSize: '9px',
            color: 'var(--color-terminal-amber)',
            letterSpacing: '0.1em',
            fontWeight: 700,
          }}>
            AI ▸
          </span>
          {message.modelId && (
            <span style={{
              fontSize: '8px',
              color: 'var(--color-terminal-dim)',
              letterSpacing: '0.03em',
              opacity: 0.6,
            }}>
              {message.modelId.split('/').pop()}
            </span>
          )}
        </div>
      )}
      {/* Collapsible thinking/reasoning section for assistant messages */}
      {!isUser && message.thinkingSteps && message.thinkingSteps.length > 0 && (
        <details style={{ marginTop: '4px' }}>
          <summary
            style={{
              fontSize: '9px',
              color: 'rgba(255, 255, 255, 0.45)',
              letterSpacing: '0.06em',
              cursor: 'pointer',
              userSelect: 'none',
              listStyle: 'none',
            }}
          >
            <span style={{ marginRight: '4px' }}>▸</span>
            {message.thinkingSteps.length} reasoning step{message.thinkingSteps.length !== 1 ? 's' : ''}
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px', paddingLeft: '8px', borderLeft: '1px solid rgba(255, 255, 255, 0.08)' }}>
            {message.thinkingSteps.map((step, i) => (
              <div key={i} style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.40)', letterSpacing: '0.03em' }}>
                ✓ {step.label}
              </div>
            ))}
          </div>
        </details>
      )}
      {isUser ? (
        <div style={{ color: 'var(--color-terminal-text)', fontSize: '11px', lineHeight: '1.6', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {message.content}
        </div>
      ) : (
        <div className="chat-markdown" style={{ color: 'var(--color-terminal-text)', fontSize: '11px', lineHeight: '1.6', wordBreak: 'break-word' }}>
          <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
            {message.content}
          </ReactMarkdown>
        </div>
      )}
      {message.attachments && message.attachments.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
          {message.attachments.map((att, i) => (
            <span key={i} style={{ fontSize: '9px', color: 'var(--color-terminal-dim)', border: '1px solid var(--color-terminal-border)', padding: '1px 5px', letterSpacing: '0.04em' }}>
              📎 {att.name}
            </span>
          ))}
        </div>
      )}
      <span style={{ fontSize: '9px', color: 'var(--color-terminal-dim)', opacity: 0.5, letterSpacing: '0.04em' }}>
        {new Date(message.timestamp).toLocaleTimeString()}
      </span>
    </div>
  )
}
