import { execFile } from 'child_process'
import type { AvailableModel } from '../types'

// ── Constants ────────────────────────────────────────────────────────────────

const OPENCODE_BIN = process.env.OPENCODE_BIN ?? 'opencode'
const DEFAULT_TIMEOUT_MS = 120_000 // 2 minutes per agent call
const MODELS_CACHE_TTL_MS = 300_000 // 5 minutes

// ── Models cache ─────────────────────────────────────────────────────────────

let modelsCache: AvailableModel[] | null = null
let modelsCacheTime = 0

/**
 * Fetch available models from `opencode models`.
 * Results are cached for 5 minutes.
 */
export async function listModels(forceRefresh = false): Promise<AvailableModel[]> {
  const now = Date.now()
  if (!forceRefresh && modelsCache && now - modelsCacheTime < MODELS_CACHE_TTL_MS) {
    return modelsCache
  }

  try {
    const models = await new Promise<AvailableModel[]>((resolve, reject) => {
      const child = execFile(OPENCODE_BIN, ['models'], {
        timeout: 15_000,
        env: { ...process.env },
      }, (err, stdout) => {
        if (err) {
          reject(err)
          return
        }
        const parsed: AvailableModel[] = stdout
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
        resolve(parsed)
      })
      child.stdin?.end()
    })

    modelsCache = models
    modelsCacheTime = now
    return models
  } catch (err) {
    console.error('[opencode] Failed to list models:', err)
    // Return cached results if available, otherwise empty
    return modelsCache ?? []
  }
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
 * Extract the assistant's text response from OpenCode JSON events.
 *
 * When `--format json` is used, OpenCode emits newline-delimited JSON events:
 * - { type: 'step_start', part: { type: 'step-start' } }  — session init
 * - { type: 'text', part: { text: '...' } }               — response text
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

function extractResponseText(stdout: string): string {
  const jsonStrings = extractJsonObjects(stdout)

  const textParts: string[] = []
  let hasJsonEvents = false

  for (const jsonStr of jsonStrings) {
    try {
      const event = JSON.parse(sanitizeJsonString(jsonStr)) as OpenCodeJsonEvent
      hasJsonEvents = true

      // Extract text from 'text' type events — content is in part.text
      if (event.type === 'text' && event.part?.text) {
        textParts.push(event.part.text)
      }

      // Check for error events
      if (event.type === 'error' && event.error) {
        const err = event.error
        const errorMsg = typeof err === 'string'
          ? err
          : err.data?.message ?? err.message ?? 'Unknown error'
        // If we have no text yet, use the error as the response
        if (textParts.length === 0) {
          return `Error: ${errorMsg}`
        }
      }
    } catch {
      // Invalid JSON object — skip
    }
  }

  // Concatenate all text chunks
  if (textParts.length > 0) {
    return textParts.join('')
  }

  // If we parsed JSON events but found no text, return empty
  if (hasJsonEvents) {
    return ''
  }

  // Fallback: no JSON events found — return raw stdout (plain text mode)
  return stdout.trim()
}

// ── Core execution ───────────────────────────────────────────────────────────

export interface RunOpenCodeOptions {
  model: string
  prompt: string
  timeoutMs?: number
}

export interface RunOpenCodeResult {
  success: boolean
  text: string
  error?: string
  durationMs: number
}

/**
 * Run an OpenCode CLI prompt with a specific model and return the text response.
 *
 * Uses `opencode run -m <model> --format json "<prompt>"` for structured output parsing.
 */
export async function runOpenCode(options: RunOpenCodeOptions): Promise<RunOpenCodeResult> {
  const { model, prompt, timeoutMs = DEFAULT_TIMEOUT_MS } = options
  const startTime = Date.now()

  try {
    const args = [
      'run',
      '-m', model,
      '--format', 'json',
      prompt,
    ]

    const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const child = execFile(OPENCODE_BIN, args, {
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
    // - @opencode-ai/plugin resolution errors (bun install noise)
    // - config-context warnings (getConfigContext before init)
    // - "Resolving dependencies" / "Resolved, downloaded" (bun install progress)
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

    const text = extractResponseText(stdout)
    const durationMs = Date.now() - startTime

    if (!text) {
      return {
        success: false,
        text: '',
        error: 'Empty response from OpenCode CLI',
        durationMs,
      }
    }

    return { success: true, text, durationMs }
  } catch (err) {
    const durationMs = Date.now() - startTime
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'

    // Check for timeout
    if (errorMsg.includes('TIMEOUT') || errorMsg.includes('timed out')) {
      return {
        success: false,
        text: '',
        error: `OpenCode CLI timed out after ${timeoutMs}ms`,
        durationMs,
      }
    }

    console.error('[opencode] Execution failed:', errorMsg)
    return {
      success: false,
      text: '',
      error: errorMsg,
      durationMs,
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
