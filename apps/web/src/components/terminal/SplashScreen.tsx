'use client'

import { useEffect, useState, useRef } from 'react'

interface SplashScreenProps {
  onComplete: () => void
}

const BOOT_LINES = [
  { text: 'OCULUS TRADING TERMINAL v0.1.0', color: '#e8e8e8' },
  { text: 'INITIALIZING INTELLIGENCE ENGINE...', color: '#888888' },
  { text: 'CONNECTING TO MARKET DATA FEEDS...', color: '#888888' },
  { text: 'LOADING ASSET CONFIGURATION...', color: '#888888' },
  { text: 'SYSTEM READY.', color: '#00ff88' },
]

type Phase = 'blank' | 'scanline' | 'logo' | 'boot' | 'progress' | 'fadeout'

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [phase, setPhase] = useState<Phase>('blank')
  const [visibleLines, setVisibleLines] = useState(0)
  const [showCursor, setShowCursor] = useState(false)
  const [progressWidth, setProgressWidth] = useState(0)
  const [opacity, setOpacity] = useState(1)
  const completedRef = useRef(false)

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []

    // Phase 1 → scanline
    timers.push(setTimeout(() => setPhase('scanline'), 400))
    // Phase 2 → logo
    timers.push(setTimeout(() => setPhase('logo'), 1000))
    // Phase 3 → boot text
    timers.push(setTimeout(() => {
      setPhase('boot')
      BOOT_LINES.forEach((_, i) => {
        timers.push(setTimeout(() => {
          setVisibleLines(i + 1)
          if (i === BOOT_LINES.length - 1) {
            setShowCursor(true)
          }
        }, i * 200))
      })
    }, 1600))
    // Phase 4 → progress bar
    timers.push(setTimeout(() => {
      setPhase('progress')
      setShowCursor(false)
      // Small delay so React can render 0 width, then animate to 100
      timers.push(setTimeout(() => setProgressWidth(100), 50))
    }, 2600))
    // Phase 5 → fadeout
    timers.push(setTimeout(() => {
      setPhase('fadeout')
      setOpacity(0)
    }, 3200))
    // Done
    timers.push(setTimeout(() => {
      if (!completedRef.current) {
        completedRef.current = true
        onComplete()
      }
    }, 3500))

    return () => timers.forEach(clearTimeout)
  }, [onComplete])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#0a0a0a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "ui-monospace, 'SF Mono', 'JetBrains Mono', monospace",
        opacity,
        transition: phase === 'fadeout' ? 'opacity 0.3s ease-out' : undefined,
        overflow: 'hidden',
      }}
    >
      {/* Scanlines overlay — always on */}
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

      {/* Scanline boot sweep */}
      {phase === 'scanline' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 2,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              height: '60px',
              background:
                'linear-gradient(to bottom, transparent, rgba(0,255,136,0.06) 40%, rgba(0,255,136,0.04), transparent)',
              animation: 'scanSweep 0.6s linear forwards',
            }}
          />
        </div>
      )}

      {/* Main content */}
      <div
        style={{
          position: 'relative',
          zIndex: 3,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '28px',
          width: '360px',
        }}
      >
        {/* Logo */}
        {(phase === 'logo' || phase === 'boot' || phase === 'progress' || phase === 'fadeout') && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px',
              animation: phase === 'logo' ? 'logoIn 0.5s ease-out forwards' : undefined,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Oculus"
              style={{
                height: '80px',
                width: 'auto',
                filter: 'drop-shadow(0 0 20px rgba(0, 255, 136, 0.4)) drop-shadow(0 0 40px rgba(0, 255, 136, 0.15))',
              }}
            />
            {/* Divider line */}
            <div
              style={{
                width: '100%',
                height: '1px',
                background: 'linear-gradient(to right, transparent, rgba(0,255,136,0.3) 30%, rgba(0,255,136,0.3) 70%, transparent)',
              }}
            />
          </div>
        )}

        {/* Boot text */}
        {(phase === 'boot' || phase === 'progress' || phase === 'fadeout') && (
          <div
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '5px',
            }}
          >
            {BOOT_LINES.slice(0, visibleLines).map((line, i) => (
              <div
                key={i}
                style={{
                  fontSize: '11px',
                  color: line.color,
                  letterSpacing: '0.04em',
                  fontWeight: i === 0 ? 600 : 400,
                  opacity: 0,
                  animation: 'lineIn 0.15s ease-out forwards',
                }}
              >
                {i === 0 && (
                  <span style={{ color: '#00ff88', marginRight: '8px' }}>▸</span>
                )}
                {line.text}
              </div>
            ))}
            {showCursor && (
              <span
                style={{
                  fontSize: '11px',
                  color: '#00ff88',
                  animation: 'blink 0.8s step-end infinite',
                }}
              >
                ▌
              </span>
            )}
          </div>
        )}

        {/* Progress bar */}
        {(phase === 'progress' || phase === 'fadeout') && (
          <div
            style={{
              width: '100%',
              height: '2px',
              background: 'rgba(0,255,136,0.12)',
              borderRadius: '1px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progressWidth}%`,
                background: 'linear-gradient(to right, rgba(0,255,136,0.6), #00ff88)',
                boxShadow: '0 0 8px rgba(0, 255, 136, 0.6)',
                transition: 'width 0.55s linear',
                borderRadius: '1px',
              }}
            />
          </div>
        )}

        {/* Corner brackets — decorative */}
        <CornerBrackets visible={phase !== 'blank' && phase !== 'scanline'} />
      </div>

      {/* Bottom status line */}
      {(phase === 'boot' || phase === 'progress' || phase === 'fadeout') && (
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
          <span style={{ color: '#333333' }}>NOT FINANCIAL ADVICE</span>
          <span>BUILD 0001</span>
        </div>
      )}

      <style>{`
        @keyframes scanSweep {
          from { transform: translateY(-60px); }
          to   { transform: translateY(100vh); }
        }
        @keyframes logoIn {
          from { opacity: 0; transform: scale(0.92); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes lineIn {
          from { opacity: 0; transform: translateX(-6px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        @keyframes bracketIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </div>
  )
}

function CornerBrackets({ visible }: { visible: boolean }) {
  if (!visible) return null
  const size = 12
  const thickness = 1
  const color = 'rgba(0,255,136,0.25)'
  const corner = (top: boolean, left: boolean) => ({
    position: 'absolute' as const,
    width: size,
    height: size,
    borderTop: top ? `${thickness}px solid ${color}` : 'none',
    borderBottom: !top ? `${thickness}px solid ${color}` : 'none',
    borderLeft: left ? `${thickness}px solid ${color}` : 'none',
    borderRight: !left ? `${thickness}px solid ${color}` : 'none',
    ...(top ? { top: -20 } : { bottom: -20 }),
    ...(left ? { left: -16 } : { right: -16 }),
    animation: 'bracketIn 0.3s ease-out forwards',
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
