export type MilestoneType =
  | 'token_unlock'
  | 'mainnet_launch'
  | 'partnership'
  | 'audit'
  | 'governance'
  | 'roadmap'
  | 'app'

export type MilestoneStatus = 'upcoming' | 'completed' | 'missed' | 'delayed'

export interface Milestone {
  id: string
  createdAt: Date
  updatedAt: Date

  projectId: string | null
  type: MilestoneType
  title: string
  description: string
  scheduledAt: Date
  completedAt?: Date
  status: MilestoneStatus
  impactScore?: number
  tags: string[]
}
