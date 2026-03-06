'use client'

import { useRef, useMemo, useCallback, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree, ThreeEvent } from '@react-three/fiber'
import { Text, OrbitControls, Html, Line } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import type { IGlobalDiscoveredProject } from '@/lib/intelligence/models/global-discovery-job.model'
import type { GlobalDiscoveryFullReport } from '@/hooks/useGlobalDiscovery'
import type { MarketGlobalData } from '@/hooks/useMarketGlobal'
import {
  CATEGORY_NAMES,
  CRACK_NAMES,
  MIGRATION_PATTERNS,
  type ClassificationCategory,
  type CrackId,
} from '@/lib/intelligence/classification/types'

/* ═══════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════════════ */

const CATEGORY_COLORS: Record<number, string> = {
  1: '#00ff88', // Crack Expander
  2: '#4488ff', // Infra of Disappearance
  3: '#aa66ff', // Mirror Builder
  4: '#ffaa00', // Narrative Vessel
  5: '#ff3b3b', // Ego Builder
  6: '#00ddcc', // Consciousness Seed
}

const CATEGORY_SHORT: Record<number, string> = {
  1: 'CRACK',
  2: 'INFRA',
  3: 'MIRROR',
  4: 'NARRATIVE',
  5: 'EGO',
  6: 'SEED',
}

const CRACK_SHORT: Record<number, string> = {
  1: 'INST',
  2: 'PROP',
  3: 'GEO',
  4: 'TIME',
  5: 'INFO',
  6: 'GATE',
  7: 'HIST',
  8: 'LIAB',
  9: 'IDEN',
}

/** 6 category positions arranged in a hexagonal ring at radius ~3 */
const CATEGORY_POSITIONS: Record<number, [number, number, number]> = (() => {
  const r = 3
  const positions: Record<number, [number, number, number]> = {}
  for (let i = 1; i <= 6; i++) {
    const angle = (-Math.PI / 2) + (i - 1) * (Math.PI * 2 / 6)
    positions[i] = [r * Math.cos(angle), r * Math.sin(angle), 0]
  }
  return positions
})()

/** 9 crack positions arranged in outer ring at radius ~5.5 */
const CRACK_POSITIONS: Record<number, [number, number, number]> = (() => {
  const r = 5.5
  const positions: Record<number, [number, number, number]> = {}
  for (let i = 1; i <= 9; i++) {
    const angle = (-Math.PI / 2) + (i - 1) * (Math.PI * 2 / 9)
    positions[i] = [r * Math.cos(angle), r * Math.sin(angle), 0]
  }
  return positions
})()

/* ═══════════════════════════════════════════════════════════════════════════
   DATA TRANSFORMATION
   ═══════════════════════════════════════════════════════════════════════════ */

interface ProjectNode {
  name: string
  symbol: string | null
  primaryCategory: number
  categoryWeights: Array<{ category: number; weight: number }>
  crackAlignment: number[]
  signalStrength: number
  sector: string | null
  isNew: boolean
  /** Position offset within the category cluster */
  offset: [number, number, number]
}

interface MigrationFlow {
  from: number
  to: number
  type: 'upgrade' | 'downgrade' | 'lateral' | 'evolution'
  value: string
}

interface SceneData {
  projects: ProjectNode[]
  categoryStats: Record<number, { count: number; avgSignal: number }>
  crackStats: Record<number, { count: number }>
  migrationFlows: MigrationFlow[]
  emergingTrends: string[]
  marketDirection: string | null
}

function transformReportToSceneData(
  report: GlobalDiscoveryFullReport | null,
): SceneData {
  const empty: SceneData = {
    projects: [],
    categoryStats: {},
    crackStats: {},
    migrationFlows: [],
    emergingTrends: [],
    marketDirection: null,
  }
  if (!report) return empty

  const newSymbols = new Set(report.newProjects.map(p => p.symbol ?? p.name))

  // Build project nodes with positions scattered within their category cluster
  const catCounts: Record<number, number> = {}
  const projects: ProjectNode[] = report.projects
    .filter(p => p.primaryCategory && p.primaryCategory >= 1 && p.primaryCategory <= 6)
    .map((p) => {
      const cat = p.primaryCategory!
      const idx = (catCounts[cat] ?? 0)
      catCounts[cat] = idx + 1
      // Spiral offset within cluster
      const spiralAngle = idx * 2.4 // golden angle
      const spiralR = 0.15 + idx * 0.08
      const offset: [number, number, number] = [
        spiralR * Math.cos(spiralAngle),
        spiralR * Math.sin(spiralAngle),
        (Math.random() - 0.5) * 0.4,
      ]
      return {
        name: p.name,
        symbol: p.symbol,
        primaryCategory: cat,
        categoryWeights: p.categoryWeights ?? [{ category: cat, weight: 1 }],
        crackAlignment: p.crackAlignment ?? [],
        signalStrength: p.signalStrength,
        sector: p.sector,
        isNew: newSymbols.has(p.symbol ?? p.name),
        offset,
      }
    })

  // Category stats
  const categoryStats: Record<number, { count: number; avgSignal: number }> = {}
  for (let c = 1; c <= 6; c++) {
    const catProjects = projects.filter(p => p.primaryCategory === c)
    categoryStats[c] = {
      count: catProjects.length,
      avgSignal: catProjects.length > 0
        ? catProjects.reduce((sum, p) => sum + p.signalStrength, 0) / catProjects.length
        : 0,
    }
  }

  // Crack stats
  const crackStats: Record<number, { count: number }> = {}
  for (let c = 1; c <= 9; c++) {
    crackStats[c] = {
      count: projects.filter(p => p.crackAlignment.includes(c)).length,
    }
  }

  // Migration flows from the framework constants
  const migrationFlows: MigrationFlow[] = Object.values(MIGRATION_PATTERNS).map(mp => ({
    from: mp.from,
    to: mp.to,
    type: mp.type,
    value: mp.value,
  }))

  return {
    projects,
    categoryStats,
    crackStats,
    migrationFlows,
    emergingTrends: report.emergingTrends ?? [],
    marketDirection: report.marketDirection,
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   PARTICLE FIELD — ambient background particles
   ═══════════════════════════════════════════════════════════════════════════ */

function ParticleField({ count = 800 }: { count?: number }) {
  const meshRef = useRef<THREE.Points>(null!)

  const [positions, sizes] = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const sz = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      // Spread particles in a large sphere
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 6 + Math.random() * 12
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      pos[i * 3 + 2] = r * Math.cos(phi)
      sz[i] = 0.02 + Math.random() * 0.04
    }
    return [pos, sz]
  }, [count])

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    meshRef.current.rotation.y = clock.getElapsedTime() * 0.008
    meshRef.current.rotation.x = Math.sin(clock.getElapsedTime() * 0.003) * 0.05
  })

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-size"
          args={[sizes, 1]}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#1a3a2a"
        size={0.04}
        sizeAttenuation
        transparent
        opacity={0.6}
        depthWrite={false}
      />
    </points>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   GRID RINGS — concentric reference circles
   ═══════════════════════════════════════════════════════════════════════════ */

function GridRings() {
  const rings = [2, 3, 4, 5.5, 7]
  return (
    <group>
      {rings.map((r) => {
        const segments = 128
        const points: [number, number, number][] = []
        for (let i = 0; i <= segments; i++) {
          const angle = (i / segments) * Math.PI * 2
          points.push([r * Math.cos(angle), r * Math.sin(angle), 0])
        }
        return (
          <Line
            key={r}
            points={points}
            color="#1a3a2a"
            lineWidth={r === 5.5 ? 1 : 0.5}
            opacity={r === 5.5 ? 0.4 : 0.2}
            transparent
          />
        )
      })}
      {/* Radial lines from center to outer ring */}
      {Array.from({ length: 18 }, (_, i) => {
        const angle = (i / 18) * Math.PI * 2
        const outer = 7
        return (
          <Line
            key={`radial-${i}`}
            points={[[0, 0, 0], [outer * Math.cos(angle), outer * Math.sin(angle), 0]]}
            color="#1a3a2a"
            lineWidth={0.3}
            opacity={0.12}
            transparent
          />
        )
      })}
    </group>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   SWEEP LINE — rotating radar sweep
   ═══════════════════════════════════════════════════════════════════════════ */

function SweepLine() {
  const groupRef = useRef<THREE.Group>(null!)

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    groupRef.current.rotation.z = -clock.getElapsedTime() * 0.3
  })

  // Build a sweep cone as a triangle fan
  const coneGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const segments = 20
    const sweepAngle = Math.PI / 6 // 30 degree trail
    const radius = 7
    const vertices: number[] = []
    // Center vertex repeated
    for (let i = 0; i < segments; i++) {
      const a1 = -sweepAngle * (i / segments)
      const a2 = -sweepAngle * ((i + 1) / segments)
      vertices.push(0, 0, 0)
      vertices.push(radius * Math.cos(a1), radius * Math.sin(a1), 0)
      vertices.push(radius * Math.cos(a2), radius * Math.sin(a2), 0)
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    return geo
  }, [])

  return (
    <group ref={groupRef}>
      {/* Sweep cone */}
      <mesh geometry={coneGeometry}>
        <meshBasicMaterial
          color="#00ff88"
          transparent
          opacity={0.04}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* Leading edge line */}
      <Line
        points={[[0, 0, 0.01], [7, 0, 0.01]]}
        color="#00ff88"
        lineWidth={1}
        opacity={0.5}
        transparent
      />
    </group>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   CATEGORY NODE — hexagonal cluster with glow
   ═══════════════════════════════════════════════════════════════════════════ */

function CategoryNode({
  category,
  position,
  stats,
  isHovered,
  onHover,
  onUnhover,
}: {
  category: number
  position: [number, number, number]
  stats: { count: number; avgSignal: number }
  isHovered: boolean
  onHover: () => void
  onUnhover: () => void
}) {
  const meshRef = useRef<THREE.Mesh>(null!)
  const glowRef = useRef<THREE.Mesh>(null!)
  const color = CATEGORY_COLORS[category]
  const nodeSize = 0.25 + Math.min(stats.count * 0.03, 0.4)

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const pulse = 1 + Math.sin(clock.getElapsedTime() * 1.5 + category) * 0.05
    meshRef.current.scale.setScalar(isHovered ? 1.3 : pulse)
    if (glowRef.current) {
      glowRef.current.scale.setScalar(isHovered ? 2.5 : 1.8 + Math.sin(clock.getElapsedTime() * 0.8 + category) * 0.3)
    }
  })

  return (
    <group position={position}>
      {/* Outer glow */}
      <mesh ref={glowRef}>
        <circleGeometry args={[nodeSize * 1.5, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={isHovered ? 0.15 : 0.06}
          depthWrite={false}
        />
      </mesh>
      {/* Core node */}
      <mesh
        ref={meshRef}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onHover() }}
        onPointerOut={onUnhover}
      >
        <circleGeometry args={[nodeSize, 6]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.8}
        />
      </mesh>
      {/* Category label */}
      <Text
        position={[0, -nodeSize - 0.3, 0]}
        fontSize={0.2}
        color={isHovered ? color : '#667766'}
        anchorX="center"
        anchorY="top"
        characters="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
      >
        {CATEGORY_SHORT[category]}
      </Text>
      {/* Count badge */}
      <Text
        position={[0, nodeSize + 0.2, 0]}
        fontSize={0.15}
        color={color}
        anchorX="center"
        anchorY="bottom"
        characters="0123456789"
      >
        {String(stats.count)}
      </Text>
    </group>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   PROJECT BLIP — individual project dot within a category cluster
   ═══════════════════════════════════════════════════════════════════════════ */

function ProjectBlip({
  project,
  hoveredCategory,
}: {
  project: ProjectNode
  hoveredCategory: number | null
}) {
  const meshRef = useRef<THREE.Mesh>(null!)
  const catPos = CATEGORY_POSITIONS[project.primaryCategory]
  const color = CATEGORY_COLORS[project.primaryCategory]
  const isHighlighted = hoveredCategory === project.primaryCategory

  const position: [number, number, number] = [
    catPos[0] + project.offset[0],
    catPos[1] + project.offset[1],
    catPos[2] + project.offset[2],
  ]

  const size = 0.04 + project.signalStrength * 0.06

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    if (project.isNew) {
      // New discoveries pulse
      const pulse = 1 + Math.sin(clock.getElapsedTime() * 3) * 0.4
      meshRef.current.scale.setScalar(pulse)
    }
  })

  return (
    <mesh
      ref={meshRef}
      position={position}
    >
      <sphereGeometry args={[size, 8, 8]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={isHighlighted ? 0.95 : hoveredCategory ? 0.15 : 0.6}
        depthWrite={false}
      />
    </mesh>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   CRACK SEGMENT — outer ring crack indicator
   ═══════════════════════════════════════════════════════════════════════════ */

function CrackSegment({
  crackId,
  position,
  count,
  totalProjects,
  hoveredCategory,
  projects,
}: {
  crackId: number
  position: [number, number, number]
  count: number
  totalProjects: number
  hoveredCategory: number | null
  projects: ProjectNode[]
}) {
  const meshRef = useRef<THREE.Mesh>(null!)
  const intensity = totalProjects > 0 ? count / totalProjects : 0

  // When hovering a category, highlight cracks that have projects from that category
  const isRelevant = hoveredCategory
    ? projects.some(p =>
        p.primaryCategory === hoveredCategory && p.crackAlignment.includes(crackId)
      )
    : false

  const color = isRelevant ? '#00ff88' : `hsl(${140 + intensity * 40}, ${60 + intensity * 40}%, ${20 + intensity * 40}%)`
  const opacity = hoveredCategory ? (isRelevant ? 0.9 : 0.15) : 0.3 + intensity * 0.5

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const pulse = 1 + Math.sin(clock.getElapsedTime() * 0.7 + crackId * 0.7) * 0.08
    meshRef.current.scale.setScalar(pulse)
  })

  const nodeSize = 0.12 + intensity * 0.2

  return (
    <group position={position}>
      {/* Glow ring */}
      <mesh>
        <ringGeometry args={[nodeSize * 1.2, nodeSize * 1.8, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity * 0.3}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Core */}
      <mesh ref={meshRef}>
        <circleGeometry args={[nodeSize, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          depthWrite={false}
        />
      </mesh>
      {/* Label */}
      <Text
        position={[0, -nodeSize - 0.25, 0]}
        fontSize={0.14}
        color={isRelevant ? '#00ff88' : '#445544'}
        anchorX="center"
        anchorY="top"
        characters="ABCDEFGHIJKLMNOPQRSTUVWXYZ"
      >
        {CRACK_SHORT[crackId]}
      </Text>
      {/* Count */}
      {count > 0 && (
        <Text
          position={[0, nodeSize + 0.15, 0]}
          fontSize={0.12}
          color="#667766"
          anchorX="center"
          anchorY="bottom"
          characters="0123456789"
        >
          {String(count)}
        </Text>
      )}
    </group>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   MIGRATION ARC — animated directional flow between categories
   ═══════════════════════════════════════════════════════════════════════════ */

function MigrationArc({
  flow,
  hoveredCategory,
}: {
  flow: MigrationFlow
  hoveredCategory: number | null
}) {
  const lineRef = useRef<THREE.Group>(null!)
  const from = CATEGORY_POSITIONS[flow.from]
  const to = CATEGORY_POSITIONS[flow.to]

  const isRelevant = hoveredCategory === flow.from || hoveredCategory === flow.to

  // Build curved path between category nodes
  const curvePoints = useMemo(() => {
    const midX = (from[0] + to[0]) / 2
    const midY = (from[1] + to[1]) / 2
    // Control point perpendicular to the line, offset outward
    const dx = to[0] - from[0]
    const dy = to[1] - from[1]
    const len = Math.sqrt(dx * dx + dy * dy)
    const perpX = -dy / len
    const perpY = dx / len
    const bulge = len * 0.3
    const cpX = midX + perpX * bulge
    const cpY = midY + perpY * bulge

    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(from[0], from[1], 0.05),
      new THREE.Vector3(cpX, cpY, 0.05),
      new THREE.Vector3(to[0], to[1], 0.05),
    )
    return curve.getPoints(40).map(p => [p.x, p.y, p.z] as [number, number, number])
  }, [from, to])

  const colorMap: Record<string, string> = {
    upgrade: '#00ff88',
    downgrade: '#ff3b3b',
    evolution: '#aa66ff',
    lateral: '#ffaa00',
  }

  const arcColor = colorMap[flow.type] ?? '#667766'
  const opacity = hoveredCategory ? (isRelevant ? 0.7 : 0.05) : 0.2

  return (
    <group ref={lineRef}>
      <Line
        points={curvePoints}
        color={arcColor}
        lineWidth={isRelevant ? 2 : 1}
        opacity={opacity}
        transparent
      />
      {/* Arrow head — small triangle at the end */}
      {isRelevant && (
        <mesh position={[to[0], to[1], 0.06]}>
          <coneGeometry args={[0.08, 0.2, 3]} />
          <meshBasicMaterial
            color={arcColor}
            transparent
            opacity={0.8}
          />
        </mesh>
      )}
    </group>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   CRACK-CATEGORY LINKS — lines from category to aligned cracks
   ═══════════════════════════════════════════════════════════════════════════ */

function CrackCategoryLinks({
  projects,
  hoveredCategory,
}: {
  projects: ProjectNode[]
  hoveredCategory: number | null
}) {
  if (!hoveredCategory) return null

  // Find unique crack alignments for the hovered category
  const relevantCracks = new Set<number>()
  projects.forEach(p => {
    if (p.primaryCategory === hoveredCategory) {
      p.crackAlignment.forEach(c => relevantCracks.add(c))
    }
  })

  const catPos = CATEGORY_POSITIONS[hoveredCategory]
  const color = CATEGORY_COLORS[hoveredCategory]

  return (
    <group>
      {Array.from(relevantCracks).map(crackId => {
        const crackPos = CRACK_POSITIONS[crackId]
        return (
          <Line
            key={`link-${hoveredCategory}-${crackId}`}
            points={[catPos, crackPos]}
            color={color}
            lineWidth={0.8}
            opacity={0.3}
            transparent
            dashed
            dashSize={0.15}
            gapSize={0.1}
          />
        )
      })}
    </group>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   CENTER HUD — market pulse at the center
   ═══════════════════════════════════════════════════════════════════════════ */

function CenterHud({
  marketGlobal,
  marketDirection,
}: {
  marketGlobal: MarketGlobalData | null
  marketDirection: string | null
}) {
  const ringRef = useRef<THREE.Mesh>(null!)

  useFrame(({ clock }) => {
    if (!ringRef.current) return
    ringRef.current.rotation.z = clock.getElapsedTime() * 0.1
  })

  const fearGreedColor = marketGlobal
    ? marketGlobal.fearGreedValue > 60 ? '#00ff88'
    : marketGlobal.fearGreedValue > 40 ? '#ffaa00'
    : '#ff3b3b'
    : '#334433'

  return (
    <group>
      {/* Rotating ring */}
      <mesh ref={ringRef}>
        <ringGeometry args={[0.7, 0.8, 64]} />
        <meshBasicMaterial
          color={fearGreedColor}
          transparent
          opacity={0.2}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* Inner core */}
      <mesh>
        <circleGeometry args={[0.6, 64]} />
        <meshBasicMaterial
          color="#0a1a10"
          transparent
          opacity={0.8}
          depthWrite={false}
        />
      </mesh>
      {/* Center dot */}
      <mesh>
        <circleGeometry args={[0.05, 16]} />
        <meshBasicMaterial
          color="#00ff88"
          transparent
          opacity={0.6}
        />
      </mesh>
      {/* Fear/Greed label */}
      {marketGlobal && (
        <>
          <Text
            position={[0, 0.2, 0.01]}
            fontSize={0.22}
            color={fearGreedColor}
            anchorX="center"
            anchorY="middle"
            characters="0123456789"
          >
            {String(marketGlobal.fearGreedValue)}
          </Text>
          <Text
            position={[0, -0.05, 0.01]}
            fontSize={0.08}
            color="#556655"
            anchorX="center"
            anchorY="middle"
            characters="ABCDEFGHIJKLMNOPQRSTUVWXYZ "
          >
            {(marketGlobal.fearGreedLabel ?? '').toUpperCase()}
          </Text>
          <Text
            position={[0, -0.25, 0.01]}
            fontSize={0.07}
            color="#445544"
            anchorX="center"
            anchorY="middle"
            characters="ABCDEFGHIJKLMNOPQRSTUVWXYZ.%0123456789 "
          >
            {`BTC ${marketGlobal.btcDominance.toFixed(1)}%`}
          </Text>
        </>
      )}
    </group>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   HOVER TOOLTIP — HTML overlay showing details on hover
   ═══════════════════════════════════════════════════════════════════════════ */

function HoverTooltip({
  hoveredCategory,
  data,
}: {
  hoveredCategory: number | null
  data: SceneData
}) {
  if (!hoveredCategory) return null

  const catPos = CATEGORY_POSITIONS[hoveredCategory]
  const color = CATEGORY_COLORS[hoveredCategory]
  const stats = data.categoryStats[hoveredCategory]
  const catProjects = data.projects.filter(p => p.primaryCategory === hoveredCategory)
  const cracks = new Set<number>()
  catProjects.forEach(p => p.crackAlignment.forEach(c => cracks.add(c)))

  return (
    <Html
      position={[catPos[0] + 0.8, catPos[1] + 0.5, 0.1]}
      style={{
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      <div style={{
        background: 'rgba(8, 16, 12, 0.95)',
        border: `1px solid ${color}44`,
        padding: '8px 12px',
        fontFamily: 'var(--font-mono)',
        fontSize: '10px',
        color: '#aabbaa',
        minWidth: '160px',
        borderRadius: '2px',
      }}>
        <div style={{ color, fontWeight: 'bold', fontSize: '11px', marginBottom: '6px', letterSpacing: '0.1em' }}>
          {CATEGORY_NAMES[hoveredCategory as ClassificationCategory]}
        </div>
        <div style={{ marginBottom: '4px' }}>
          <span style={{ color: '#556655' }}>PROJECTS </span>
          <span style={{ color }}>{stats?.count ?? 0}</span>
        </div>
        <div style={{ marginBottom: '4px' }}>
          <span style={{ color: '#556655' }}>AVG SIGNAL </span>
          <span style={{ color }}>{((stats?.avgSignal ?? 0) * 100).toFixed(0)}%</span>
        </div>
        {cracks.size > 0 && (
          <div style={{ marginBottom: '4px' }}>
            <span style={{ color: '#556655' }}>CRACKS </span>
            <span style={{ color: '#667766' }}>
              {Array.from(cracks).map(c => CRACK_SHORT[c]).join(' · ')}
            </span>
          </div>
        )}
        {catProjects.length > 0 && (
          <div style={{ marginTop: '6px', borderTop: '1px solid #1a3a2a', paddingTop: '4px' }}>
            {catProjects.slice(0, 6).map(p => (
              <div key={p.name} style={{ display: 'flex', gap: '6px', marginBottom: '2px' }}>
                <span style={{ color: p.isNew ? '#00ff88' : '#667766' }}>
                  {p.isNew ? '●' : '○'}
                </span>
                <span style={{ color: '#99aa99' }}>{p.symbol ?? p.name}</span>
                <span style={{ color: '#445544', marginLeft: 'auto' }}>
                  {(p.signalStrength * 100).toFixed(0)}
                </span>
              </div>
            ))}
            {catProjects.length > 6 && (
              <div style={{ color: '#445544', marginTop: '2px' }}>+{catProjects.length - 6} more</div>
            )}
          </div>
        )}
      </div>
    </Html>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCENE CONTENT — assembled 3D scene
   ═══════════════════════════════════════════════════════════════════════════ */

function SceneContent({
  data,
  marketGlobal,
}: {
  data: SceneData
  marketGlobal: MarketGlobalData | null
}) {
  const [hoveredCategory, setHoveredCategory] = useState<number | null>(null)

  return (
    <>
      {/* Ambient lighting */}
      <ambientLight intensity={0.3} />

      {/* Background field */}
      <ParticleField count={600} />

      {/* Grid structure */}
      <GridRings />

      {/* Sweep */}
      <SweepLine />

      {/* Category nodes */}
      {[1, 2, 3, 4, 5, 6].map(cat => (
        <CategoryNode
          key={cat}
          category={cat}
          position={CATEGORY_POSITIONS[cat]}
          stats={data.categoryStats[cat] ?? { count: 0, avgSignal: 0 }}
          isHovered={hoveredCategory === cat}
          onHover={() => setHoveredCategory(cat)}
          onUnhover={() => setHoveredCategory(null)}
        />
      ))}

      {/* Project blips */}
      {data.projects.map((p, i) => (
        <ProjectBlip
          key={`${p.name}-${i}`}
          project={p}
          hoveredCategory={hoveredCategory}
        />
      ))}

      {/* Crack segments */}
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(crackId => (
        <CrackSegment
          key={crackId}
          crackId={crackId}
          position={CRACK_POSITIONS[crackId]}
          count={data.crackStats[crackId]?.count ?? 0}
          totalProjects={data.projects.length}
          hoveredCategory={hoveredCategory}
          projects={data.projects}
        />
      ))}

      {/* Migration flow arcs */}
      {data.migrationFlows.map((flow, i) => (
        <MigrationArc
          key={`flow-${i}`}
          flow={flow}
          hoveredCategory={hoveredCategory}
        />
      ))}

      {/* Crack-Category links on hover */}
      <CrackCategoryLinks projects={data.projects} hoveredCategory={hoveredCategory} />

      {/* Center HUD */}
      <CenterHud
        marketGlobal={marketGlobal}
        marketDirection={data.marketDirection}
      />

      {/* Hover tooltip */}
      <HoverTooltip hoveredCategory={hoveredCategory} data={data} />

      {/* Camera controls */}
      <OrbitControls
        enablePan={false}
        enableZoom={true}
        enableRotate={true}
        minDistance={5}
        maxDistance={18}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI * 3 / 4}
        enableDamping
        dampingFactor={0.05}
        rotateSpeed={0.3}
        zoomSpeed={0.5}
      />

      {/* Postprocessing */}
      <EffectComposer>
        <Bloom
          intensity={0.8}
          luminanceThreshold={0.3}
          luminanceSmoothing={0.9}
          mipmapBlur
        />
        <Vignette
          offset={0.3}
          darkness={0.7}
        />
      </EffectComposer>
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   EXPANSION MAP — main exported component
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ExpansionMapProps {
  report: GlobalDiscoveryFullReport | null
  marketGlobal: MarketGlobalData | null
}

export function ExpansionMap({ report, marketGlobal }: ExpansionMapProps) {
  const data = useMemo(() => transformReportToSceneData(report), [report])

  return (
    <div style={{
      width: '100%',
      height: '100%',
      minHeight: '500px',
      background: '#060e0a',
      position: 'relative',
    }}>
      {/* Scanline overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 10,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,136,0.015) 2px, rgba(0,255,136,0.015) 4px)',
      }} />
      {/* Corner decorations */}
      <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 10, pointerEvents: 'none' }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '9px',
          color: '#334433',
          letterSpacing: '0.1em',
          lineHeight: 1.6,
        }}>
          <div>EXPANSION MAP v1.0</div>
          <div style={{ color: '#445544' }}>
            {data.projects.length > 0 ? `${data.projects.length} PROJECTS TRACKED` : 'AWAITING DATA'}
          </div>
        </div>
      </div>
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, pointerEvents: 'none' }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '9px',
          color: '#334433',
          letterSpacing: '0.1em',
          textAlign: 'right',
          lineHeight: 1.6,
        }}>
          <div>◉ LIVE</div>
          <div>{data.emergingTrends.length > 0 ? `${data.emergingTrends.length} TRENDS` : ''}</div>
        </div>
      </div>
      {/* Canvas */}
      <Canvas
        camera={{
          position: [0, 0, 10],
          fov: 60,
          near: 0.1,
          far: 100,
        }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
        }}
        dpr={[1, 2]}
        style={{ background: '#060e0a' }}
      >
        <color attach="background" args={['#060e0a']} />
        <SceneContent data={data} marketGlobal={marketGlobal} />
      </Canvas>
    </div>
  )
}
