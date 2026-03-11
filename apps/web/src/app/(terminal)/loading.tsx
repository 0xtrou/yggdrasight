'use client'

export default function Loading() {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-terminal-bg)',
        fontFamily: 'var(--font-mono)',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            color: 'var(--color-terminal-accent)',
            fontSize: '11px',
            letterSpacing: '0.1em',
            animation: 'terminalPulse 1.5s ease-in-out infinite',
          }}
        >
          ◈ LOADING
        </div>
        <style>{`
          @keyframes terminalPulse {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 1; }
          }
        `}</style>
      </div>
    </div>
  )
}
