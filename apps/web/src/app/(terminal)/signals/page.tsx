'use client'

import { Suspense } from 'react'
import { FeedGrid } from '@/components/terminal/FeedGrid'

function SignalsContent() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', background: 'var(--color-terminal-bg)' }}>
      <FeedGrid />
    </div>
  )
}

export default function SignalsPage() {
  return (
    <Suspense>
      <SignalsContent />
    </Suspense>
  )
}
