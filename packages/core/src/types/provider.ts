import type { ProviderType } from '../enums'

export interface SignalProvider {
  id: string
  createdAt: Date
  updatedAt: Date

  name: string
  type: ProviderType
  config: Record<string, unknown>
  isActive: boolean
  winRate?: number
  totalSignals?: number
  tags: string[]
}
