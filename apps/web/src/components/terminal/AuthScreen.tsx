'use client'

import { useState, useRef, useCallback } from 'react'

interface AuthScreenProps {
  onAuthenticated: () => void
}

type Mode = 'login' | 'register'
type RegisterPhase = 'upload' | 'success'

const FONT = "ui-monospace, 'SF Mono', 'JetBrains Mono', monospace"
const BG = '#0a0a0a'
const GREEN = '#00ff88'
const AMBER = '#e8a829'
const TEXT = '#e8e8e8'
const DIM = '#888888'
const ERROR_COLOR = '#ff4444'
const BORDER = 'rgba(0,255,136,0.15)'
const BORDER_BRIGHT = 'rgba(0,255,136,0.3)'

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>('login')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Login state
  const [passwordHash, setPasswordHash] = useState('')

  // Register state
  const [authJsonContent, setAuthJsonContent] = useState('')
  const [authJsonFile, setAuthJsonFile] = useState<File | null>(null)
  const [registerPhase, setRegisterPhase] = useState<RegisterPhase>('upload')
  const [returnedHash, setReturnedHash] = useState('')
  const [copied, setCopied] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [inputMode, setInputMode] = useState<'file' | 'paste'>('file')

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Login ──────────────────────────────────────────────────────────────────

  const handleLogin = useCallback(async () => {
    if (!passwordHash.trim()) return
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passwordHash: passwordHash.trim() }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Authentication failed')
      }

      onAuthenticated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setIsLoading(false)
    }
  }, [passwordHash, onAuthenticated])

  // ── Register ───────────────────────────────────────────────────────────────

  const handleRegister = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      let res: Response

      if (inputMode === 'file' && authJsonFile) {
        // File upload mode
        const formData = new FormData()
        formData.append('auth.json', authJsonFile)
        res = await fetch('/api/auth/register', {
          method: 'POST',
          body: formData,
        })
      } else if (inputMode === 'paste' && authJsonContent.trim()) {
        // JSON paste mode
        res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ authJson: authJsonContent.trim() }),
        })
      } else {
        setError('No auth.json provided')
        setIsLoading(false)
        return
      }

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Registration failed')
      }

      const data = await res.json()
      setReturnedHash(data.passwordHash)
      setRegisterPhase('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setIsLoading(false)
    }
  }, [inputMode, authJsonFile, authJsonContent])

  // ── File handling ─────────────────────────────────────────────────────────

  const handleFileSelect = useCallback((file: File) => {
    setAuthJsonFile(file)
    setError(null)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)
      if (e.dataTransfer.files.length > 0) {
        handleFileSelect(e.dataTransfer.files[0])
      }
    },
    [handleFileSelect],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(returnedHash)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [returnedHash])

  const switchMode = useCallback(() => {
    setMode((m) => (m === 'login' ? 'register' : 'login'))
    setError(null)
    setPasswordHash('')
    setAuthJsonContent('')
    setAuthJsonFile(null)
    setRegisterPhase('upload')
    setReturnedHash('')
  }, [])

  const canRegister =
    (inputMode === 'file' && authJsonFile !== null) ||
    (inputMode === 'paste' && authJsonContent.trim().length > 0)

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: BG,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: FONT,
        color: TEXT,
        overflow: 'hidden',
      }}
    >
      {/* Scanlines overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.18) 2px, rgba(0,0,0,0.18) 4px)',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* Main content */}
      <div
        style={{
          position: 'relative',
          zIndex: 3,
          width: '100%',
          maxWidth: '480px',
          padding: '0 24px',
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '32px',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Oculus"
            style={{
              height: '64px',
              width: 'auto',
              filter:
                'drop-shadow(0 0 20px rgba(0, 255, 136, 0.4)) drop-shadow(0 0 40px rgba(0, 255, 136, 0.15))',
            }}
          />
          <div
            style={{
              width: '100%',
              height: '1px',
              background: `linear-gradient(to right, transparent, ${BORDER_BRIGHT} 30%, ${BORDER_BRIGHT} 70%, transparent)`,
            }}
          />
          <div
            style={{
              fontSize: '10px',
              letterSpacing: '0.15em',
              color: DIM,
              textTransform: 'uppercase',
            }}
          >
            {mode === 'login' ? 'SESSION AUTHENTICATION' : 'NEW SESSION REGISTRATION'}
          </div>
        </div>

        {/* ── LOGIN MODE ──────────────────────────────────────────────────── */}
        {mode === 'login' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <label
              style={{
                fontSize: '11px',
                letterSpacing: '0.08em',
                color: GREEN,
                fontWeight: 600,
              }}
            >
              ▸ ENTER PASSWORD HASH
            </label>
            <input
              type="text"
              value={passwordHash}
              onChange={(e) => setPasswordHash(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleLogin()
              }}
              placeholder="Paste your base64url password hash..."
              disabled={isLoading}
              spellCheck={false}
              autoComplete="off"
              style={{
                width: '100%',
                padding: '12px 14px',
                background: 'rgba(0,255,136,0.03)',
                border: `1px solid ${BORDER}`,
                color: TEXT,
                fontFamily: FONT,
                fontSize: '13px',
                letterSpacing: '0.02em',
                outline: 'none',
                opacity: isLoading ? 0.5 : 1,
                boxSizing: 'border-box',
              }}
            />
            <button
              onClick={handleLogin}
              disabled={isLoading || !passwordHash.trim()}
              style={{
                padding: '10px',
                background: passwordHash.trim() ? GREEN : 'rgba(0,255,136,0.15)',
                color: BG,
                border: 'none',
                fontFamily: FONT,
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                cursor: isLoading || !passwordHash.trim() ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.5 : 1,
              }}
            >
              {isLoading ? 'AUTHENTICATING...' : 'AUTHENTICATE'}
            </button>
          </div>
        )}

        {/* ── REGISTER MODE ───────────────────────────────────────────────── */}
        {mode === 'register' && registerPhase === 'upload' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <label
              style={{
                fontSize: '11px',
                letterSpacing: '0.08em',
                color: GREEN,
                fontWeight: 600,
              }}
            >
              ▸ PROVIDE AUTH.JSON
            </label>

            {/* Info box */}
            <div
              style={{
                padding: '10px 14px',
                background: 'rgba(0,255,136,0.03)',
                border: `1px solid ${BORDER}`,
                fontSize: '10px',
                color: DIM,
                lineHeight: '1.6',
              }}
            >
              Upload or paste your OpenCode auth.json file.
              <br />
              <span style={{ color: 'rgba(0,255,136,0.5)' }}>
                Location: ~/.local/share/opencode/auth.json
              </span>
            </div>

            {/* Input mode toggle */}
            <div style={{ display: 'flex', gap: '0' }}>
              <button
                onClick={() => setInputMode('file')}
                style={{
                  flex: 1,
                  padding: '8px',
                  background: inputMode === 'file' ? 'rgba(0,255,136,0.08)' : 'transparent',
                  border: `1px solid ${inputMode === 'file' ? GREEN : BORDER}`,
                  borderRight: 'none',
                  color: inputMode === 'file' ? GREEN : DIM,
                  fontFamily: FONT,
                  fontSize: '10px',
                  letterSpacing: '0.08em',
                  cursor: 'pointer',
                  fontWeight: inputMode === 'file' ? 700 : 400,
                }}
              >
                FILE UPLOAD
              </button>
              <button
                onClick={() => setInputMode('paste')}
                style={{
                  flex: 1,
                  padding: '8px',
                  background: inputMode === 'paste' ? 'rgba(0,255,136,0.08)' : 'transparent',
                  border: `1px solid ${inputMode === 'paste' ? GREEN : BORDER}`,
                  color: inputMode === 'paste' ? GREEN : DIM,
                  fontFamily: FONT,
                  fontSize: '10px',
                  letterSpacing: '0.08em',
                  cursor: 'pointer',
                  fontWeight: inputMode === 'paste' ? 700 : 400,
                }}
              >
                PASTE JSON
              </button>
            </div>

            {/* File upload mode */}
            {inputMode === 'file' && (
              <>
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  style={{
                    border: `1px dashed ${isDragOver ? GREEN : BORDER_BRIGHT}`,
                    background: isDragOver ? 'rgba(0,255,136,0.06)' : 'rgba(0,255,136,0.02)',
                    padding: '24px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {authJsonFile ? (
                    <div style={{ fontSize: '12px', color: GREEN }}>
                      ✓ {authJsonFile.name}{' '}
                      <span style={{ color: DIM, fontSize: '10px' }}>
                        ({(authJsonFile.size / 1024).toFixed(1)}KB)
                      </span>
                    </div>
                  ) : (
                    <>
                      <div
                        style={{
                          fontSize: '11px',
                          color: isDragOver ? GREEN : DIM,
                          marginBottom: '8px',
                        }}
                      >
                        {isDragOver ? 'DROP AUTH.JSON HERE' : 'DRAG & DROP AUTH.JSON HERE'}
                      </div>
                      <div style={{ fontSize: '10px', color: 'rgba(136,136,136,0.6)' }}>
                        or click to browse
                      </div>
                    </>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleFileSelect(e.target.files[0])
                    e.target.value = ''
                  }}
                />

                {authJsonFile && (
                  <button
                    onClick={() => setAuthJsonFile(null)}
                    style={{
                      padding: '6px',
                      background: 'transparent',
                      border: `1px solid rgba(255,68,68,0.25)`,
                      color: ERROR_COLOR,
                      fontFamily: FONT,
                      fontSize: '10px',
                      letterSpacing: '0.06em',
                      cursor: 'pointer',
                      opacity: 0.7,
                    }}
                  >
                    REMOVE FILE
                  </button>
                )}
              </>
            )}

            {/* Paste mode */}
            {inputMode === 'paste' && (
              <textarea
                value={authJsonContent}
                onChange={(e) => {
                  setAuthJsonContent(e.target.value)
                  setError(null)
                }}
                placeholder='Paste auth.json contents here...'
                spellCheck={false}
                style={{
                  width: '100%',
                  minHeight: '120px',
                  padding: '12px 14px',
                  background: 'rgba(0,255,136,0.03)',
                  border: `1px solid ${BORDER}`,
                  color: TEXT,
                  fontFamily: FONT,
                  fontSize: '11px',
                  letterSpacing: '0.02em',
                  outline: 'none',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                  lineHeight: '1.5',
                }}
              />
            )}

            {/* Submit */}
            <button
              onClick={handleRegister}
              disabled={isLoading || !canRegister}
              style={{
                padding: '10px',
                background: canRegister ? GREEN : 'rgba(0,255,136,0.15)',
                color: BG,
                border: 'none',
                fontFamily: FONT,
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                cursor: isLoading || !canRegister ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.5 : 1,
              }}
            >
              {isLoading ? 'ENCRYPTING...' : 'ENCRYPT & REGISTER'}
            </button>
          </div>
        )}

        {/* ── REGISTER SUCCESS ────────────────────────────────────────────── */}
        {mode === 'register' && registerPhase === 'success' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                fontSize: '11px',
                letterSpacing: '0.08em',
                color: GREEN,
                fontWeight: 600,
              }}
            >
              ▸ REGISTRATION COMPLETE
            </div>

            {/* Warning */}
            <div
              style={{
                padding: '12px 14px',
                background: 'rgba(232,168,41,0.08)',
                border: `1px solid rgba(232,168,41,0.3)`,
                fontSize: '11px',
                color: AMBER,
                lineHeight: '1.6',
                fontWeight: 600,
              }}
            >
              ⚠ SAVE THIS PASSWORD HASH — IT IS YOUR ONLY LOGIN KEY AND CANNOT BE RECOVERED
            </div>

            {/* Hash display */}
            <div
              style={{
                display: 'flex',
                alignItems: 'stretch',
                border: `1px solid ${BORDER_BRIGHT}`,
                background: 'rgba(0,0,0,0.4)',
              }}
            >
              <div
                style={{
                  flex: 1,
                  padding: '14px',
                  fontSize: '14px',
                  color: GREEN,
                  wordBreak: 'break-all',
                  lineHeight: '1.5',
                  letterSpacing: '0.03em',
                }}
              >
                {returnedHash}
              </div>
              <button
                onClick={handleCopy}
                style={{
                  padding: '14px 16px',
                  background: copied ? 'rgba(0,255,136,0.15)' : 'rgba(0,255,136,0.05)',
                  border: 'none',
                  borderLeft: `1px solid ${BORDER}`,
                  color: copied ? GREEN : DIM,
                  fontFamily: FONT,
                  fontSize: '10px',
                  letterSpacing: '0.08em',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                }}
              >
                {copied ? 'COPIED ✓' : 'COPY'}
              </button>
            </div>

            <button
              onClick={onAuthenticated}
              style={{
                padding: '10px',
                background: GREEN,
                color: BG,
                border: 'none',
                fontFamily: FONT,
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                cursor: 'pointer',
                marginTop: '8px',
              }}
            >
              CONTINUE TO TERMINAL ▸
            </button>
          </div>
        )}

        {/* ── Error ───────────────────────────────────────────────────────── */}
        {error && (
          <div
            style={{
              marginTop: '12px',
              padding: '10px 14px',
              background: 'rgba(255,68,68,0.08)',
              border: '1px solid rgba(255,68,68,0.25)',
              fontSize: '11px',
              color: ERROR_COLOR,
              lineHeight: '1.5',
            }}
          >
            {error}
          </div>
        )}

        {/* ── Mode toggle ─────────────────────────────────────────────────── */}
        {registerPhase !== 'success' && (
          <div
            style={{
              marginTop: '20px',
              textAlign: 'center',
              fontSize: '10px',
              color: DIM,
            }}
          >
            {mode === 'login' ? 'No account? ' : 'Have a hash? '}
            <button
              type="button"
              onClick={switchMode}
              disabled={isLoading}
              style={{
                background: 'none',
                border: 'none',
                color: GREEN,
                fontFamily: FONT,
                fontSize: '10px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                textDecoration: 'underline',
                opacity: isLoading ? 0.5 : 1,
                letterSpacing: '0.04em',
              }}
            >
              {mode === 'login' ? 'Upload auth.json' : 'Login'}
            </button>
          </div>
        )}

        {/* Corner brackets */}
        <CornerBrackets />
      </div>

      {/* Bottom status line */}
      <div
        style={{
          position: 'absolute',
          bottom: '24px',
          left: 0,
          right: 0,
          zIndex: 3,
          display: 'flex',
          justifyContent: 'space-between',
          padding: '0 24px',
          fontSize: '10px',
          color: '#555555',
          letterSpacing: '0.06em',
        }}
      >
        <span>OCULUS © 2025</span>
        <span style={{ color: '#333333' }}>ENCRYPTED WITH AES-256-GCM</span>
        <span>BUILD 0001</span>
      </div>
    </div>
  )
}

function CornerBrackets() {
  const size = 12
  const thickness = 1
  const color = 'rgba(0,255,136,0.25)'
  const corner = (top: boolean, left: boolean): React.CSSProperties => ({
    position: 'absolute',
    width: size,
    height: size,
    borderTop: top ? `${thickness}px solid ${color}` : 'none',
    borderBottom: !top ? `${thickness}px solid ${color}` : 'none',
    borderLeft: left ? `${thickness}px solid ${color}` : 'none',
    borderRight: !left ? `${thickness}px solid ${color}` : 'none',
    ...(top ? { top: -20 } : { bottom: -20 }),
    ...(left ? { left: -16 } : { right: -16 }),
  })

  return (
    <>
      <div style={corner(true, true)} />
      <div style={corner(true, false)} />
      <div style={corner(false, true)} />
      <div style={corner(false, false)} />
    </>
  )
}
