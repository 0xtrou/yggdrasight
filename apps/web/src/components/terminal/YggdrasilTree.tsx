'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { Html, OrbitControls, useTexture } from '@react-three/drei'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import type { IGlobalDiscoveredProject } from '@/lib/intelligence/models/global-discovery-job.model'
import type { GlobalDiscoveryFullReport } from '@/hooks/useGlobalDiscovery'
import type { MarketGlobalData } from '@/hooks/useMarketGlobal'
import { CATEGORY_NAMES, CRACK_NAMES } from '@/lib/intelligence/classification/types'

type OrbitControlsRef = React.ComponentRef<typeof OrbitControls>

const CATEGORY_COLORS: Record<number, string> = {
  1: '#00ff88',
  2: '#4488ff',
  3: '#aa66ff',
  4: '#ffaa00',
  5: '#ff3b3b',
  6: '#00ddcc',
}


const _tempVec = new THREE.Vector3()
const _tempObj = new THREE.Object3D()

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

function hashToUnit(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967295
}

function seededRange(seed: string, min: number, max: number): number {
  return min + hashToUnit(seed) * (max - min)
}

function categoryName(categoryId: number): string {
  return CATEGORY_NAMES[categoryId as keyof typeof CATEGORY_NAMES] ?? `Category ${categoryId}`
}

function crackName(crackId: number): string {
  return CRACK_NAMES[crackId as keyof typeof CRACK_NAMES] ?? `Crack ${crackId}`
}

interface RootCrackSummary {
  crackId: number
  name: string
  projectCount: number
}

interface RootNode {
  id: 'root'
  name: string
  projectCount: number
  thickness: number
  cracks: RootCrackSummary[]
}

interface ProjectNode {
  id: string
  name: string
  symbol: string | null
  logoUrl: string | null
  categoryId: number
  sector: string
  signalStrength: number
  crackAlignment: number[]
  isNew: boolean
  description: string
  discoveryReason: string
}

interface NarrativeNode {
  id: string
  sector: string
  categoryId: number
  projectCount: number
  avgSignal: number
  projects: ProjectNode[]
}

interface PillarNode {
  categoryId: number
  name: string
  color: string
  projectCount: number
  avgSignal: number
  narratives: NarrativeNode[]
}


interface TrunkNode {
  marketDirection: string | null
  btcDominance: number | null
  fearGreedLabel: string | null
}

interface TreeData {
  root: RootNode
  trunk: TrunkNode
  pillars: PillarNode[]
  projectCount: number
}


interface NarrativeCurveDef {
  narrativeId: string
  categoryId: number
  sector: string
  curve: THREE.CatmullRomCurve3
  tip: THREE.Vector3
  projectBranches: Array<{
    projectId: string
    curve: THREE.CatmullRomCurve3
    tip: THREE.Vector3
    thickness: number
  }>
  projectAnchors: Array<{ projectId: string; position: THREE.Vector3 }>
}

interface PillarCurveDef {
  categoryId: number
  curve: THREE.CatmullRomCurve3
  end: THREE.Vector3
  thickness: number
  narratives: NarrativeCurveDef[]
}


type SelectedNode =
  | {
      type: 'root'
      position: [number, number, number]
    }
  | {
      type: 'pillar'
      categoryId: number
      position: [number, number, number]
    }
  | {
      type: 'narrative'
      narrativeId: string
      categoryId: number
      position: [number, number, number]
    }
  | {
      type: 'project'
      projectId: string
      categoryId: number
      position: [number, number, number]
    }

interface LeafInstanceMeta {
  project: ProjectNode
  basePosition: THREE.Vector3
  scale: number
}


function transformReportToTreeData(report: GlobalDiscoveryFullReport | null, marketGlobal: MarketGlobalData | null): TreeData {
  const projects: IGlobalDiscoveredProject[] = report?.projects ?? []
  const newKeys = new Set((report?.newProjects ?? []).map(p => `${p.name.toLowerCase()}::${(p.symbol ?? '').toLowerCase()}`))

  const rootCounts: Record<number, number> = {}
  for (let crackId = 1; crackId <= 9; crackId += 1) {
    rootCounts[crackId] = 0
  }

  const byCategory = new Map<number, IGlobalDiscoveredProject[]>()
  for (let categoryId = 1; categoryId <= 6; categoryId += 1) {
    byCategory.set(categoryId, [])
  }

  for (const project of projects) {
    for (const crack of project.crackAlignment ?? []) {
      if (crack >= 1 && crack <= 9) {
        rootCounts[crack] = (rootCounts[crack] ?? 0) + 1
      }
    }

    if (project.primaryCategory && project.primaryCategory >= 1 && project.primaryCategory <= 6) {
      byCategory.get(project.primaryCategory)?.push(project)
    }
  }

  const cracks: RootCrackSummary[] = Array.from({ length: 9 }, (_, idx) => {
    const crackId = idx + 1
    return {
      crackId,
      name: crackName(crackId),
      projectCount: rootCounts[crackId] ?? 0,
    }
  })

  const root: RootNode = {
    id: 'root',
    name: 'YGGDRASIL ROOT MASS',
    projectCount: projects.length,
    thickness: 0.18,
    cracks,
  }

  const pillars: PillarNode[] = Array.from({ length: 6 }, (_, idx) => idx + 1).map(categoryId => {
    const categoryProjects = byCategory.get(categoryId) ?? []

    const projectsBySector = new Map<string, IGlobalDiscoveredProject[]>()
    for (const project of categoryProjects) {
      const sector = (project.sector?.trim() || 'Uncharted').slice(0, 70)
      const list = projectsBySector.get(sector)
      if (list) {
        list.push(project)
      } else {
        projectsBySector.set(sector, [project])
      }
    }

    const narratives: NarrativeNode[] = Array.from(projectsBySector.entries())
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .map(([sector, items], sectorIndex) => {
        const avgSignal = items.length > 0 ? items.reduce((sum, p) => sum + clamp01(p.signalStrength), 0) / items.length : 0
        const projectsMapped: ProjectNode[] = items
          .slice()
          .sort((a, b) => clamp01(b.signalStrength) - clamp01(a.signalStrength))
          .map((project, projectIndex) => {
            const key = `${project.name.toLowerCase()}::${(project.symbol ?? '').toLowerCase()}`
            return {
              id: `${categoryId}:${sectorIndex}:${projectIndex}:${project.name}:${project.symbol ?? ''}`,
              name: project.name,
              symbol: project.symbol,
              logoUrl: project.logoUrl ?? null,
              categoryId,
              sector,
              signalStrength: clamp01(project.signalStrength),
              crackAlignment: (project.crackAlignment ?? []).filter(c => c >= 1 && c <= 9),
              isNew: newKeys.has(key),
              description: project.description,
              discoveryReason: project.discoveryReason,
            }
          })

        return {
          id: `${categoryId}:${sector}`,
          sector,
          categoryId,
          projectCount: items.length,
          avgSignal,
          projects: projectsMapped,
        }
      })

    const avgSignal = categoryProjects.length > 0
      ? categoryProjects.reduce((sum, p) => sum + clamp01(p.signalStrength), 0) / categoryProjects.length
      : 0

    return {
      categoryId,
      name: categoryName(categoryId),
      color: CATEGORY_COLORS[categoryId],
      projectCount: categoryProjects.length,
      avgSignal,
      narratives,
    }
  })

  return {
    root,
    trunk: {
      marketDirection: report?.marketDirection ?? null,
      btcDominance: marketGlobal?.btcDominance ?? null,
      fearGreedLabel: marketGlobal?.fearGreedLabel ?? null,
    },
    pillars,
    projectCount: projects.length,
  }
}

function createBarkTexture(): THREE.DataTexture {
  const width = 192
  const height = 640
  const data = new Uint8Array(width * height * 3)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3
      const grain = Math.sin(x * 0.27 + y * 0.032) * 0.5 + 0.5
      const cracks = Math.cos(x * 0.6 - y * 0.14) * 0.5 + 0.5
      const noise = Math.abs(Math.sin((x + 71) * 12.989 + (y + 17) * 78.233))
      const veinMask = Math.sin(y * 0.086 + x * 0.58) > 0.93 ? 1 : 0

      let r = 22 + grain * 26 + cracks * 10 + noise * 9
      let g = 17 + grain * 18 + cracks * 8 + noise * 7
      let b = 12 + grain * 12 + cracks * 6

      if (veinMask) {
        g += 40
        b += 28
      }

      data[i] = Math.min(255, Math.floor(r))
      data[i + 1] = Math.min(255, Math.floor(g))
      data[i + 2] = Math.min(255, Math.floor(b))
    }
  }

  const tex = new THREE.DataTexture(data, width, height, THREE.RGBFormat)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(2.8, 1.4)
  tex.needsUpdate = true
  return tex
}

/**
 * Polar-coordinate branch placement: each pillar gets a fixed angle in the YZ plane
 * (evenly spaced like spokes). All control points use the SAME angle with increasing
 * radius, so branches are GUARANTEED to never cross each other.
 */

/** Angle (radians) in YZ plane for each category — evenly spaced, offset for visual appeal */
function pillarAngle(categoryId: number): number {
  // 6 pillars, 60° apart, starting from ~40° (top-right) going clockwise
  // Order chosen so adjacent categories are visually distinct
  const angleMap: Record<number, number> = {
    6:  0.70,    // ~40°  — top-right
    1:  1.75,    // ~100° — upper-left
    3:  2.80,    // ~160° — left
    5: -2.44,    // ~-140° — lower-left
    2: -1.40,    // ~-80° — lower-right
    4: -0.35,    // ~-20° — right
  }
  return angleMap[categoryId] ?? 0
}

/** Radius at endpoint — how far from center axis the branch reaches */
function pillarRadius(categoryId: number): number {
  const radiusMap: Record<number, number> = {
    6: 3.8,
    1: 3.2,
    4: 2.8,
    3: 3.5,
    2: 2.6,
    5: 3.0,
  }
  return radiusMap[categoryId] ?? 3.0
}

function buildPillarCurves(pillars: PillarNode[]): PillarCurveDef[] {
  return pillars.map(pillar => {
    const angle = pillarAngle(pillar.categoryId)
    const endRadius = pillarRadius(pillar.categoryId)
    const thickness = 0.08 + Math.min(0.26, pillar.projectCount * 0.01)

    // Convert polar (angle, radius) to cartesian (y, z) at each control point
    // Radius increases monotonically: 0 → 0.15R → 0.45R → 0.78R → R
    // Angle stays CONSTANT — this is what prevents crossing
    const r0 = endRadius * 0.12
    const r1 = endRadius * 0.38
    const r2 = endRadius * 0.72
    const r3 = endRadius

    const cosA = Math.cos(angle)
    const sinA = Math.sin(angle)

    const start = new THREE.Vector3(0.8,  r0 * cosA, r0 * sinA)
    const c1    = new THREE.Vector3(2.35, r1 * cosA, r1 * sinA)
    const c2    = new THREE.Vector3(4.7,  r2 * cosA, r2 * sinA)
    const end   = new THREE.Vector3(6.9,  r3 * cosA, r3 * sinA)
    const curve = new THREE.CatmullRomCurve3([start, c1, c2, end], false, 'catmullrom', 0.43)

    const narratives = pillar.narratives.map((narrative, narrativeIndex) => {
      const count = pillar.narratives.length
      // Narratives fan out AROUND their parent pillar's angle
      // Each gets a small angular offset + slight radial extension
      const angleSpread = count === 1 ? 0 : (narrativeIndex - (count - 1) / 2) * 0.18
      const nAngle = angle + angleSpread
      const nCosA = Math.cos(nAngle)
      const nSinA = Math.sin(nAngle)

      // Radial distance increases further from pillar endpoint
      const nr0 = endRadius
      const nr1 = endRadius + 1.2
      const nr2 = endRadius + 2.6
      const nr3 = endRadius + 3.8

      const nStart = end.clone()
      const nC1 = new THREE.Vector3(
        8.15,
        nr1 * nCosA + seededRange(`n-c1y-${narrative.id}`, -0.06, 0.06),
        nr1 * nSinA + seededRange(`n-c1z-${narrative.id}`, -0.06, 0.06),
      )
      const nC2 = new THREE.Vector3(
        9.4,
        nr2 * nCosA + seededRange(`n-c2y-${narrative.id}`, -0.08, 0.08),
        nr2 * nSinA + seededRange(`n-c2z-${narrative.id}`, -0.08, 0.08),
      )
      const nEnd = new THREE.Vector3(
        10.8 + seededRange(`n-ex-${narrative.id}`, -0.15, 0.2),
        nr3 * nCosA + seededRange(`n-ey-${narrative.id}`, -0.1, 0.1),
        nr3 * nSinA + seededRange(`n-ez-${narrative.id}`, -0.1, 0.1),
      )

      const nCurve = new THREE.CatmullRomCurve3([nStart, nC1, nC2, nEnd], false, 'catmullrom', 0.45)
      const projectBranches = narrative.projects.map((project, projectIndex) => {
        const pCount = narrative.projects.length
        const t = pCount === 1 ? 0.95 : 0.6 + (projectIndex / (pCount - 1)) * 0.35
        const attachPoint = nCurve.getPoint(t)

        const projectAngleOffset = pCount === 1 ? 0 : (projectIndex - (pCount - 1) / 2) * 0.12
        const pAngle = nAngle + projectAngleOffset
        const pCosA = Math.cos(pAngle)
        const pSinA = Math.sin(pAngle)

        const attachRadius = Math.hypot(attachPoint.y, attachPoint.z)
        const branchLength = seededRange(`pb-len-${project.id}`, 0.8, 1.2)
        const midRadius = attachRadius + branchLength * 0.55
        const tipRadius = attachRadius + branchLength

        const midPoint = new THREE.Vector3(
          attachPoint.x + seededRange(`pb-mid-x-${project.id}`, 0.16, 0.28),
          midRadius * pCosA + seededRange(`pb-mid-y-${project.id}`, -0.03, 0.03),
          midRadius * pSinA + seededRange(`pb-mid-z-${project.id}`, -0.03, 0.03),
        )
        const tipPoint = new THREE.Vector3(
          attachPoint.x + seededRange(`pb-tip-x-${project.id}`, 0.3, 0.5),
          tipRadius * pCosA + seededRange(`pb-tip-y-${project.id}`, -0.04, 0.04),
          tipRadius * pSinA + seededRange(`pb-tip-z-${project.id}`, -0.04, 0.04),
        )

        const branchCurve = new THREE.CatmullRomCurve3([attachPoint, midPoint, tipPoint], false, 'catmullrom', 0.45)

        return {
          projectId: project.id,
          curve: branchCurve,
          tip: tipPoint,
          thickness: 0.015 + clamp01(project.signalStrength) * 0.01,
        }
      })
      const projectAnchors = projectBranches.map(pb => ({ projectId: pb.projectId, position: pb.tip.clone() }))

      return {
        narrativeId: narrative.id,
        categoryId: pillar.categoryId,
        sector: narrative.sector,
        curve: nCurve,
        tip: nEnd,
        projectBranches,
        projectAnchors,
      }
    })

    return {
      categoryId: pillar.categoryId,
      curve,
      end,
      thickness,
      narratives,
    }
  })
}

function buildLeafInstances(pillars: PillarNode[], pillarCurves: PillarCurveDef[]): LeafInstanceMeta[] {
  const result: LeafInstanceMeta[] = []
  for (const pillar of pillars) {
    const def = pillarCurves.find(p => p.categoryId === pillar.categoryId)
    if (!def) continue
    for (const narrative of pillar.narratives) {
      const nDef = def.narratives.find(n => n.narrativeId === narrative.id)
      if (!nDef) continue
      for (let i = 0; i < narrative.projects.length; i += 1) {
        const project = narrative.projects[i]
        const anchor = nDef.projectAnchors.find(a => a.projectId === project.id)?.position
        if (!anchor) continue
        result.push({
          project,
          basePosition: anchor.clone(),
          scale: 0.06 + clamp01(project.signalStrength) * 0.15,
        })
      }
    }
  }
  return result
}

const Starfield = memo(function Starfield({ count = 800 }: { count?: number }) {
  const { pos, col } = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const col = new Float32Array(count * 3)

    for (let i = 0; i < count; i += 1) {
      const theta = seededRange(`sf-t-${i}`, 0, Math.PI * 2)
      const phi = Math.acos(seededRange(`sf-p-${i}`, -1, 1))
      const radius = 18 + seededRange(`sf-r-${i}`, 0, 34)
      pos[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
      pos[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
      pos[i * 3 + 2] = radius * Math.cos(phi)

      const tint = seededRange(`sf-c-${i}`, 0, 1)
      col[i * 3] = 0.21 + tint * 0.12
      col[i * 3 + 1] = 0.38 + tint * 0.4
      col[i * 3 + 2] = 0.42 + tint * 0.36
    }

    return { pos, col }
  }, [count])

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
        <bufferAttribute attach="attributes-color" args={[col, 3]} />
      </bufferGeometry>
      <pointsMaterial vertexColors size={0.075} sizeAttenuation transparent opacity={0.88} depthWrite={false} />
    </points>
  )
})

const NebulaBackdrop = memo(function NebulaBackdrop() {
  const tex = useMemo(() => {
    const size = 256
    const data = new Uint8Array(size * size * 3)
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const i = (y * size + x) * 3
        const nx = x / size
        const ny = y / size
        const wave = Math.sin(nx * 12.4 + ny * 7.8) * 0.5 + 0.5
        const wave2 = Math.cos(nx * 8.3 - ny * 11.2) * 0.5 + 0.5
        data[i] = Math.floor(12 + wave * 28)
        data[i + 1] = Math.floor(28 + wave2 * 64)
        data[i + 2] = Math.floor(40 + (wave * 0.55 + wave2 * 0.45) * 88)
      }
    }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBFormat)
    texture.needsUpdate = true
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(1.25, 1.15)
    return texture
  }, [])

  return (
    <group position={[4.5, 0.2, -6.8]}>
      <mesh>
        <planeGeometry args={[30, 16, 1, 1]} />
        <meshBasicMaterial map={tex} transparent opacity={0.28} depthWrite={false} color="#66ffe0" />
      </mesh>
      <mesh position={[0.8, -1.1, -0.1]}>
        <planeGeometry args={[28, 14, 1, 1]} />
        <meshBasicMaterial map={tex} transparent opacity={0.14} depthWrite={false} color="#8a68d8" />
      </mesh>
    </group>
  )
})

const MistLayer = memo(function MistLayer({ count, color, spread, yOffset, size }: {
  count: number
  color: string
  spread: [number, number, number]
  yOffset: number
  size: number
}) {
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i += 1) {
      arr[i * 3] = seededRange(`m-x-${i}-${color}`, -0.5, 0.5) * spread[0]
      arr[i * 3 + 1] = yOffset + seededRange(`m-y-${i}-${color}`, -0.5, 0.5) * spread[1]
      arr[i * 3 + 2] = seededRange(`m-z-${i}-${color}`, -0.5, 0.5) * spread[2]
    }
    return arr
  }, [color, count, spread, yOffset])

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color={color} size={size} transparent opacity={0.07} depthWrite={false} />
    </points>
  )
})

const TRUNK_CURVES = {
  coreA: new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(-0.85, -1.05, 0.03),
      new THREE.Vector3(-0.2, -0.3, -0.05),
      new THREE.Vector3(0.55, 0.35, 0.07),
      new THREE.Vector3(1.25, 1.0, 0.03),
    ],
    false,
    'catmullrom',
    0.44,
  ),
  coreB: new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(-0.92, -1.03, -0.2),
      new THREE.Vector3(-0.25, -0.25, -0.24),
      new THREE.Vector3(0.46, 0.3, -0.12),
      new THREE.Vector3(1.16, 0.98, -0.08),
    ],
    false,
    'catmullrom',
    0.48,
  ),
  coreC: new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(-0.78, -1.09, 0.18),
      new THREE.Vector3(-0.12, -0.26, 0.2),
      new THREE.Vector3(0.62, 0.36, 0.18),
      new THREE.Vector3(1.3, 1.02, 0.14),
    ],
    false,
    'catmullrom',
    0.47,
  ),
  vein: new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(-0.65, -0.84, 0.43),
      new THREE.Vector3(0.05, -0.2, 0.3),
      new THREE.Vector3(0.82, 0.48, 0.23),
      new THREE.Vector3(1.34, 1.03, 0.16),
    ],
    false,
    'catmullrom',
    0.4,
  ),
}

interface GeometryBundle {
  trunk: {
    a: THREE.TubeGeometry
    b: THREE.TubeGeometry
    c: THREE.TubeGeometry
    vein: THREE.TubeGeometry
  }
  pillar: Map<string, THREE.TubeGeometry>
  narrative: Map<string, THREE.TubeGeometry>
  projectBranch: Map<string, THREE.TubeGeometry>
  leafSphere: THREE.SphereGeometry
  leafHitSphere: THREE.SphereGeometry
  hoverSphere: THREE.SphereGeometry
  all: THREE.BufferGeometry[]
}

function CameraRig() {
  const { camera } = useThree()
  useEffect(() => {
    camera.position.set(3.3, 2.6, 13.5)
    camera.lookAt(3.3, 0.15, 0)
  }, [camera])
  return null
}

/** Keeps pan speed constant regardless of camera distance to target. */
const REFERENCE_DISTANCE = 13.72
const BASE_PAN_SPEED = 0.8
function ConstantPanSpeed({ controlsRef }: { controlsRef: React.RefObject<OrbitControlsRef | null> }) {
  const { camera } = useThree()
  const target = useRef(new THREE.Vector3(3.3, 0.15, 0))
  useFrame(() => {
    const controls = controlsRef.current
    if (!controls) return
    target.current.copy(controls.target)
    const dist = camera.position.distanceTo(target.current)
    controls.panSpeed = BASE_PAN_SPEED * (REFERENCE_DISTANCE / Math.max(dist, 0.5))
  })
  return null
}

const Trunk = memo(function Trunk({
  barkTexture,
  hovered,
  onHover,
  onOut,
  onSelect,
  geometry,
}: {
  barkTexture: THREE.DataTexture
  hovered: boolean
  onHover: () => void
  onOut: () => void
  onSelect: () => void
  geometry: GeometryBundle['trunk']
}) {
  const handleOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    onHover()
  }, [onHover])
  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onSelect()
  }, [onSelect])

  return (
    <group>
      <mesh geometry={geometry.a} userData={{ nodeType: 'trunk', trunk: true }} onPointerOver={handleOver} onPointerOut={onOut} onClick={handleClick}>
        <meshStandardMaterial
          color="#2e241f"
          map={barkTexture}
          roughness={0.94}
          metalness={0.06}
          emissive="#0f4c3b"
          emissiveIntensity={hovered ? 0.28 : 0.16}
        />
      </mesh>

      <mesh geometry={geometry.b} position={[0.03, -0.01, -0.03]}>
        <meshStandardMaterial
          color="#342920"
          map={barkTexture}
          roughness={0.95}
          metalness={0.05}
          emissive="#0b3a2e"
          emissiveIntensity={0.12}
          transparent
          opacity={0.84}
        />
      </mesh>

      <mesh geometry={geometry.c} position={[-0.02, 0.03, 0.02]}>
        <meshStandardMaterial
          color="#291f1a"
          map={barkTexture}
          roughness={0.95}
          metalness={0.04}
          emissive="#0f4738"
          emissiveIntensity={0.11}
          transparent
          opacity={0.8}
        />
      </mesh>

      <mesh geometry={geometry.vein}>
        <meshBasicMaterial color="#47f9c6" transparent opacity={0.18} depthWrite={false} />
      </mesh>
    </group>
  )
})


const PillarSystem = memo(function PillarSystem({
  pillars,
  curves,
  pillarGeometries,
  narrativeGeometries,
  projectBranchGeometries,
  hoveredKey,
  onHover,
  onOut,
  onSelect,
  selected,
  swayRefs,
}: {
  pillars: PillarNode[]
  curves: PillarCurveDef[]
  pillarGeometries: Map<string, THREE.TubeGeometry>
  narrativeGeometries: Map<string, THREE.TubeGeometry>
  projectBranchGeometries: Map<string, THREE.TubeGeometry>
  hoveredKey: string | null
  onHover: (key: string) => void
  onOut: () => void
  onSelect: (node: SelectedNode) => void
  selected: SelectedNode | null
  swayRefs: React.MutableRefObject<Array<THREE.Group | null>>
}) {
  return (
    <group>
      {pillars.map((pillar, index) => {
        const def = curves.find(c => c.categoryId === pillar.categoryId)
        const mainGeo = pillarGeometries.get(`pillar:${pillar.categoryId}`)
        if (!def || !mainGeo) return null

        const hoverKey = `pillar:${pillar.categoryId}`
        const isHovered = hoveredKey === hoverKey || (selected?.type === 'pillar' && selected.categoryId === pillar.categoryId)

        return (
          <group key={hoverKey} ref={node => { swayRefs.current[index] = node }}>
            <mesh
              geometry={mainGeo}
              userData={{ nodeType: 'pillar', categoryId: pillar.categoryId }}
              onPointerOver={(e: ThreeEvent<PointerEvent>) => {
                e.stopPropagation()
                onHover(hoverKey)
              }}
              onPointerOut={onOut}
              onClick={(e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation()
                onSelect({
                  type: 'pillar',
                  categoryId: pillar.categoryId,
                  position: [def.end.x, def.end.y, def.end.z],
                })
              }}
            >
              <meshStandardMaterial
                color="#271f1b"
                roughness={0.9}
                metalness={0.1}
                emissive={pillar.color}
                emissiveIntensity={isHovered ? 0.72 : 0.26 + pillar.avgSignal * 0.24}
              />
            </mesh>

            {def.narratives.map(narrative => {
              const nGeo = narrativeGeometries.get(`narrative:${narrative.narrativeId}`)
              if (!nGeo) return null

              const nHoverKey = `narrative:${narrative.narrativeId}`
              const nHovered = hoveredKey === nHoverKey || (selected?.type === 'narrative' && selected.narrativeId === narrative.narrativeId)

              return (
                <group key={narrative.narrativeId}>
                  <mesh
                    geometry={nGeo}
                    userData={{ nodeType: 'narrative', categoryId: pillar.categoryId, narrativeId: narrative.narrativeId }}
                    onPointerOver={(e: ThreeEvent<PointerEvent>) => {
                      e.stopPropagation()
                      onHover(nHoverKey)
                    }}
                    onPointerOut={onOut}
                    onClick={(e: ThreeEvent<MouseEvent>) => {
                      e.stopPropagation()
                      onSelect({
                        type: 'narrative',
                        narrativeId: narrative.narrativeId,
                        categoryId: pillar.categoryId,
                        position: [narrative.tip.x, narrative.tip.y, narrative.tip.z],
                      })
                    }}
                  >
                    <meshStandardMaterial
                      color="#2e2520"
                      roughness={0.93}
                      metalness={0.08}
                      emissive={pillar.color}
                      emissiveIntensity={nHovered ? 0.58 : 0.2}
                    />
                  </mesh>

                  {narrative.projectBranches.map(pb => {
                    const pbGeo = projectBranchGeometries.get(`projectBranch:${pb.projectId}`)
                    if (!pbGeo) return null
                    const pbHoverKey = `projectBranch:${pb.projectId}`
                    const pbHovered = hoveredKey === pbHoverKey || (selected?.type === 'project' && selected.projectId === pb.projectId)
                    return (
                      <mesh
                        key={pb.projectId}
                        geometry={pbGeo}
                        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
                          e.stopPropagation()
                          onHover(pbHoverKey)
                        }}
                        onPointerOut={onOut}
                        onClick={(e: ThreeEvent<MouseEvent>) => {
                          e.stopPropagation()
                          onSelect({
                            type: 'project',
                            projectId: pb.projectId,
                            categoryId: pillar.categoryId,
                            position: [pb.tip.x, pb.tip.y, pb.tip.z],
                          })
                        }}
                      >
                        <meshStandardMaterial
                          color="#2e2520"
                          roughness={0.93}
                          metalness={0.08}
                          emissive={pillar.color}
                          emissiveIntensity={pbHovered ? 0.58 : 0.18}
                        />
                      </mesh>
                    )
                  })}
                </group>
              )
            })}
          </group>
        )
      })}
    </group>
  )
})


const LeafSystem = memo(function LeafSystem({
  leaves,
  hoveredKey,
  onHover,
  onOut,
  onSelect,
  sphereGeometry,
  hoverGeometry,
  instancedRef,
  hoverOrbRef,
}: {
  leaves: LeafInstanceMeta[]
  hoveredKey: string | null
  onHover: (key: string) => void
  onOut: () => void
  onSelect: (node: SelectedNode) => void
  sphereGeometry: THREE.SphereGeometry
  hoverGeometry: THREE.SphereGeometry
  instancedRef: React.MutableRefObject<THREE.InstancedMesh | null>
  hoverOrbRef: React.MutableRefObject<THREE.Mesh | null>
}) {
  const categoryColors = useMemo(() => {
    const colors: Record<number, THREE.Color> = {}
    for (let categoryId = 1; categoryId <= 6; categoryId += 1) {
      colors[categoryId] = new THREE.Color(CATEGORY_COLORS[categoryId])
    }
    return colors
  }, [])

  useEffect(() => {
    if (!instancedRef.current) return
    for (let i = 0; i < leaves.length; i += 1) {
      const leaf = leaves[i]
      _tempObj.position.copy(leaf.basePosition)
      _tempObj.scale.setScalar(leaf.scale)
      _tempObj.updateMatrix()
      instancedRef.current.setMatrixAt(i, _tempObj.matrix)
      instancedRef.current.setColorAt(i, categoryColors[leaf.project.categoryId])
    }
    instancedRef.current.instanceMatrix.needsUpdate = true
    if (instancedRef.current.instanceColor) {
      instancedRef.current.instanceColor.needsUpdate = true
    }
    instancedRef.current.computeBoundingBox()
    instancedRef.current.computeBoundingSphere()
  }, [categoryColors, instancedRef, leaves])

  return (
    <group>
      {/* Visible render mesh — instanced for performance, no pointer events */}
      <instancedMesh
        ref={instancedRef}
        args={[sphereGeometry, undefined, Math.max(1, leaves.length)]}
        userData={{ nodeType: 'project-cloud' }}
        frustumCulled={false}
        raycast={() => null}
      >
        <meshStandardMaterial vertexColors emissive="#66ffd9" emissiveIntensity={0.82} roughness={0.34} metalness={0.08} />
      </instancedMesh>

      {/* Individual hit-target meshes per leaf — reliable pointer events like branches */}
      {leaves.map((leaf, i) => (
        <mesh
          key={leaf.project.id}
          position={[leaf.basePosition.x, leaf.basePosition.y, leaf.basePosition.z]}
          scale={leaf.scale * 3}
          onPointerOver={(e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation()
            onHover(`project:${leaf.project.id}`)
          }}
          onPointerOut={onOut}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation()
            onSelect({
              type: 'project',
              projectId: leaf.project.id,
              categoryId: leaf.project.categoryId,
              position: [leaf.basePosition.x, leaf.basePosition.y, leaf.basePosition.z],
            })
          }}
        >
          <sphereGeometry args={[1, 6, 6]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}

      <mesh ref={hoverOrbRef} visible={Boolean(hoveredKey?.startsWith('project:'))} geometry={hoverGeometry} raycast={() => null}>
        <meshBasicMaterial color="#d9fff4" transparent opacity={0.22} depthWrite={false} />
      </mesh>

    </group>
  )
})

const MotionSystem = memo(function MotionSystem({
  swayRefs,
  leaves,
  leafIndexByProject,
  hoveredKey,
  instancedRef,
  hoverOrbRef,
}: {
  swayRefs: React.MutableRefObject<Array<THREE.Group | null>>
  leaves: LeafInstanceMeta[]
  leafIndexByProject: Map<string, number>
  hoveredKey: string | null
  instancedRef: React.MutableRefObject<THREE.InstancedMesh | null>
  hoverOrbRef: React.MutableRefObject<THREE.Mesh | null>
}) {
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()

    swayRefs.current.forEach((group) => {
      if (!group) return
      group.rotation.z = 0
      group.rotation.y = 0
    })

    if (instancedRef.current) {
      for (let i = 0; i < leaves.length; i += 1) {
        const leaf = leaves[i]
        const y = Math.sin(t * 1.12 + i * 0.53) * 0.02
        const z = Math.cos(t * 0.88 + i * 0.37) * 0.01
        const pulse = leaf.project.isNew ? 1 + Math.sin(t * 3 + i) * 0.2 : 1
        _tempObj.position.set(leaf.basePosition.x, leaf.basePosition.y + y, leaf.basePosition.z + z)
        _tempObj.scale.setScalar(leaf.scale * pulse)
        _tempObj.updateMatrix()
        instancedRef.current.setMatrixAt(i, _tempObj.matrix)
      }
      instancedRef.current.instanceMatrix.needsUpdate = true
    }

    if (hoverOrbRef.current && hoveredKey?.startsWith('project:')) {
      const id = hoveredKey.slice('project:'.length)
      const idx = leafIndexByProject.get(id)
      if (idx === undefined) {
        hoverOrbRef.current.visible = false
      } else {
        const leaf = leaves[idx]
        hoverOrbRef.current.visible = true
        _tempVec.set(
          leaf.basePosition.x,
          leaf.basePosition.y + Math.sin(t * 1.12 + idx * 0.53) * 0.02,
          leaf.basePosition.z + Math.cos(t * 0.88 + idx * 0.37) * 0.01,
        )
        hoverOrbRef.current.position.copy(_tempVec)
        hoverOrbRef.current.scale.setScalar(leaf.scale * 1.95)
      }
    } else if (hoverOrbRef.current) {
      hoverOrbRef.current.visible = false
    }
  })

  return null
})

/** Water-flow animation: particles travel connected routes from trunk → pillar → narrative → project branches.
 *  Pre-samples all curves into flat Float32Arrays to avoid getPoint() per frame. */
const SapFlow = memo(function SapFlow({ pillarCurves }: { pillarCurves: PillarCurveDef[] }) {
  const pointsRef = useRef<THREE.Points>(null)

  // Pre-sample connected route chains into flat point arrays
  const { sampledRoutes, routeColors } = useMemo(() => {
    const SAMPLES_PER_CURVE = 24

    function sampleCurve(curve: THREE.Curve<THREE.Vector3>, samples: number): THREE.Vector3[] {
      const pts: THREE.Vector3[] = []
      for (let i = 0; i < samples; i += 1) {
        pts.push(curve.getPoint(i / (samples - 1)))
      }
      return pts
    }


    // Trunk curve (matches TRUNK_CURVES.coreA)
    const trunkCurve = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(-0.85, -1.05, 0.03),
        new THREE.Vector3(-0.2, -0.3, -0.05),
        new THREE.Vector3(0.55, 0.35, 0.07),
        new THREE.Vector3(1.25, 1.0, 0.03),
      ],
      false, 'catmullrom', 0.44,
    )
    const trunkPts = sampleCurve(trunkCurve, SAMPLES_PER_CURVE)

    // Build full route chains: trunk → pillar → narrative → (optionally) projectBranch
    const routes: Float32Array[] = []
    const colors: THREE.Color[] = []

    for (const pillar of pillarCurves) {
      const pillarPts = sampleCurve(pillar.curve, SAMPLES_PER_CURVE)
      const pillarColor = new THREE.Color(CATEGORY_COLORS[pillar.categoryId] ?? '#79ffe0')

      for (const narrative of pillar.narratives) {
        const narrativePts = sampleCurve(narrative.curve, SAMPLES_PER_CURVE)

        if (narrative.projectBranches.length === 0) {
          // Route terminates at narrative tip
          const chain = [...trunkPts, ...pillarPts, ...narrativePts]
          const arr = new Float32Array(chain.length * 3)
          for (let i = 0; i < chain.length; i += 1) {
            arr[i * 3] = chain[i].x
            arr[i * 3 + 1] = chain[i].y
            arr[i * 3 + 2] = chain[i].z
          }
          routes.push(arr)
          colors.push(pillarColor)
        } else {
          // One route per project branch
          for (const pb of narrative.projectBranches) {
            const pbPts = sampleCurve(pb.curve, Math.max(6, Math.floor(SAMPLES_PER_CURVE * 0.5)))
            const chain = [...trunkPts, ...pillarPts, ...narrativePts, ...pbPts]
            const arr = new Float32Array(chain.length * 3)
            for (let i = 0; i < chain.length; i += 1) {
              arr[i * 3] = chain[i].x
              arr[i * 3 + 1] = chain[i].y
              arr[i * 3 + 2] = chain[i].z
            }
            routes.push(arr)
            colors.push(pillarColor)
          }
        }
      }
    }

    return { sampledRoutes: routes, routeColors: colors }
  }, [pillarCurves])

  // 3 particles per route, capped at 400 total for perf
  const PARTICLES_PER_ROUTE = 5
  const particleCount = Math.min(600, sampledRoutes.length * PARTICLES_PER_ROUTE)

  const particleData = useMemo(() => {
    const positions = new Float32Array(particleCount * 3)
    const particleColors = new Float32Array(particleCount * 3)
    const progress = new Float32Array(particleCount)
    const speed = new Float32Array(particleCount)
    const routeIdx = new Uint16Array(particleCount)

    for (let i = 0; i < particleCount; i += 1) {
      const rIdx = i % Math.max(1, sampledRoutes.length)
      routeIdx[i] = rIdx
      progress[i] = seededRange(`sf-p-${i}`, 0, 1)
      speed[i] = 0.08 + seededRange(`sf-s-${i}`, 0, 0.1)

      const col = routeColors[rIdx] ?? new THREE.Color('#79ffe0')
      particleColors[i * 3] = col.r
      particleColors[i * 3 + 1] = col.g
      particleColors[i * 3 + 2] = col.b
    }

    return { positions, particleColors, progress, speed, routeIdx }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [particleCount, sampledRoutes.length])

  useFrame((_, delta) => {
    if (!pointsRef.current || sampledRoutes.length === 0) return
    const clampedDelta = Math.min(delta, 0.05) // cap to prevent jumps on tab switch

    for (let i = 0; i < particleCount; i += 1) {
      particleData.progress[i] += particleData.speed[i] * clampedDelta
      if (particleData.progress[i] > 1) {
        particleData.progress[i] -= 1
      }

      const route = sampledRoutes[particleData.routeIdx[i]]
      if (!route) continue
      const totalPts = route.length / 3
      const t = particleData.progress[i] * (totalPts - 1)
      const idx0 = Math.floor(t)
      const frac = t - idx0
      const idx1 = Math.min(idx0 + 1, totalPts - 1)

      // Lerp between two sampled points — zero allocations
      particleData.positions[i * 3] = route[idx0 * 3] + (route[idx1 * 3] - route[idx0 * 3]) * frac
      particleData.positions[i * 3 + 1] = route[idx0 * 3 + 1] + (route[idx1 * 3 + 1] - route[idx0 * 3 + 1]) * frac
      particleData.positions[i * 3 + 2] = route[idx0 * 3 + 2] + (route[idx1 * 3 + 2] - route[idx0 * 3 + 2]) * frac
    }

    const posAttr = pointsRef.current.geometry.getAttribute('position')
    posAttr.needsUpdate = true
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[particleData.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[particleData.particleColors, 3]} />
      </bufferGeometry>
      <pointsMaterial vertexColors size={0.09} transparent opacity={0.92} depthWrite={false} sizeAttenuation />
    </points>
  )
})

/** App logo sprite at the trunk origin — right edge meets trunk start */
const RootLogo = memo(function RootLogo() {
  const texture = useTexture('/icon-192x192.png')
  const material = useMemo(() => {
    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      sizeAttenuation: true,
    })
    return mat
  }, [texture])

  return (
    <sprite
      material={material}
      position={[-2.8, -1.05, 0.03]}
      scale={[1.6, 1.6, 1]}
    />
  )
})

/** Generate a canvas-based symbol texture for a project leaf */
function createSymbolTexture(symbol: string, color: string): THREE.CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  // Transparent background with subtle glow circle
  ctx.clearRect(0, 0, size, size)
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, `${color}66`)
  gradient.addColorStop(0.6, `${color}22`)
  gradient.addColorStop(1, 'transparent')
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
  ctx.fill()

  // Symbol text
  const text = symbol.slice(0, 4).toUpperCase()
  const fontSize = text.length <= 2 ? 44 : text.length === 3 ? 36 : 28
  ctx.font = `bold ${fontSize}px monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffffff'
  ctx.shadowColor = color
  ctx.shadowBlur = 12
  ctx.fillText(text, size / 2, size / 2 + 1)

  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  return tex
}

/** Load a project logo from URL and draw it onto a canvas texture with glow styling */
function loadLogoTexture(logoUrl: string, color: string): Promise<THREE.CanvasTexture> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const size = 128
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')!

      // Glow background (same style as symbol textures)
      ctx.clearRect(0, 0, size, size)
      const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
      gradient.addColorStop(0, `${color}44`)
      gradient.addColorStop(0.6, `${color}18`)
      gradient.addColorStop(1, 'transparent')
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
      ctx.fill()

      // Draw logo centered, with padding
      const padding = 20
      const drawSize = size - padding * 2
      const aspect = img.width / img.height
      let dw = drawSize
      let dh = drawSize
      if (aspect > 1) {
        dh = drawSize / aspect
      } else {
        dw = drawSize * aspect
      }
      const dx = (size - dw) / 2
      const dy = (size - dh) / 2

      // Subtle shadow behind logo
      ctx.shadowColor = color
      ctx.shadowBlur = 10
      ctx.drawImage(img, dx, dy, dw, dh)

      const tex = new THREE.CanvasTexture(canvas)
      tex.needsUpdate = true
      resolve(tex)
    }
    img.onerror = () => reject(new Error(`Failed to load logo: ${logoUrl}`))
    img.src = logoUrl
  })
}

/** Render project symbol sprites at each leaf globe position — loads logos async with text fallback */
const ProjectSymbols = memo(function ProjectSymbols({ leaves }: { leaves: LeafInstanceMeta[] }) {
  // Initial sprites with text symbol textures (synchronous, immediate)
  const initialSprites = useMemo(() => {
    return leaves
      .filter(leaf => leaf.project.symbol || leaf.project.logoUrl)
      .map(leaf => {
        const color = CATEGORY_COLORS[leaf.project.categoryId] ?? '#79ffe0'
        const tex = leaf.project.symbol
          ? createSymbolTexture(leaf.project.symbol, color)
          : createSymbolTexture(leaf.project.name.slice(0, 3), color)
        const mat = new THREE.SpriteMaterial({
          map: tex,
          transparent: true,
          opacity: 0.88,
          depthWrite: false,
          sizeAttenuation: true,
        })
        return {
          id: leaf.project.id,
          logoUrl: leaf.project.logoUrl,
          color,
          material: mat,
          position: [leaf.basePosition.x, leaf.basePosition.y + leaf.scale * 3.2, leaf.basePosition.z] as [number, number, number],
          scale: Math.max(0.38, leaf.scale * 3.0),
        }
      })
  }, [leaves])

  // Track sprite materials in a ref so async logo loads can swap textures in-place
  const spritesRef = useRef(initialSprites)
  spritesRef.current = initialSprites

  // Async: load logo textures and swap them into existing sprite materials
  useEffect(() => {
    let cancelled = false
    const logoDisposables: THREE.CanvasTexture[] = []

    for (const sprite of initialSprites) {
      if (!sprite.logoUrl) continue
      loadLogoTexture(sprite.logoUrl, sprite.color)
        .then(logoTex => {
          if (cancelled) {
            logoTex.dispose()
            return
          }
          logoDisposables.push(logoTex)
          // Find the current sprite (it may have been recreated)
          const current = spritesRef.current.find(s => s.id === sprite.id)
          if (current) {
            // Dispose old text texture, swap in logo texture
            current.material.map?.dispose()
            current.material.map = logoTex
            current.material.needsUpdate = true
          }
        })
        .catch(() => {
          // Logo failed to load — text symbol fallback already in place
        })
    }

    return () => {
      cancelled = true
      for (const tex of logoDisposables) {
        tex.dispose()
      }
    }
  }, [initialSprites])

  // Cleanup textures and materials on unmount
  useEffect(() => {
    return () => {
      for (const s of initialSprites) {
        s.material.map?.dispose()
        s.material.dispose()
      }
    }
  }, [initialSprites])

  return (
    <group>
      {initialSprites.map(s => (
        <sprite
          key={s.id}
          material={s.material}
          position={s.position}
          scale={[s.scale, s.scale, 1]}
          raycast={() => null}
        />
      ))}
    </group>
  )
})

function Scene({ data, awaiting, selected, onSelect }: { data: TreeData; awaiting: boolean; selected: SelectedNode | null; onSelect: (node: SelectedNode | null) => void }) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)

  const barkTexture = useMemo(() => createBarkTexture(), [])
  const pillarCurves = useMemo(() => buildPillarCurves(data.pillars), [data.pillars])
  const leaves = useMemo(() => buildLeafInstances(data.pillars, pillarCurves), [data.pillars, pillarCurves])
  const leafIndexByProject = useMemo(() => {
    const map = new Map<string, number>()
    for (let i = 0; i < leaves.length; i += 1) {
      map.set(leaves[i].project.id, i)
    }
    return map
  }, [leaves])

  const geometries = useMemo<GeometryBundle>(() => {
    const pillar = new Map<string, THREE.TubeGeometry>()
    const narrative = new Map<string, THREE.TubeGeometry>()
    const projectBranch = new Map<string, THREE.TubeGeometry>()

    const all: THREE.BufferGeometry[] = []

    const trunk = {
      a: new THREE.TubeGeometry(TRUNK_CURVES.coreA, 64, 0.7, 8, false),
      b: new THREE.TubeGeometry(TRUNK_CURVES.coreB, 64, 0.56, 8, false),
      c: new THREE.TubeGeometry(TRUNK_CURVES.coreC, 64, 0.5, 8, false),
      vein: new THREE.TubeGeometry(TRUNK_CURVES.vein, 48, 0.08, 6, false),
    }
    all.push(trunk.a, trunk.b, trunk.c, trunk.vein)


    for (const def of pillarCurves) {
      const main = new THREE.TubeGeometry(def.curve, 40, def.thickness, 8, false)
      pillar.set(`pillar:${def.categoryId}`, main)
      all.push(main)

      for (const n of def.narratives) {
        const nGeo = new THREE.TubeGeometry(n.curve, 28, Math.max(0.03, def.thickness * 0.44), 6, false)
        narrative.set(`narrative:${n.narrativeId}`, nGeo)
        all.push(nGeo)

        for (const pb of n.projectBranches) {
          const pbGeo = new THREE.TubeGeometry(pb.curve, 12, pb.thickness, 4, false)
          projectBranch.set(`projectBranch:${pb.projectId}`, pbGeo)
          all.push(pbGeo)
        }
      }
    }


    const leafSphere = new THREE.SphereGeometry(1, 10, 10)
    const leafHitSphere = new THREE.SphereGeometry(3, 8, 8)
    const hoverSphere = new THREE.SphereGeometry(1, 12, 12)
    all.push(leafSphere, leafHitSphere, hoverSphere)

    return {
      trunk,
      pillar,
      narrative,
      projectBranch,
      leafSphere,
      leafHitSphere,
      hoverSphere,
      all,
    }
  }, [pillarCurves])

  useEffect(() => {
    return () => {
      geometries.all.forEach(g => g.dispose())
    }
  }, [geometries])

  const swayRefs = useRef<Array<THREE.Group | null>>([])
  const leafInstancedRef = useRef<THREE.InstancedMesh>(null)
  const hoverOrbRef = useRef<THREE.Mesh>(null)
  const controlsRef = useRef<OrbitControlsRef>(null)

  const { gl } = useThree()
  useEffect(() => {
    gl.domElement.style.cursor = hoveredKey ? 'pointer' : 'default'
  }, [gl, hoveredKey])

  const handleHover = useCallback((key: string) => setHoveredKey(key), [])
  const handleOut = useCallback(() => setHoveredKey(null), [])
  const handleClosePopover = useCallback(() => onSelect(null), [onSelect])
  const handleSelect = useCallback((node: SelectedNode) => onSelect(node), [onSelect])

  useEffect(() => {
    window.addEventListener('yggdrasil-popover-dismiss', handleClosePopover)
    return () => window.removeEventListener('yggdrasil-popover-dismiss', handleClosePopover)
  }, [handleClosePopover])

  return (
    <>
      <CameraRig />

      <ambientLight intensity={0.23} color="#8fdcc6" />
      <directionalLight position={[8, 9, 4]} intensity={0.43} color="#9ce7d2" />
      <pointLight position={[1.0, 1.2, 2.4]} intensity={1.06} distance={14} color="#44ffd6" />
      <pointLight position={[0.35, -0.7, -0.8]} intensity={0.46} distance={9} color="#2ac89f" />
      <pointLight position={[5.5, 2.5, 1.8]} intensity={0.42} distance={16} color="#4f86ff" />

      <NebulaBackdrop />
      <Starfield />
      <MistLayer count={230} color="#2f7f69" spread={[20, 8, 8]} yOffset={0.1} size={0.19} />
      <MistLayer count={160} color="#5f4b8a" spread={[23, 7, 10]} yOffset={-0.3} size={0.22} />
      <MistLayer count={120} color="#2b5b95" spread={[24, 9, 11]} yOffset={0.3} size={0.21} />


      <Trunk
        barkTexture={barkTexture}
        hovered={hoveredKey === 'trunk'}
        onHover={() => handleHover('trunk')}
        onOut={handleOut}
        onSelect={() => handleSelect({ type: 'root', position: [0.2, 0, 0] })}
        geometry={geometries.trunk}
      />

      <PillarSystem
        pillars={data.pillars}
        curves={pillarCurves}
        pillarGeometries={geometries.pillar}
        narrativeGeometries={geometries.narrative}
        projectBranchGeometries={geometries.projectBranch}
        hoveredKey={hoveredKey}
        onHover={handleHover}
        onOut={handleOut}
        onSelect={handleSelect}
        selected={selected}
        swayRefs={swayRefs}
      />


      <LeafSystem
        leaves={leaves}
        hoveredKey={hoveredKey}
        onHover={handleHover}
        onOut={handleOut}
        onSelect={handleSelect}
        sphereGeometry={geometries.leafSphere}
        hoverGeometry={geometries.hoverSphere}
        instancedRef={leafInstancedRef}
        hoverOrbRef={hoverOrbRef}
      />

      <MotionSystem
        swayRefs={swayRefs}
        leaves={leaves}
        leafIndexByProject={leafIndexByProject}
        hoveredKey={hoveredKey}
        instancedRef={leafInstancedRef}
        hoverOrbRef={hoverOrbRef}
      />

      <SapFlow pillarCurves={pillarCurves} />

      <RootLogo />
      <ProjectSymbols leaves={leaves} />

      {awaiting && (
        <Html position={[0.8, -2.8, 0]} center distanceFactor={14}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: '#507267',
            letterSpacing: '0.12em',
            background: 'rgba(6,14,10,0.82)',
            border: '1px solid rgba(90,130,114,0.35)',
            padding: '6px 10px',
          }}>
            AWAITING DATA
          </div>
        </Html>
      )}

      <OrbitControls
        ref={controlsRef}
        target={[3.3, 0.15, 0]}
        enablePan
        enableRotate
        enableZoom
        minDistance={2.5}
        maxDistance={28}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI - 0.2}
        rotateSpeed={0.6}
        zoomSpeed={0.9}
        dampingFactor={0.08}
        enableDamping
        mouseButtons={{
          LEFT: THREE.MOUSE.PAN,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.ROTATE,
        }}
        touches={{
          ONE: THREE.TOUCH.PAN,
          TWO: THREE.TOUCH.DOLLY_PAN,
        }}
      />
      <ConstantPanSpeed controlsRef={controlsRef} />

      <EffectComposer>
        <Bloom intensity={1.25} luminanceThreshold={0.18} luminanceSmoothing={0.88} mipmapBlur />
        <Vignette offset={0.3} darkness={0.76} />
      </EffectComposer>
    </>
  )
}

export interface YggdrasilTreeProps {
  report: GlobalDiscoveryFullReport | null
  marketGlobal: MarketGlobalData | null
}

export function YggdrasilTree({ report, marketGlobal }: YggdrasilTreeProps) {
  const data = useMemo(() => transformReportToTreeData(report, marketGlobal), [report, marketGlobal])
  const awaiting = !report || data.projectCount === 0
  const [selected, setSelected] = useState<SelectedNode | null>(null)

  const handleSelect = useCallback((node: SelectedNode | null) => setSelected(node), [])

  useEffect(() => {
    const dismiss = () => setSelected(null)
    window.addEventListener('yggdrasil-popover-dismiss', dismiss)
    return () => window.removeEventListener('yggdrasil-popover-dismiss', dismiss)
  }, [])

  // Resolve popover content from selected node
  const popoverContent = useMemo(() => {
    if (!selected) return null

    if (selected.type === 'root') {
      const cracks = data.root.cracks
      const totalAligned = cracks.reduce((sum, crack) => sum + crack.projectCount, 0)
      return {
        borderColor: '#5bc6ab',
        title: 'ROOT ALIGNMENT MATRIX',
        subtitle: data.root.name,
        rows: [
          { label: 'TOTAL PROJECTS', value: String(data.root.projectCount) },
          { label: 'TOTAL CRACK ALIGNMENTS', value: String(totalAligned) },
        ],
        list: cracks.map(c => ({ label: `${c.crackId}. ${c.name}`, value: String(c.projectCount) })),
        listTitle: 'CRACK SUMMARY',
      }
    }

    if (selected.type === 'pillar') {
      const pillar = data.pillars.find(p => p.categoryId === selected.categoryId)
      if (!pillar) return null
      return {
        borderColor: CATEGORY_COLORS[selected.categoryId],
        title: 'PILLAR BRANCH',
        subtitle: pillar.name.toUpperCase(),
        rows: [
          { label: 'PROJECTS', value: String(pillar.projectCount) },
          { label: 'AVG SIGNAL', value: `${(pillar.avgSignal * 100).toFixed(1)}%` },
          { label: 'SECTORS', value: pillar.narratives.map(n => n.sector).join(' · ') || 'None' },
        ],
      }
    }

    if (selected.type === 'narrative') {
      const pillar = data.pillars.find(p => p.categoryId === selected.categoryId)
      const narrative = pillar?.narratives.find(n => n.id === selected.narrativeId)
      if (!pillar || !narrative) return null
      return {
        borderColor: CATEGORY_COLORS[selected.categoryId],
        title: 'NARRATIVE BRANCH',
        subtitle: narrative.sector,
        rows: [
          { label: 'PROJECTS', value: String(narrative.projectCount) },
          { label: 'AVG SIGNAL', value: `${(narrative.avgSignal * 100).toFixed(1)}%` },
        ],
      }
    }

    if (selected.type === 'project') {
      let project: ProjectNode | null = null
      for (const pillar of data.pillars) {
        for (const narrative of pillar.narratives) {
          const found = narrative.projects.find(p => p.id === selected.projectId)
          if (found) { project = found; break }
        }
        if (project) break
      }
      if (!project) return null
      return {
        borderColor: CATEGORY_COLORS[project.categoryId],
        title: 'PROJECT LEAF',
        subtitle: project.name,
        rows: [
          { label: 'SYMBOL', value: project.symbol ?? '—' },
          { label: 'SIGNAL', value: `${(project.signalStrength * 100).toFixed(1)}%` },
          { label: 'CATEGORY', value: categoryName(project.categoryId) },
          { label: 'SECTOR', value: project.sector },
          { label: 'CRACK ALIGNMENT', value: project.crackAlignment.length > 0 ? project.crackAlignment.map(c => crackName(c)).join(' · ') : 'None' },
          ...(project.description ? [{ label: 'DESCRIPTION', value: project.description }] : []),
          ...(project.discoveryReason ? [{ label: 'DISCOVERY REASON', value: project.discoveryReason }] : []),
        ],
      }
    }

    return null
  }, [selected, data])

  return (
    <div style={{ width: '100%', height: '100%', minHeight: 500, position: 'relative', background: '#060e0a' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 8,
          pointerEvents: 'none',
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,136,0.014) 2px, rgba(0,255,136,0.014) 4px)',
        }}
      />

      <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 10, pointerEvents: 'none' }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: '#4f7065',
          letterSpacing: '0.12em',
          lineHeight: 1.6,
        }}>
          <div style={{ color: '#7ad8bd' }}>YGGDRASIL v2.0</div>
          <div>{data.projectCount > 0 ? `${data.projectCount} PROJECTS` : 'AWAITING DATA'}</div>
        </div>
      </div>

      {/* Top-right popover — HTML level, outside Canvas */}
      {popoverContent && (
        <div style={{
          position: 'absolute',
          top: 10,
          right: 10,
          zIndex: 20,
          minWidth: 280,
          maxWidth: 360,
          maxHeight: 'calc(100% - 20px)',
          overflowY: 'auto',
          background: 'linear-gradient(165deg, rgba(7,18,13,0.96), rgba(5,12,10,0.98))',
          border: `1px solid ${popoverContent.borderColor}66`,
          borderRadius: 4,
          boxShadow: `0 0 32px ${popoverContent.borderColor}1a`,
          padding: '12px 14px 11px',
          color: '#9dc2b5',
          fontSize: 10,
          lineHeight: 1.6,
          letterSpacing: '0.05em',
          fontFamily: 'var(--font-mono)',
          pointerEvents: 'auto',
        }}>
          <button
            onClick={() => setSelected(null)}
            style={{
              position: 'absolute',
              top: 8,
              right: 10,
              border: `1px solid ${popoverContent.borderColor}55`,
              background: 'rgba(7,16,13,0.88)',
              color: '#9fd3c0',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              lineHeight: 1,
              padding: '2px 6px',
              cursor: 'pointer',
              borderRadius: 2,
            }}
          >
            ×
          </button>

          <div style={{ color: '#6b9e8e', fontSize: 9, letterSpacing: '0.12em' }}>{popoverContent.title}</div>
          <div style={{ color: popoverContent.borderColor, marginTop: 4, fontSize: 12 }}>{popoverContent.subtitle}</div>

          <div style={{ marginTop: 8 }}>
            {popoverContent.rows.map(row => (
              <div key={row.label} style={{ marginTop: 3, wordBreak: 'break-word' }}>
                <span style={{ color: '#527569' }}>{row.label} </span>
                <span style={{ color: '#b8ddd0' }}>{row.value}</span>
              </div>
            ))}
          </div>

          {popoverContent.listTitle && popoverContent.list && (
            <>
              <div style={{ marginTop: 8, color: '#7baea0', fontSize: 9, letterSpacing: '0.1em' }}>{popoverContent.listTitle}</div>
              <div style={{ marginTop: 4 }}>
                {popoverContent.list.map(item => (
                  <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ color: '#88c7b5' }}>{item.label}</span>
                    <span style={{ color: '#9fd4c4' }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Navigation guide — bottom-right */}
      <div style={{
        position: 'absolute',
        bottom: 10,
        right: 10,
        zIndex: 10,
        pointerEvents: 'none',
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        color: '#3d5e52',
        letterSpacing: '0.08em',
        lineHeight: 1.85,
        background: 'rgba(6,14,10,0.72)',
        border: '1px solid rgba(90,130,114,0.18)',
        borderRadius: 3,
        padding: '7px 11px',
      }}>
        <div style={{ color: '#5a8273', fontSize: 8, letterSpacing: '0.14em', marginBottom: 3 }}>NAVIGATION</div>
        <div><span style={{ color: '#4f7a6a' }}>LMB DRAG</span> <span style={{ color: '#3a584c' }}>Pan</span></div>
        <div><span style={{ color: '#4f7a6a' }}>RMB DRAG</span> <span style={{ color: '#3a584c' }}>Orbit</span></div>
        <div><span style={{ color: '#4f7a6a' }}>SCROLL</span> <span style={{ color: '#3a584c' }}>Zoom</span></div>
        <div><span style={{ color: '#4f7a6a' }}>CLICK</span> <span style={{ color: '#3a584c' }}>Select node</span></div>
      </div>

      <Canvas
        camera={{ position: [2.4, 2.8, 10.8], fov: 56, near: 0.1, far: 140 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        style={{ background: '#060e0a' }}
        dpr={[1, 2]}
        onPointerMissed={() => {
          window.dispatchEvent(new Event('yggdrasil-popover-dismiss'))
        }}
      >
        <color attach="background" args={['#060e0a']} />
        <fog attach="fog" args={['#060e0a', 13, 46]} />
        <Scene data={data} awaiting={awaiting} selected={selected} onSelect={handleSelect} />
      </Canvas>
    </div>
  )
}
