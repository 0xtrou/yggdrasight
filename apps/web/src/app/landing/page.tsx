'use client'

import { useEffect, useState } from 'react'

// ── Design Tokens ─────────────────────────────────────────────────────────────
const BG     = '#0a0a0a'
const SURFACE = '#111111'
const PANEL   = '#161616'
const BORDER  = '#2a2a2a'
const TEXT    = '#e8e8e8'
const MUTED   = '#888888'
const DIM     = '#555555'
const GREEN   = '#00ff88'
const AMBER   = '#ffaa00'
const BLUE    = '#4488ff'
const PURPLE  = '#aa66ff'
const MONO    = "ui-monospace, 'SF Mono', 'JetBrains Mono', monospace"

// ── Global Styles ─────────────────────────────────────────────────────────────
function PageStyles() {
  return (
    <style>{`
      *, *::before, *::after { box-sizing: border-box; }
      html { scroll-behavior: smooth; }
      a { text-decoration: none; }
      body { margin: 0; }

      /* ── Scroll reveal ── */
      .yr {
        opacity: 0;
        transform: translateY(28px);
        transition: opacity 0.75s ease-out, transform 0.75s ease-out;
      }
      .yr.yv { opacity: 1; transform: translateY(0); }
      .yd1 { transition-delay: 0.05s; }
      .yd2 { transition-delay: 0.15s; }
      .yd3 { transition-delay: 0.25s; }
      .yd4 { transition-delay: 0.35s; }
      .yd5 { transition-delay: 0.45s; }
      .yd6 { transition-delay: 0.55s; }

      /* ── Typewriter ── */
      .ytw {
        overflow: hidden;
        white-space: nowrap;
        border-right: 1.5px solid ${GREEN};
        max-width: 0;
        animation:
          yTW 1.8s steps(41, end) 0.9s forwards,
          yBC 0.72s step-end 2.8s infinite;
      }

      /* ── Feature cards ── */
      .ycard {
        transition: border-color 0.22s ease, box-shadow 0.22s ease, transform 0.22s ease;
      }
      .ycard:hover {
        border-color: rgba(0,255,136,0.35) !important;
        box-shadow:
          0 0 0 1px rgba(0,255,136,0.08),
          0 0 32px rgba(0,255,136,0.14),
          0 12px 40px rgba(0,0,0,0.6) !important;
        transform: translateY(-4px);
      }

      /* ── CTA button ── */
      .ycta {
        transition: all 0.2s ease;
        cursor: pointer;
      }
      .ycta:hover {
        background: rgba(0,255,136,0.09) !important;
        border-color: ${GREEN} !important;
        box-shadow:
          0 0 0 1px rgba(0,255,136,0.2),
          0 0 32px rgba(0,255,136,0.32),
          0 0 64px rgba(0,255,136,0.12) !important;
        color: ${GREEN} !important;
      }

      /* ── Misc ── */
      .ylink { transition: color 0.15s ease; }
      .ylink:hover { color: #c0c0c0 !important; }

      .ybadge { transition: all 0.15s ease; }
      .ybadge:hover {
        border-color: rgba(0,255,136,0.4) !important;
        background: rgba(0,255,136,0.07) !important;
        color: ${GREEN} !important;
      }

      .yarchnode { transition: box-shadow 0.2s ease, transform 0.2s ease; }
      .yarchnode:hover {
        box-shadow: 0 0 24px rgba(0,255,136,0.18) !important;
        transform: translateY(-2px);
      }

      /* ── Keyframes ── */
      @keyframes yTW  { to { max-width: 520px; } }
      @keyframes yBC  { 0%,100% { border-right-color: ${GREEN}; } 50% { border-right-color: transparent; } }
      @keyframes yGrid {
        from { background-position: 0 0; }
        to   { background-position: 0 -60px; }
      }
      @keyframes yGlow {
        0%,100% {
          filter:
            drop-shadow(0 0 18px rgba(0,255,136,0.5))
            drop-shadow(0 0 40px rgba(0,255,136,0.22));
        }
        50% {
          filter:
            drop-shadow(0 0 36px rgba(0,255,136,0.85))
            drop-shadow(0 0 80px rgba(0,255,136,0.45));
        }
      }
      @keyframes yBounce {
        0%,100% { transform: translateY(0);  opacity: 0.35; }
        50%      { transform: translateY(9px); opacity: 0.85; }
      }
      @keyframes yLive {
        0%,100% {
          opacity: 1;
          box-shadow: 0 0 6px ${GREEN}, 0 0 12px rgba(0,255,136,0.5);
        }
        50% { opacity: 0.2; box-shadow: none; }
      }
      @keyframes yRun {
        0%,100% { opacity: 1; }
        50%      { opacity: 0.25; }
      }
      @keyframes yFlow {
        0%   { transform: translateY(-6px); opacity: 0; }
        15%  { opacity: 1; }
        85%  { opacity: 1; }
        100% { transform: translateY(54px); opacity: 0; }
      }
      @keyframes yScan {
        0%,87%  { transform: translateY(-90px); opacity: 0; }
        88%     { opacity: 0; transform: translateY(-90px); }
        90%     { opacity: 1; }
        100%    { transform: translateY(105vh); opacity: 0; }
      }
      @keyframes yGlitch {
        0%,93%,100% { transform: none; }
        94%  { transform: translateX(-1.5px) skewX(-0.4deg); }
        95.5%{ transform: translateX(1.5px)  skewX(0.4deg); }
        97%  { transform: none; }
      }
      @keyframes yFadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes yPulseRing {
        0%   { transform: scale(1);    opacity: 0.6; }
        100% { transform: scale(1.6);  opacity: 0; }
      }

      /* ── Responsive ── */
      @media (max-width: 768px) {
        .yfg   { grid-template-columns: 1fr !important; }
        .yht   { font-size: clamp(30px, 9vw, 60px) !important; letter-spacing: 0.1em !important; }
        .yngh  { display: none !important; }
        .yspad { padding-left: 20px !important; padding-right: 20px !important; }
        .ytpre { font-size: 8px !important; line-height: 1.55 !important; }
        .yamid { flex-wrap: wrap !important; gap: 8px !important; }
        .ystk  { flex-wrap: wrap !important; justify-content: center !important; }
        .ytw   { font-size: 14px !important; }
      }

      /* ── Reduced motion ── */
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation: none !important;
          transition-duration: 0.01ms !important;
        }
        .yr  { opacity: 1 !important; transform: none !important; }
        .ytw { max-width: none !important; border-right: none !important; }
      }
    `}</style>
  )
}

// ── Nav Bar ───────────────────────────────────────────────────────────────────
function NavBar({ scrolled }: { scrolled: boolean }) {
  return (
    <nav
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        height: '48px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 28px',
        background: scrolled ? 'rgba(10,10,10,0.97)' : 'rgba(10,10,10,0.55)',
        borderBottom: `1px solid ${scrolled ? BORDER : 'transparent'}`,
        backdropFilter: 'blur(16px)',
        transition: 'background 0.35s ease, border-color 0.35s ease',
        fontFamily: MONO,
      }}
    >
      {/* Brand */}
      <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', color: TEXT }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon-512x512.png"
          alt="Yggdrasight"
          style={{ height: 22, width: 22, filter: 'drop-shadow(0 0 6px rgba(0,255,136,0.55))' }}
        />
        <span
          style={{
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '0.14em',
            color: TEXT,
          }}
        >
          YGGDRASIGHT
        </span>
      </a>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <a
          href="https://github.com/0xtrou/yggdrasight"
          target="_blank"
          rel="noopener noreferrer"
          className="yngh ylink"
          style={{ fontSize: '11px', color: MUTED, letterSpacing: '0.06em', fontFamily: MONO }}
        >
          GitHub
        </a>
        <a
          href="https://terminal.yggdrasight.com"
          className="ycta"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '6px 14px',
            fontSize: '11px',
            fontFamily: MONO,
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: GREEN,
            background: 'rgba(0,255,136,0.05)',
            border: '1px solid rgba(0,255,136,0.32)',
          }}
        >
          LAUNCH TERMINAL →
        </a>
      </div>
    </nav>
  )
}

// ── Hero Section ──────────────────────────────────────────────────────────────
function HeroSection({ mounted }: { mounted: boolean }) {
  const bracketStyle = (pos: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute',
    width: 22,
    height: 22,
    zIndex: 2,
    ...pos,
  })

  return (
    <section
      style={{
        position: 'relative',
        height: '100vh',
        minHeight: '620px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {/* Animated grid */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(0,255,136,0.038) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,255,136,0.038) 1px, transparent 1px)
          `,
          backgroundSize: '52px 52px',
          animation: 'yGrid 11s linear infinite',
        }}
      />

      {/* Radial vignette — fades grid at edges */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse 65% 65% at 50% 50%, transparent 18%, ${BG} 100%)`,
        }}
      />

      {/* Bottom gradient fade into next section */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '220px',
          background: `linear-gradient(to bottom, transparent, ${BG})`,
          zIndex: 1,
        }}
      />

      {/* CRT scanlines */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.13) 2px, rgba(0,0,0,0.13) 4px)',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />

      {/* Occasional sweep scan line */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: '90px',
          background:
            'linear-gradient(to bottom, transparent, rgba(0,255,136,0.032) 40%, rgba(0,255,136,0.016), transparent)',
          animation: 'yScan 18s linear infinite',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />

      {/* Corner brackets */}
      <div
        style={bracketStyle({
          top: 24, left: 24,
          borderTop: '1px solid rgba(0,255,136,0.18)',
          borderLeft: '1px solid rgba(0,255,136,0.18)',
        })}
      />
      <div
        style={bracketStyle({
          top: 24, right: 24,
          borderTop: '1px solid rgba(0,255,136,0.18)',
          borderRight: '1px solid rgba(0,255,136,0.18)',
        })}
      />
      <div
        style={bracketStyle({
          bottom: 24, left: 24,
          borderBottom: '1px solid rgba(0,255,136,0.18)',
          borderLeft: '1px solid rgba(0,255,136,0.18)',
        })}
      />
      <div
        style={bracketStyle({
          bottom: 24, right: 24,
          borderBottom: '1px solid rgba(0,255,136,0.18)',
          borderRight: '1px solid rgba(0,255,136,0.18)',
        })}
      />

      {/* Content */}
      <div
        style={{
          position: 'relative',
          zIndex: 3,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          padding: '0 24px',
          animation: 'yFadeIn 1s ease-out 0.1s both',
        }}
      >
        {/* System label */}
        <div
          style={{
            fontFamily: MONO,
            fontSize: '10px',
            letterSpacing: '0.28em',
            color: GREEN,
            marginBottom: '32px',
            opacity: 0.65,
          }}
        >
          ▸&nbsp;&nbsp;CLASSIFIED INTELLIGENCE TERMINAL&nbsp;&nbsp;◂
        </div>

        {/* Logo with pulse ring */}
        <div style={{ position: 'relative', marginBottom: '32px' }}>
          {/* Pulse ring */}
          <div
            style={{
              position: 'absolute',
              inset: -12,
              borderRadius: '50%',
              border: '1px solid rgba(0,255,136,0.35)',
              animation: 'yPulseRing 2.4s ease-out infinite',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: -20,
              borderRadius: '50%',
              border: '1px solid rgba(0,255,136,0.18)',
              animation: 'yPulseRing 2.4s ease-out 0.8s infinite',
            }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icon-512x512.png"
            alt="Yggdrasight"
            style={{
              height: 80,
              width: 80,
              display: 'block',
              animation: 'yGlow 3.8s ease-in-out infinite',
            }}
          />
        </div>

        {/* Title */}
        <h1
          className="yht"
          style={{
            fontFamily: MONO,
            fontSize: 'clamp(42px, 8vw, 92px)',
            fontWeight: 800,
            letterSpacing: '0.24em',
            color: TEXT,
            textShadow: '0 0 80px rgba(0,255,136,0.1)',
            margin: '0 0 20px 0',
            lineHeight: 1,
            animation: 'yGlitch 14s linear 4s infinite',
          }}
        >
          YGGDRASIGHT
        </h1>

        {/* Tagline — typewriter */}
        <p
          className={mounted ? 'ytw' : ''}
          style={{
            fontFamily: MONO,
            fontSize: '17px',
            color: MUTED,
            letterSpacing: '0.05em',
            margin: '0 0 10px 0',
            ...(mounted ? {} : { opacity: 0 }),
          }}
        >
          AI-native trading intelligence terminal.
        </p>

        {/* Subtitle */}
        <p
          style={{
            fontFamily: MONO,
            fontSize: '12px',
            color: DIM,
            letterSpacing: '0.04em',
            margin: '12px 0 52px 0',
            maxWidth: '480px',
            lineHeight: 1.8,
            opacity: 0,
            animation: 'yFadeIn 0.7s ease-out 3.3s forwards',
          }}
        >
          Real-time market data.&nbsp;&nbsp;Multi-agent philosophical analysis.&nbsp;&nbsp;Bloomberg vibes.
        </p>

        {/* CTA cluster */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            opacity: 0,
            animation: 'yFadeIn 0.6s ease-out 3.6s forwards',
          }}
        >
          <a
            href="https://terminal.yggdrasight.com"
            className="ycta"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '15px 40px',
              fontFamily: MONO,
              fontSize: '13px',
              fontWeight: 700,
              letterSpacing: '0.14em',
              color: GREEN,
              background: 'rgba(0,255,136,0.06)',
              border: '1px solid rgba(0,255,136,0.42)',
            }}
          >
            LAUNCH TERMINAL →
          </a>
          <a
            href="https://github.com/0xtrou/yggdrasight"
            target="_blank"
            rel="noopener noreferrer"
            className="ylink"
            style={{
              fontFamily: MONO,
              fontSize: '11px',
              color: DIM,
              letterSpacing: '0.08em',
            }}
          >
            View on GitHub ↗
          </a>
        </div>
      </div>

      {/* Scroll indicator */}
      <div
        style={{
          position: 'absolute',
          bottom: '32px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 3,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '5px',
          opacity: 0,
          animation: 'yFadeIn 0.5s ease-out 4.4s forwards',
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: '9px',
            color: DIM,
            letterSpacing: '0.18em',
          }}
        >
          SCROLL
        </span>
        <div
          style={{
            fontFamily: MONO,
            fontSize: '15px',
            color: DIM,
            animation: 'yBounce 2.2s ease-in-out infinite',
          }}
        >
          ∨
        </div>
      </div>
    </section>
  )
}

// ── Terminal Preview Section ───────────────────────────────────────────────────
function TerminalSection() {
  return (
    <section
      style={{
        background: SURFACE,
        padding: '110px 32px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '44px',
      }}
      className="yspad"
    >
      {/* Header */}
      <div className="yr" style={{ textAlign: 'center' }}>
        <div
          style={{
            fontFamily: MONO,
            fontSize: '11px',
            color: GREEN,
            letterSpacing: '0.2em',
            marginBottom: '12px',
            opacity: 0.75,
          }}
        >
          ▸ SEE IT IN ACTION
        </div>
        <h2
          style={{
            fontFamily: MONO,
            fontSize: 'clamp(20px, 4vw, 30px)',
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: TEXT,
            margin: '0 0 8px 0',
          }}
        >
          THE TERMINAL EXPERIENCE
        </h2>
        <p
          style={{
            fontFamily: MONO,
            fontSize: '12px',
            color: DIM,
            letterSpacing: '0.04em',
          }}
        >
          Dark. Dense. Fast. Built for signal, not noise.
        </p>
      </div>

      {/* Terminal window */}
      <div
        className="ytpre yr"
        style={{
          width: '100%',
          maxWidth: '740px',
          fontFamily: MONO,
          fontSize: '12px',
          background: PANEL,
          border: `1px solid ${BORDER}`,
          boxShadow: `
            0 0 0 1px rgba(0,255,136,0.04),
            0 0 60px rgba(0,0,0,0.9),
            0 0 50px rgba(0,255,136,0.05),
            0 48px 96px rgba(0,0,0,0.7)
          `,
        }}
      >
        {/* Window chrome */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            background: SURFACE,
            borderBottom: `1px solid ${BORDER}`,
          }}
        >
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['#ff5f56', '#ffbd2e', '#27c93f'] as const).map((c) => (
              <div
                key={c}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: c,
                  opacity: 0.85,
                }}
              />
            ))}
          </div>
          <span
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: '11px',
              color: DIM,
              letterSpacing: '0.05em',
              fontFamily: MONO,
            }}
          >
            yggdrasight — intelligence — BTC/USDT
          </span>
          {/* LIVE pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: GREEN,
                animation: 'yLive 1.5s ease-in-out infinite',
              }}
            />
            <span
              style={{
                fontSize: '10px',
                color: GREEN,
                letterSpacing: '0.1em',
                fontFamily: MONO,
              }}
            >
              LIVE
            </span>
          </div>
        </div>

        {/* ASCII content */}
        <pre
          style={{
            padding: '16px 18px',
            margin: 0,
            color: MUTED,
            lineHeight: 1.65,
            overflowX: 'auto',
            fontSize: 'inherit',
            fontFamily: MONO,
          }}
        >
          <TerminalArt />
        </pre>
      </div>
    </section>
  )
}

function TerminalArt() {
  const gn = GREEN
  const am = AMBER
  const bx = '#2e2e2e'
  const dm = DIM
  const mu = MUTED

  return (
    <>
      <span style={{ color: bx }}>{'┌─────────────────────────────────────────────────────────┐'}</span>{'\n'}
      <span style={{ color: bx }}>│</span>
      <span style={{ color: gn, fontWeight: 700 }}>{'  YGGDRASIGHT  '}</span>
      <span style={{ color: bx }}>│</span>
      <span style={{ color: am }}>{'  BTC  ETH  SOL  TAO  PENDLE'}</span>
      <span style={{ color: dm }}>{'          '}</span>
      <span style={{ color: gn, animation: 'yLive 1.5s ease-in-out infinite', display: 'inline-block' }}>◉</span>
      <span style={{ color: gn }}>{' LIVE '}</span>
      <span style={{ color: bx }}>│</span>{'\n'}
      <span style={{ color: bx }}>{'├─────────────────────────────────────────────────────────┤'}</span>{'\n'}
      <span style={{ color: bx }}>│</span>
      <span style={{ color: mu }}>{'  CHART ▸ 4H         '}</span>
      <span style={{ color: bx }}>│</span>
      <span style={{ color: mu }}>{'  INTELLIGENCE                     '}</span>
      <span style={{ color: bx }}>│</span>{'\n'}
      <span style={{ color: bx }}>│</span>
      <span style={{ color: dm }}>{'                     '}</span>
      <span style={{ color: bx }}>│</span>
      <span style={{ color: dm }}>{'  ├─ Crack Mapping       '}</span>
      <span style={{ color: gn, fontWeight: 600 }}>COMPLETE</span>
      <span style={{ color: dm }}>{'  '}</span>
      <span style={{ color: bx }}>│</span>{'\n'}
      <span style={{ color: bx }}>│</span>
      <span style={{ color: gn }}>{'  ╱╲  ╱╲╱╲          '}</span>
      <span style={{ color: bx }}>│</span>
      <span style={{ color: dm }}>{'  ├─ Visibility          '}</span>
      <span style={{ color: gn, fontWeight: 600 }}>COMPLETE</span>
      <span style={{ color: dm }}>{'  '}</span>
      <span style={{ color: bx }}>│</span>{'\n'}
      <span style={{ color: bx }}>│</span>
      <span style={{ color: gn }}>{' ╱  ╲╱    ╲╱╲       '}</span>
      <span style={{ color: bx }}>│</span>
      <span style={{ color: dm }}>{'  ├─ Narrative Separator '}</span>
      <span style={{ color: gn, fontWeight: 600 }}>COMPLETE</span>
      <span style={{ color: dm }}>{'  '}</span>
      <span style={{ color: bx }}>│</span>{'\n'}
      <span style={{ color: bx }}>│</span>
      <span style={{ color: gn }}>{'              ╲╱     '}</span>
      <span style={{ color: bx }}>│</span>
      <span style={{ color: dm }}>{'  ├─ Power Vector        '}</span>
      <span style={{ color: gn, fontWeight: 600 }}>COMPLETE</span>
      <span style={{ color: dm }}>{'  '}</span>
      <span style={{ color: bx }}>│</span>{'\n'}
      <span style={{ color: bx }}>│</span>
      <span style={{ color: dm }}>{'                     '}</span>
      <span style={{ color: bx }}>│</span>
      <span style={{ color: dm }}>{'  ├─ Problem Recognition '}</span>
      <span style={{ color: gn, fontWeight: 600 }}>COMPLETE</span>
      <span style={{ color: dm }}>{'  '}</span>
      <span style={{ color: bx }}>│</span>{'\n'}
      <span style={{ color: bx }}>│</span>
      <span style={{ color: gn }}>{'  $98,420.00  '}</span>
      <span style={{ color: gn, fontWeight: 700 }}>{'+2.4%'}</span>
      <span style={{ color: dm }}>{'  '}</span>
      <span style={{ color: bx }}>│</span>
      <span style={{ color: dm }}>{'  └─ Synthesizer     ▸ '}</span>
      <span style={{ color: am, animation: 'yRun 0.9s step-end infinite', fontWeight: 700 }}>RUNNING</span>
      <span style={{ color: dm }}>{'    '}</span>
      <span style={{ color: bx }}>│</span>{'\n'}
      <span style={{ color: bx }}>{'├─────────────────────┴──────────────────────────────────┤'}</span>{'\n'}
      <span style={{ color: bx }}>│</span>
      <span style={{ color: dm }}>{'  '}</span>
      <span style={{ color: mu }}>{'ANALYSIS'}</span>
      <span style={{ color: bx }}>{'  │  '}</span>
      <span style={{ color: dm }}>Wyckoff</span>
      <span style={{ color: bx }}>{'  │  '}</span>
      <span style={{ color: dm }}>Elliott</span>
      <span style={{ color: bx }}>{'  │  '}</span>
      <span style={{ color: dm }}>Soros</span>
      <span style={{ color: bx }}>{'  │  '}</span>
      <span style={{ color: dm }}>On-chain</span>
      <span style={{ color: dm }}>{'  '}</span>
      <span style={{ color: bx }}>│</span>{'\n'}
      <span style={{ color: bx }}>{'└─────────────────────────────────────────────────────────┘'}</span>
    </>
  )
}

// ── Features Section ──────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: '⬡',
    title: 'MULTI-AGENT INTELLIGENCE',
    desc: '6 philosophical AI agents analyze every asset simultaneously. Crack mapping, visibility analysis, narrative separation, and more.',
    accent: GREEN,
  },
  {
    icon: '◈',
    title: 'REAL-TIME MARKET DATA',
    desc: 'Live price feeds, OHLCV data, and market metrics from Binance, CoinGecko, and on-chain sources.',
    accent: BLUE,
  },
  {
    icon: '⧖',
    title: 'AI CHAT AGENT',
    desc: 'Built-in AI assistant with full context of your portfolio data. Ask anything about any asset, any time.',
    accent: PURPLE,
  },
  {
    icon: '⊞',
    title: 'PER-AGENT MODEL CONFIG',
    desc: 'Every agent runs its own model. Mix Claude, GPT, Gemini, and 280+ models across providers.',
    accent: AMBER,
  },
  {
    icon: '◎',
    title: 'CLASSIFICATION ENGINE',
    desc: '3-layer pipeline: Discovery, Classification (6 parallel agents), and Synthesis into structured verdicts.',
    accent: GREEN,
  },
  {
    icon: '▣',
    title: 'BLOOMBERG TERMINAL UX',
    desc: 'Dark, dense, fast. Built for professionals who want signal, not noise. Every pixel earns its place.',
    accent: BLUE,
  },
]

function FeaturesSection() {
  return (
    <section
      style={{
        background: BG,
        padding: '110px 32px',
      }}
      className="yspad"
    >
      <div style={{ maxWidth: '1040px', margin: '0 auto' }}>
        {/* Header */}
        <div className="yr" style={{ marginBottom: '56px' }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: '12px',
              color: DIM,
              letterSpacing: '0.06em',
              marginBottom: '6px',
            }}
          >
            <span style={{ color: GREEN }}>$</span> cat FEATURES.md
          </div>
          <h2
            style={{
              fontFamily: MONO,
              fontSize: 'clamp(18px, 3.5vw, 28px)',
              fontWeight: 700,
              letterSpacing: '0.06em',
              color: TEXT,
              margin: '0 0 8px 0',
            }}
          >
            WHAT IT DOES
          </h2>
          <div
            style={{
              height: '1px',
              background: `linear-gradient(to right, ${BORDER}, transparent)`,
              maxWidth: '320px',
            }}
          />
        </div>

        {/* Grid */}
        <div
          className="yfg"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '16px',
          }}
        >
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className={`yr ycard yd${(i % 6) + 1}`}
              style={{
                background: PANEL,
                border: `1px solid ${BORDER}`,
                padding: '28px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              {/* Icon */}
              <div
                style={{
                  fontSize: '28px',
                  color: f.accent,
                  lineHeight: 1,
                  filter: `drop-shadow(0 0 8px ${f.accent}55)`,
                }}
              >
                {f.icon}
              </div>

              {/* Title */}
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  color: f.accent,
                }}
              >
                {f.title}
              </div>

              {/* Divider */}
              <div
                style={{
                  height: '1px',
                  background: `linear-gradient(to right, ${f.accent}44, transparent)`,
                }}
              />

              {/* Description */}
              <p
                style={{
                  fontFamily: MONO,
                  fontSize: '12px',
                  color: MUTED,
                  lineHeight: 1.75,
                  margin: 0,
                }}
              >
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Architecture Section ──────────────────────────────────────────────────────
const AGENTS = [
  { name: 'CRACK MAPPING',      desc: 'Structural fractures',   color: AMBER },
  { name: 'VISIBILITY',         desc: 'Signal clarity',          color: AMBER },
  { name: 'NARRATIVE SEP.',     desc: 'Signal vs noise',         color: AMBER },
  { name: 'POWER VECTOR',       desc: 'Leverage mapping',        color: AMBER },
  { name: 'PROBLEM RECOG.',     desc: 'Thesis validation',       color: AMBER },
  { name: 'IDENTITY POL.',      desc: 'Community coherence',     color: AMBER },
]

function FlowDots({ color }: { color: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        position: 'relative',
        height: '52px',
      }}
    >
      {/* Line */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: '50%',
          width: '1px',
          transform: 'translateX(-50%)',
          background: `linear-gradient(to bottom, ${color}55, ${color}22)`,
        }}
      />
      {/* Dots */}
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            transform: 'translateX(-50%)',
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: color,
            boxShadow: `0 0 6px ${color}, 0 0 12px ${color}66`,
            animation: 'yFlow 1.6s linear infinite',
            animationDelay: `${i * 0.53}s`,
          }}
        />
      ))}
    </div>
  )
}

function ArchSection() {
  return (
    <section
      style={{
        background: SURFACE,
        padding: '110px 32px',
      }}
      className="yspad"
    >
      <div style={{ maxWidth: '1040px', margin: '0 auto' }}>
        {/* Header */}
        <div className="yr" style={{ marginBottom: '64px' }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: '12px',
              color: DIM,
              letterSpacing: '0.06em',
              marginBottom: '6px',
            }}
          >
            <span style={{ color: GREEN }}>$</span> cat ARCHITECTURE.md
          </div>
          <h2
            style={{
              fontFamily: MONO,
              fontSize: 'clamp(18px, 3.5vw, 28px)',
              fontWeight: 700,
              letterSpacing: '0.06em',
              color: TEXT,
              margin: '0 0 8px 0',
            }}
          >
            HOW IT WORKS
          </h2>
          <div
            style={{
              height: '1px',
              background: `linear-gradient(to right, ${BORDER}, transparent)`,
              maxWidth: '320px',
            }}
          />
        </div>

        {/* Pipeline */}
        <div className="yr" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

          {/* Layer 1: Discovery */}
          <div
            style={{
              width: '100%',
              maxWidth: '600px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div
              style={{
                fontFamily: MONO,
                fontSize: '10px',
                color: GREEN,
                letterSpacing: '0.2em',
                textAlign: 'center',
                marginBottom: '4px',
              }}
            >
              LAYER 1
            </div>
            <div
              className="yarchnode"
              style={{
                background: PANEL,
                border: `1px solid ${GREEN}55`,
                padding: '20px 28px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                boxShadow: `0 0 20px rgba(0,255,136,0.06)`,
              }}
            >
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: '13px',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  color: GREEN,
                  textAlign: 'center',
                }}
              >
                DISCOVERY
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: '11px',
                  color: MUTED,
                  textAlign: 'center',
                  lineHeight: 1.6,
                }}
              >
                OpenCode agent in Docker — researches whitepapers, GitHub, socials,
                tokenomics. Returns structured context for all downstream agents.
              </div>
            </div>
          </div>

          <FlowDots color={GREEN} />

          {/* Layer 2: Classification */}
          <div style={{ width: '100%' }}>
            <div
              style={{
                fontFamily: MONO,
                fontSize: '10px',
                color: AMBER,
                letterSpacing: '0.2em',
                textAlign: 'center',
                marginBottom: '12px',
              }}
            >
              LAYER 2 — 6 AGENTS IN PARALLEL
            </div>
            <div
              className="yamid"
              style={{
                display: 'flex',
                gap: '10px',
                justifyContent: 'center',
              }}
            >
              {AGENTS.map((agent, i) => (
                <div
                  key={agent.name}
                  className={`yarchnode yd${i + 1}`}
                  style={{
                    flex: '1 1 120px',
                    minWidth: '100px',
                    maxWidth: '160px',
                    background: PANEL,
                    border: `1px solid ${AMBER}44`,
                    padding: '14px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '5px',
                    boxShadow: `0 0 12px rgba(255,170,0,0.04)`,
                  }}
                >
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: '9px',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      color: AMBER,
                      textAlign: 'center',
                    }}
                  >
                    {agent.name}
                  </div>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: '9px',
                      color: DIM,
                      textAlign: 'center',
                    }}
                  >
                    {agent.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <FlowDots color={BLUE} />

          {/* Layer 3: Synthesis */}
          <div
            style={{
              width: '100%',
              maxWidth: '600px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div
              style={{
                fontFamily: MONO,
                fontSize: '10px',
                color: BLUE,
                letterSpacing: '0.2em',
                textAlign: 'center',
                marginBottom: '4px',
              }}
            >
              LAYER 3
            </div>
            <div
              className="yarchnode"
              style={{
                background: PANEL,
                border: `1px solid ${BLUE}55`,
                padding: '20px 28px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                boxShadow: `0 0 20px rgba(68,136,255,0.06)`,
              }}
            >
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: '13px',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  color: BLUE,
                  textAlign: 'center',
                }}
              >
                SYNTHESIS
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: '11px',
                  color: MUTED,
                  textAlign: 'center',
                  lineHeight: 1.6,
                }}
              >
                A 7th agent reads all 6 results and produces a unified verdict:
                category, conviction score, risk factors, and plain-language thesis.
              </div>
            </div>
          </div>

          {/* Output tag */}
          <div
            style={{
              marginTop: '24px',
              padding: '10px 20px',
              background: `rgba(68,136,255,0.06)`,
              border: `1px solid ${BLUE}33`,
              fontFamily: MONO,
              fontSize: '11px',
              color: BLUE,
              letterSpacing: '0.08em',
            }}
          >
            → ClassificationResult: category · conviction · risk_factors · thesis
          </div>
        </div>
      </div>
    </section>
  )
}



// ── Footer / CTA Section ──────────────────────────────────────────────────────
function FooterSection() {
  return (
    <footer
      style={{
        background: SURFACE,
        borderTop: `1px solid ${BORDER}`,
      }}
    >
      {/* Big CTA */}
      <div
        className="yspad"
        style={{
          padding: '100px 32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '32px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background grid echo */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `
              linear-gradient(rgba(0,255,136,0.025) 1px, transparent 1px),
              linear-gradient(90deg, rgba(0,255,136,0.025) 1px, transparent 1px)
            `,
            backgroundSize: '52px 52px',
            animation: 'yGrid 11s linear infinite',
            opacity: 0.5,
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(ellipse 60% 70% at 50% 50%, transparent 20%, ${SURFACE} 100%)`,
          }}
        />

        {/* Content */}
        <div className="yr" style={{ position: 'relative', zIndex: 1 }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: '11px',
              color: GREEN,
              letterSpacing: '0.2em',
              marginBottom: '16px',
              opacity: 0.7,
            }}
          >
            ▸ READY TO ACCESS THE TERMINAL?
          </div>
          <h2
            style={{
              fontFamily: MONO,
              fontSize: 'clamp(22px, 5vw, 44px)',
              fontWeight: 800,
              letterSpacing: '0.14em',
              color: TEXT,
              margin: '0 0 12px 0',
              textShadow: '0 0 60px rgba(0,255,136,0.1)',
            }}
          >
            LAUNCH YGGDRASIGHT
          </h2>
          <p
            style={{
              fontFamily: MONO,
              fontSize: '12px',
              color: DIM,
              letterSpacing: '0.04em',
              maxWidth: '380px',
              lineHeight: 1.8,
              margin: '0 auto',
            }}
          >
            The intelligence terminal built for the next generation of crypto traders.
          </p>
        </div>

        <div className="yr" style={{ position: 'relative', zIndex: 1 }}>
          <a
            href="https://terminal.yggdrasight.com"
            className="ycta"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              padding: '18px 48px',
              fontFamily: MONO,
              fontSize: '14px',
              fontWeight: 700,
              letterSpacing: '0.14em',
              color: GREEN,
              background: 'rgba(0,255,136,0.07)',
              border: '1px solid rgba(0,255,136,0.45)',
            }}
          >
            LAUNCH TERMINAL →
          </a>
        </div>
      </div>

      {/* Footer bottom bar */}
      <div
        style={{
          borderTop: `1px solid ${BORDER}`,
          padding: '20px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {/* Links row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icon-512x512.png"
              alt=""
              style={{
                height: 16,
                width: 16,
                opacity: 0.5,
                filter: 'drop-shadow(0 0 4px rgba(0,255,136,0.4))',
              }}
            />
            <span
              style={{
                fontFamily: MONO,
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.12em',
                color: DIM,
              }}
            >
              YGGDRASIGHT
            </span>
          </div>

          {/* Links */}
          <div style={{ display: 'flex', gap: '24px' }}>
            <a
              href="https://github.com/0xtrou/yggdrasight"
              target="_blank"
              rel="noopener noreferrer"
              className="ylink"
              style={{
                fontFamily: MONO,
                fontSize: '11px',
                color: DIM,
                letterSpacing: '0.06em',
              }}
            >
              GitHub
            </a>
            <a
              href="https://x.com/yggdrasight"
              target="_blank"
              rel="noopener noreferrer"
              className="ylink"
              style={{
                fontFamily: MONO,
                fontSize: '11px',
                color: DIM,
                letterSpacing: '0.06em',
              }}
            >
              X / Twitter
            </a>
            <a
              href="https://terminal.yggdrasight.com"
              className="ylink"
              style={{
                fontFamily: MONO,
                fontSize: '11px',
                color: DIM,
                letterSpacing: '0.06em',
              }}
            >
              Terminal
            </a>
          </div>

          {/* Copyright */}
          <span
            style={{
              fontFamily: MONO,
              fontSize: '10px',
              color: DIM,
              letterSpacing: '0.04em',
            }}
          >
            © 2026 Yggdrasight. Not financial advice.
          </span>
        </div>

        {/* Status bar — mimics the terminal StatusBar */}
        <div
          style={{
            borderTop: `1px solid rgba(255,255,255,0.04)`,
            paddingTop: '12px',
            display: 'flex',
            justifyContent: 'center',
            gap: '24px',
          }}
        >
          {[
            { label: 'SYS', value: 'NOMINAL', color: GREEN },
            { label: 'NET', value: 'CONNECTED', color: GREEN },
            { label: 'MKT', value: 'LIVE', color: GREEN },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontFamily: MONO,
                fontSize: '10px',
                letterSpacing: '0.1em',
              }}
            >
              <span style={{ color: DIM }}>{s.label}:</span>
              <span style={{ color: s.color }}>{s.value}</span>
              {s.value === 'LIVE' && (
                <div
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: GREEN,
                    animation: 'yLive 1.5s ease-in-out infinite',
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </footer>
  )
}

// ── Page Root ─────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Mount + scroll detection
  useEffect(() => {
    setMounted(true)
    const onScroll = () => setScrolled(window.scrollY > 56)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Scroll-triggered reveal
  useEffect(() => {
    if (!mounted) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('yv')
          }
        })
      },
      { threshold: 0.07, rootMargin: '0px 0px -40px 0px' }
    )

    document.querySelectorAll('.yr').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [mounted])

  return (
    <>
      <PageStyles />
      <div
        style={{
          background: BG,
          fontFamily: MONO,
          color: TEXT,
          minHeight: '100vh',
          overflowX: 'hidden',
        }}
      >
        <NavBar scrolled={scrolled} />
        <HeroSection mounted={mounted} />
        <TerminalSection />
        <FeaturesSection />
        <ArchSection />

        <FooterSection />
      </div>
    </>
  )
}
