import { execFile, spawn } from 'child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import path from 'path'

import type { AvailableModel } from '../types'

// ── Constants ────────────────────────────────────────────────────────────────

const OPENCODE_BIN = process.env.OPENCODE_BIN ?? 'opencode'
const DOCKER_BIN = process.env.DOCKER_BIN ?? 'docker'
const OPENCODE_IMAGE = process.env.OPENCODE_IMAGE ?? 'ghcr.io/anomalyco/opencode'
const DEFAULT_TIMEOUT_MS = 600_000 // 10 minutes per agent call (agents may do deep research)
// Search multiple candidate paths for the models cache file
const MODELS_CACHE_CANDIDATES = [
  path.join(process.cwd(), 'data', 'models-cache.json'),
  path.join(process.cwd(), 'apps', 'web', 'data', 'models-cache.json'),
  path.resolve(__dirname, '..', '..', '..', '..', 'data', 'models-cache.json'),
]
function resolveModelsCachePath(): string {
  for (const p of MODELS_CACHE_CANDIDATES) {
    if (existsSync(p)) return p
  }
  return MODELS_CACHE_CANDIDATES[0] // default write location
}
const MODELS_CACHE_FILE = resolveModelsCachePath()
const MODELS_CACHE_TTL_MS = 3_600_000 // 1 hour before async background refresh

// ── Hardcoded fallback models ────────────────────────────────────────────────
// Used immediately on first load while CLI refresh runs in background.
// These cover all known github-copilot provider models.

const FALLBACK_MODELS: AvailableModel[] = [
  // Anthropic via github-copilot
  { id: 'github-copilot/claude-sonnet-4', provider: 'github-copilot', name: 'claude-sonnet-4' },
  { id: 'github-copilot/claude-opus-4', provider: 'github-copilot', name: 'claude-opus-4' },
  { id: 'github-copilot/claude-3.5-sonnet', provider: 'github-copilot', name: 'claude-3.5-sonnet' },
  { id: 'github-copilot/claude-3.7-sonnet', provider: 'github-copilot', name: 'claude-3.7-sonnet' },
  // Google via github-copilot
  { id: 'github-copilot/gemini-2.5-pro', provider: 'github-copilot', name: 'gemini-2.5-pro' },
  { id: 'github-copilot/gemini-2.0-flash', provider: 'github-copilot', name: 'gemini-2.0-flash' },
  // OpenAI via github-copilot
  { id: 'github-copilot/gpt-4.1', provider: 'github-copilot', name: 'gpt-4.1' },
  { id: 'github-copilot/gpt-4.1-mini', provider: 'github-copilot', name: 'gpt-4.1-mini' },
  { id: 'github-copilot/gpt-4o', provider: 'github-copilot', name: 'gpt-4o' },
  { id: 'github-copilot/gpt-4o-mini', provider: 'github-copilot', name: 'gpt-4o-mini' },
  { id: 'github-copilot/o3-mini', provider: 'github-copilot', name: 'o3-mini' },
  { id: 'github-copilot/o4-mini', provider: 'github-copilot', name: 'o4-mini' },
  // xAI via github-copilot
  { id: 'github-copilot/grok-3', provider: 'github-copilot', name: 'grok-3' },
  { id: 'github-copilot/grok-3-mini', provider: 'github-copilot', name: 'grok-3-mini' },
]

// ── Models cache ─────────────────────────────────────────────────────────────

let modelsCache: AvailableModel[] | null = null
let modelsCacheTime = 0
let backgroundRefreshRunning = false

/**
 * Read models from the JSON cache file on disk.
 */
function readModelsCacheFile(): { models: AvailableModel[]; timestamp: number } | null {
  try {
    if (!existsSync(MODELS_CACHE_FILE)) {
      console.log(`[opencode] Cache file not found: ${MODELS_CACHE_FILE}`)
      return null
    }
    const raw = readFileSync(MODELS_CACHE_FILE, 'utf-8')
    const parsed = JSON.parse(raw) as { models: AvailableModel[]; timestamp: number }
    if (!Array.isArray(parsed.models) || parsed.models.length === 0) {
      console.log('[opencode] Cache file has no models array')
      return null
    }
    console.log(`[opencode] Read ${parsed.models.length} models from ${MODELS_CACHE_FILE}`)
    return parsed
  } catch (err) {
    console.error('[opencode] Error reading cache file:', err)
    return null
  }
}

/**
 * Write models to the JSON cache file on disk.
 */
function writeModelsCacheFile(models: AvailableModel[]): void {
  try {
    mkdirSync(path.dirname(MODELS_CACHE_FILE), { recursive: true })
    writeFileSync(MODELS_CACHE_FILE, JSON.stringify({ models, timestamp: Date.now() }, null, 2))
    console.log(`[opencode] Wrote ${models.length} models to ${MODELS_CACHE_FILE}`)
  } catch (err) {
    console.error('[opencode] Failed to write models cache file:', err)
  }
}

/**
 * Try to fetch models from CLI using spawn with streaming stdout.
 * Times out after 20s. Returns parsed models or null on failure.
 */
function fetchModelsFromCLI(): Promise<AvailableModel[] | null> {
  return new Promise((resolve) => {
    const child = spawn(OPENCODE_BIN, ['models'], {
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let resolved = false
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        child.kill('SIGTERM')
        // Try to parse whatever we got so far
        const partial = parseModelsOutput(stdout)
        resolve(partial.length > 0 ? partial : null)
      }
    }, 20_000)

    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr.on('data', () => { /* ignore */ })

    child.on('close', () => {
      clearTimeout(timeout)
      if (!resolved) {
        resolved = true
        const models = parseModelsOutput(stdout)
        resolve(models.length > 0 ? models : null)
      }
    })

    child.on('error', () => {
      clearTimeout(timeout)
      if (!resolved) {
        resolved = true
        resolve(null)
      }
    })

    child.stdin?.end()
  })
}

/**
 * Parse the raw stdout from `opencode models` into AvailableModel[].
 */
function parseModelsOutput(stdout: string): AvailableModel[] {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.includes('/'))
    .map((id) => {
      const slashIdx = id.indexOf('/')
      return {
        id,
        provider: id.substring(0, slashIdx),
        name: id.substring(slashIdx + 1),
      }
    })
}

/**
 * Kick off a background refresh of the models list from CLI.
 * Writes to both in-memory cache and JSON file on disk.
 * Does NOT block the caller.
 */
function refreshModelsInBackground(): void {
  if (backgroundRefreshRunning) return
  backgroundRefreshRunning = true
  console.log('[opencode] Starting background models refresh...')

  fetchModelsFromCLI()
    .then((models) => {
      if (models && models.length > 0) {
        modelsCache = models
        modelsCacheTime = Date.now()
        writeModelsCacheFile(models)
        console.log(`[opencode] Background refresh: found ${models.length} models`)
      } else {
        console.log('[opencode] Background refresh: CLI returned no models (timeout or error)')
      }
    })
    .catch((err) => {
      console.error('[opencode] Background refresh error:', err)
    })
    .finally(() => {
      backgroundRefreshRunning = false
    })
}

/**
 * Fetch available models — stale-while-revalidate pattern.
 *
 * 1. If in-memory cache is fresh → return immediately
 * 2. If JSON file cache exists → return from file, kick background refresh if stale
 * 3. If nothing cached → return hardcoded fallbacks, kick background refresh
 *
 * The CLI `opencode models` command is known to hang indefinitely,
 * so we NEVER block on it. Background refresh with 20s timeout only.
 */
export async function listModels(forceRefresh = false): Promise<AvailableModel[]> {
  const now = Date.now()

  // 1. Fresh in-memory cache → return immediately
  if (!forceRefresh && modelsCache && now - modelsCacheTime < MODELS_CACHE_TTL_MS) {
    return modelsCache
  }

  // 2. Try JSON file cache
  const fileCached = readModelsCacheFile()
  if (fileCached) {
    modelsCache = fileCached.models
    modelsCacheTime = fileCached.timestamp

    // If file cache is stale, kick background refresh
    if (forceRefresh || now - fileCached.timestamp > MODELS_CACHE_TTL_MS) {
      refreshModelsInBackground()
    }

    return fileCached.models
  }

  // 3. No cache at all → return fallbacks, start background refresh
  modelsCache = FALLBACK_MODELS
  modelsCacheTime = now
  writeModelsCacheFile(FALLBACK_MODELS) // Seed the file so backend can read it
  refreshModelsInBackground()

  return FALLBACK_MODELS
}

// ── JSON event parsing ───────────────────────────────────────────────────────

interface OpenCodeJsonEvent {
  type: string
  // Part contains the actual data for each event type
  part?: {
    type?: string
    text?: string
    reason?: string
    tokens?: {
      input?: number
      output?: number
      reasoning?: number
    }
    [key: string]: unknown
  }
  // Error events
  error?: string | { name?: string; data?: { message?: string }; message?: string }
  // Session ID
  sessionID?: string
  // Other fields
  [key: string]: unknown
}

/**
 * Parsed result from extracting OpenCode JSON events.
 */
interface ExtractedResponse {
  /** The assistant's final text response */
  text: string
  /** File paths that the agent read via tool_use events (absolute paths) */
  filesRead: string[]
  /** URLs the agent fetched via webfetch/websearch tool_use events */
  urlsFetched: string[]
  /** Total number of tool calls made by the agent */
  toolCallCount: number
}

/**
 * Extract the assistant's text response and tool usage from OpenCode JSON events.
 *
 * When `--format json` is used, OpenCode emits newline-delimited JSON events:
 * - { type: 'step_start', part: { type: 'step-start' } }  — session init
 * - { type: 'text', part: { text: '...' } }               — response text
 * - { type: 'tool_use', part: { tool: 'read', state: { input: { filePath: '...' } } } } — file read
 * - { type: 'step_finish', part: { reason: 'stop' } }     — completion
 * - { type: 'error', error: { ... } }                     — error
 *
 * IMPORTANT: The 'text' field inside events may contain literal newlines,
 * which breaks naive line-splitting. We use brace-depth tracking to extract
 * complete JSON objects before parsing.
 */
function extractJsonObjects(stdout: string): string[] {
  const objects: string[] = []
  let i = 0
  const len = stdout.length

  while (i < len) {
    // Skip until we find a '{' that starts a top-level JSON object
    if (stdout[i] !== '{') {
      i++
      continue
    }

    // Track brace depth to find the matching '}'
    let depth = 0
    let start = i
    let inString = false
    let escape = false

    for (let j = i; j < len; j++) {
      const ch = stdout[j]

      if (escape) {
        escape = false
        continue
      }

      if (ch === '\\') {
        if (inString) escape = true
        continue
      }

      if (ch === '"' && !escape) {
        inString = !inString
        continue
      }

      if (inString) continue

      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          objects.push(stdout.substring(start, j + 1))
          i = j + 1
          break
        }
      }

      // Safety: if we've scanned 1MB without closing, bail
      if (j - start > 1_000_000) {
        i = j + 1
        break
      }
    }

    // If we never closed the brace, move past it
    if (depth > 0) {
      i = start + 1
    }
  }

  return objects
}

/**
 * Sanitize a raw JSON string that may contain unescaped control characters
 * (newlines, tabs, etc.) inside string values. OpenCode CLI sometimes emits
 * JSON with literal newlines in text fields which is technically invalid JSON.
 */
function sanitizeJsonString(raw: string): string {
  let result = ''
  let inString = false
  let escape = false

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    const code = raw.charCodeAt(i)

    if (escape) {
      escape = false
      result += ch
      continue
    }

    if (ch === '\\') {
      escape = true
      result += ch
      continue
    }

    if (ch === '"') {
      inString = !inString
      result += ch
      continue
    }

    // If we're inside a string and hit a control character, escape it
    if (inString && code < 0x20) {
      if (code === 0x0a) result += '\\n'       // newline
      else if (code === 0x0d) result += '\\r'  // carriage return
      else if (code === 0x09) result += '\\t'  // tab
      else result += `\\u${code.toString(16).padStart(4, '0')}`
      continue
    }

    result += ch
  }

  return result
}

function extractResponse(stdout: string): ExtractedResponse {
  const jsonStrings = extractJsonObjects(stdout)

  // Track text parts per step — we want the LAST step's text
  // because in agentic mode, earlier steps may be tool calls or preamble
  const allTextParts: string[] = []
  const stepTextParts: string[][] = [[]]
  const filesRead: string[] = []
  const urlsFetched: string[] = []
  let toolCallCount = 0
  let hasJsonEvents = false

  for (const jsonStr of jsonStrings) {
    try {
      const event = JSON.parse(sanitizeJsonString(jsonStr)) as OpenCodeJsonEvent
      hasJsonEvents = true

      // Track step boundaries
      if (event.type === 'step_start') {
        stepTextParts.push([])
      }

      // Extract text from 'text' type events — content is in part.text
      if (event.type === 'text' && event.part?.text) {
        const currentStep = stepTextParts[stepTextParts.length - 1]
        currentStep.push(event.part.text)
        allTextParts.push(event.part.text)
      }

      // Capture tool_use events — track files read and URLs fetched
      if (event.type === 'tool_use' && event.part) {
        toolCallCount++
        const part = event.part as {
          tool?: string
          state?: {
            status?: string
            input?: { filePath?: string; url?: string; query?: string }
          }
        }
        if (part.tool === 'read' && part.state?.status === 'completed' && part.state.input?.filePath) {
          filesRead.push(part.state.input.filePath)
        }
        if (part.tool === 'webfetch' && part.state?.status === 'completed' && part.state.input?.url) {
          urlsFetched.push(part.state.input.url)
        }
        if (part.tool === 'websearch_web_search_exa' && part.state?.status === 'completed' && part.state.input?.query) {
          urlsFetched.push(`search:${part.state.input.query}`)
        }
      }

      // Check for error events
      if (event.type === 'error' && event.error) {
        const err = event.error
        const errorMsg = typeof err === 'string'
          ? err
          : err.data?.message ?? err.message ?? 'Unknown error'
        // If we have no text yet, use the error as the response
        if (allTextParts.length === 0) {
          return { text: `Error: ${errorMsg}`, filesRead, urlsFetched, toolCallCount }
        }
      }
    } catch {
      // Invalid JSON object — skip
    }
  }

  // Prefer text from the last step (most likely the actual response)
  // But fall back to all text if the last step has nothing
  const lastStepText = stepTextParts[stepTextParts.length - 1]
  if (lastStepText.length > 0) {
    return { text: lastStepText.join(''), filesRead, urlsFetched, toolCallCount }
  }

  // Concatenate all text chunks
  if (allTextParts.length > 0) {
    return { text: allTextParts.join(''), filesRead, urlsFetched, toolCallCount }
  }

  // If we parsed JSON events but found no text, return empty
  if (hasJsonEvents) {
    return { text: '', filesRead, urlsFetched, toolCallCount }
  }

  // Fallback: no JSON events found — return raw stdout (plain text mode)
    return { text: stdout.trim(), filesRead, urlsFetched: [], toolCallCount }
}

// ── Core execution ───────────────────────────────────────────────────────────

export interface RunOpenCodeOptions {
  model: string
  /** Short message to send as the CLI prompt (points agent to files) */
  prompt: string
  /** Working directory containing data files for the agent to read */
  workDir?: string
  timeoutMs?: number
}

export interface RunOpenCodeResult {
  success: boolean
  text: string
  error?: string
  durationMs: number
  /** File paths the agent read via its `read` tool (from tool_use events) */
  filesRead: string[]
  /** URLs fetched/searched via webfetch/websearch tools */
  urlsFetched: string[]
  /** Total number of tool calls the agent made */
  toolCallCount: number
}

/**
 * Run OpenCode CLI as a coding agent that reads files from a work directory.
 *
 * When `workDir` is provided, the agent runs with `--dir <workDir>` so it can
 * use its built-in `read` tool to access structured data files — just like
 * a coding agent reviewing a codebase. This avoids ARG_MAX limits and lets
 * the LLM naturally process structured data.
 *
 * Falls back to inline prompt if no workDir is provided.
 */
export async function runOpenCode(options: RunOpenCodeOptions): Promise<RunOpenCodeResult> {
  const { model, prompt, workDir, timeoutMs = DEFAULT_TIMEOUT_MS } = options
  const startTime = Date.now()

  try {
    const HOME_DIR = process.env.HOME ?? '/root'

    // If a workDir is provided (pre-built data files), mount it as /workspace
    // and use --dir so the agent's read tool resolves relative paths there.
    // Otherwise create an isolated temp dir (no data files needed — prompt is short).
    let tmpDir: string | null = null
    let mountDir: string | null = null
    const dockerArgs: string[] = [
      'run', '--rm',
      '--network', 'host',
      '-v', `${HOME_DIR}/.opencode:/root/.opencode:ro`,
      // Mount XDG config dir for github-copilot and other provider config
      '-v', `${HOME_DIR}/.config/opencode:/root/.config/opencode:ro`,
      // Mount auth credentials (API keys, provider tokens)
      '-v', `${HOME_DIR}/.local/share/opencode/auth.json:/root/.local/share/opencode/auth.json:ro`,
      '-e', 'HOME=/root',
    ]

    if (workDir) {
      // Mount the pre-built workspace and tell opencode to run from /workspace
      dockerArgs.push('-v', `${workDir}:/workspace:rw`)
      dockerArgs.push(OPENCODE_IMAGE)
      dockerArgs.push('run', '-m', model, '--format', 'json', '--dir', '/workspace', prompt)
    } else {
      // No data files — just pass the prompt as positional arg directly
      dockerArgs.push(OPENCODE_IMAGE)
      dockerArgs.push('run', '-m', model, '--format', 'json', prompt)
    }

    const args = dockerArgs

    const promptDesc = workDir ? `workDir=${workDir} (${(prompt.length / 1024).toFixed(1)}KB msg)` : `inline (${(prompt.length / 1024).toFixed(1)}KB msg)`
    console.log(`[opencode] Running ${model} — ${promptDesc}`)

    const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const child = execFile(DOCKER_BIN, args, {
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large responses
        env: { ...process.env },
      }, (err, stdout, stderr) => {
        if (err) {
          reject(err)
          return
        }
        resolve({ stdout: stdout ?? '', stderr: stderr ?? '' })
      })
      // CRITICAL: Close stdin so opencode doesn't hang waiting for input
      child.stdin?.end()
    })

    // Filter known harmless stderr noise from OpenCode CLI
    if (stderr) {
      const significantStderr = stderr
        .split('\n')
        .filter((line) => {
          const l = line.trim()
          if (!l) return false
          if (l.includes('@opencode-ai/plugin')) return false
          if (l.includes('getConfigContext()')) return false
          if (l.includes('defaulting to CLI paths')) return false
          if (l.startsWith('Resolving dependencies')) return false
          if (l.startsWith('Resolved, downloaded')) return false
          if (l.startsWith('error: No version matching')) return false
          return true
        })
        .join('\n')
        .trim()
      if (significantStderr) {
        console.warn('[opencode] stderr:', significantStderr.substring(0, 500))
      }
    }
    // No tmpDir cleanup needed here — workDir is cleaned by caller; no-workDir path passes prompt inline

    const { text, filesRead, urlsFetched, toolCallCount } = extractResponse(stdout)
    const trimmedText = text.trim()
    const durationMs = Date.now() - startTime

    // Audit logging — show which files the agent read
    console.log(`[opencode] stdout: ${stdout.length}B, text: ${text.length}B, trimmed: ${trimmedText.length}B, duration: ${durationMs}ms`)
    console.log(`[opencode] Agent read ${filesRead.length} files, fetched ${urlsFetched.length} URLs (${toolCallCount} tool calls): ${filesRead.map(f => f.split('/').slice(-2).join('/')).join(', ') || 'none'}`)
    if (urlsFetched.length > 0) console.log(`[opencode] URLs fetched: ${urlsFetched.join(', ')}`)
    if (!trimmedText) {
      console.warn(`[opencode] Empty response. stdout preview: ${stdout.substring(0, 500)}`)
    }

    if (!trimmedText) {
      return {
        success: false,
        text: '',
        error: 'Empty response from OpenCode CLI',
        durationMs,
        filesRead,
        urlsFetched,
        toolCallCount,
      }
    }
    return { success: true, text: trimmedText, durationMs, filesRead, urlsFetched, toolCallCount }
  } catch (err) {
    const durationMs = Date.now() - startTime
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'

    if (errorMsg.includes('TIMEOUT') || errorMsg.includes('timed out')) {
      return {
        success: false,
        text: '',
        error: `OpenCode CLI timed out after ${timeoutMs}ms`,
        durationMs,
        filesRead: [],
        urlsFetched: [],
        toolCallCount: 0,
      }
    }
    if (errorMsg.includes('E2BIG') || errorMsg.includes('Argument list too long')) {
      return {
        success: false,
        text: '',
        error: `Prompt too long for CLI (${(prompt.length / 1024).toFixed(1)}KB)`,
        durationMs,
        filesRead: [],
        urlsFetched: [],
        toolCallCount: 0,
      }
    }
    console.error('[opencode] Execution failed:', errorMsg)
    return {
      success: false,
      text: '',
      error: errorMsg,
      durationMs,
      filesRead: [],
      urlsFetched: [],
      toolCallCount: 0,
    }
  }
}

// ── Verdict parsing ──────────────────────────────────────────────────────────

export interface ParsedLLMVerdict {
  direction: 'long' | 'short' | 'neutral'
  confidence: number
  reason: string
  indicators?: Record<string, number | string>
}

/**
 * Parse an LLM text response into a structured verdict.
 *
 * The LLM is instructed to return JSON, but we also handle cases where
 * the JSON is wrapped in markdown code blocks or has extra text.
 */
export function parseVerdictFromText(text: string): ParsedLLMVerdict | null {
  // Try direct JSON parse first
  try {
    const parsed = JSON.parse(text)
    return validateVerdict(parsed)
  } catch {
    // Not direct JSON
  }

  // Try extracting JSON from markdown code blocks
  const jsonBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (jsonBlockMatch) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[1])
      return validateVerdict(parsed)
    } catch {
      // Invalid JSON in code block
    }
  }

  // Try finding JSON object in the text
  const jsonMatch = text.match(/\{[\s\S]*"direction"[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      return validateVerdict(parsed)
    } catch {
      // Invalid JSON — might be truncated, try repair below
    }
  }

  // ── Truncated JSON recovery ──
  // If the LLM response was cut off mid-JSON (token limit, timeout), we try
  // to extract individual fields using regex. This handles cases like:
  // {"direction":"short","confidence":0.58,"reason":"some long text that got trun
  const truncatedResult = recoverTruncatedVerdict(text)
  if (truncatedResult) return truncatedResult

  return null
}


/**
 * Attempt to recover a verdict from truncated/incomplete JSON.
 * Uses regex to extract individual field values when JSON.parse fails.
 * This handles cases where the LLM response was cut off mid-stream.
 */
function recoverTruncatedVerdict(text: string): ParsedLLMVerdict | null {
  // Must at least have a direction field to recover
  const dirMatch = text.match(/["']direction["']\s*:\s*["']([^"']+)["']/i)
  if (!dirMatch) return null

  const direction = normalizeDirection(dirMatch[1])
  if (!direction) return null

  // Try to extract confidence
  let confidence = 0.5
  const confMatch = text.match(/["']confidence["']\s*:\s*(\d+\.?\d*)/i)
  if (confMatch) {
    confidence = Math.min(1, Math.max(0, parseFloat(confMatch[1])))
  }

  // Try to extract reason — may be truncated
  let reason = 'Response truncated'
  const reasonMatch = text.match(/["'](?:reason|reasoning)["']\s*:\s*["']((?:[^"'\\]|\\.)*)(?:["']|$)/i)
  if (reasonMatch) {
    reason = reasonMatch[1]
    // Unescape common JSON escapes
    reason = reason.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    // If it looks like it was truncated (no closing quote found), add indicator
    if (!text.includes(`"${reasonMatch[1]}"`) && !text.includes(`'${reasonMatch[1]}'`)) {
      reason += ' [truncated]'
    }
  }

  // Try to extract indicators object
  let indicators: Record<string, number | string> | undefined
  const indMatch = text.match(/["']indicators["']\s*:\s*\{([^}]*)\}?/i)
  if (indMatch) {
    try {
      indicators = JSON.parse(`{${indMatch[1]}}`)
    } catch {
      // Can't recover indicators, that's ok
    }
  }

  return { direction, confidence, reason, indicators }
}

function validateVerdict(raw: Record<string, unknown>): ParsedLLMVerdict | null {
  const direction = normalizeDirection(raw.direction)
  if (!direction) return null

  const confidence = typeof raw.confidence === 'number'
    ? Math.min(1, Math.max(0, raw.confidence))
    : typeof raw.confidence === 'string'
      ? Math.min(1, Math.max(0, parseFloat(raw.confidence)))
      : 0.5

  const reason = typeof raw.reason === 'string'
    ? raw.reason
    : typeof raw.reasoning === 'string'
      ? raw.reasoning as string
      : 'No reason provided'

  const indicators = typeof raw.indicators === 'object' && raw.indicators !== null
    ? raw.indicators as Record<string, number | string>
    : undefined

  return { direction, confidence, reason, indicators }
}

function normalizeDirection(raw: unknown): 'long' | 'short' | 'neutral' | null {
  if (typeof raw !== 'string') return null
  const lower = raw.toLowerCase().trim()

  if (lower === 'long' || lower === 'buy' || lower === 'bullish') return 'long'
  if (lower === 'short' || lower === 'sell' || lower === 'bearish') return 'short'
  if (lower === 'neutral' || lower === 'hold' || lower === 'flat') return 'neutral'

  return null
}
