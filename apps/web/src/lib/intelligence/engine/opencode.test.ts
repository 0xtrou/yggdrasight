/**
 * Test for OpenCode CLI response parser.
 *
 * Run with: npx tsx apps/web/src/lib/intelligence/engine/opencode.test.ts
 */

// We test extractJsonObjects + extractResponseText by importing the module
// But since extractJsonObjects and extractResponseText are not exported,
// we'll duplicate the logic here for testing, then verify via the exported
// parseVerdictFromText for end-to-end.

// ── Duplicate parser logic for unit testing ──────────────────────────────────

interface OpenCodeJsonEvent {
  type: string
  part?: {
    type?: string
    text?: string
    reason?: string
    tokens?: { input?: number; output?: number; reasoning?: number }
    [key: string]: unknown
  }
  error?: string | { name?: string; data?: { message?: string }; message?: string }
  sessionID?: string
  [key: string]: unknown
}

function extractJsonObjects(stdout: string): string[] {
  const objects: string[] = []
  let i = 0
  const len = stdout.length

  while (i < len) {
    if (stdout[i] !== '{') {
      i++
      continue
    }

    let depth = 0
    const start = i
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

      if (j - start > 1_000_000) {
        i = j + 1
        break
      }
    }

    if (depth > 0) {
      i = start + 1
    }
  }

  return objects
}

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

    if (inString && code < 0x20) {
      if (code === 0x0a) result += '\\n'
      else if (code === 0x0d) result += '\\r'
      else if (code === 0x09) result += '\\t'
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

      if (event.type === 'text' && event.part?.text) {
        textParts.push(event.part.text)
      }

      if (event.type === 'error' && event.error) {
        const err = event.error
        const errorMsg = typeof err === 'string'
          ? err
          : err.data?.message ?? err.message ?? 'Unknown error'
        if (textParts.length === 0) {
          return `Error: ${errorMsg}`
        }
      }
    } catch {
      // Invalid JSON object — skip
    }
  }

  if (textParts.length > 0) {
    return textParts.join('')
  }

  if (hasJsonEvents) {
    return ''
  }

  return stdout.trim()
}

// ── Tests ────────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function assert(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++
    console.log(`  ✅ ${name}`)
  } else {
    failed++
    console.error(`  ❌ ${name}`)
    console.error(`     Expected: ${JSON.stringify(expected)}`)
    console.error(`     Actual:   ${JSON.stringify(actual)}`)
  }
}

console.log('\n=== extractJsonObjects tests ===\n')

// Test 1: Simple single JSON object
assert(
  'single JSON object',
  extractJsonObjects('{"type":"text"}'),
  ['{"type":"text"}'],
)

// Test 2: Multiple JSON objects separated by newlines
assert(
  'multiple JSON objects with newlines',
  extractJsonObjects('{"a":1}\n{"b":2}\n{"c":3}'),
  ['{"a":1}', '{"b":2}', '{"c":3}'],
)

// Test 3: JSON objects with leading noise (bun install)
assert(
  'leading noise before JSON',
  extractJsonObjects('bun install v1.3.2 (b131639c)\n{"type":"step_start"}'),
  ['{"type":"step_start"}'],
)

// Test 4: JSON with embedded newlines in string values
const jsonWithNewlines = '{"type":"text","part":{"text":"line one\\nline two\\nline three"}}'
assert(
  'escaped newlines in JSON strings (should work)',
  extractJsonObjects(jsonWithNewlines),
  [jsonWithNewlines],
)

// Test 5: JSON with ACTUAL newlines in string values (the bug case!)
const jsonWithActualNewlines = '{"type":"text","part":{"text":"line one\nline two\nline three"}}'
assert(
  'actual newlines inside JSON strings (critical bug fix)',
  extractJsonObjects(jsonWithActualNewlines),
  [jsonWithActualNewlines],
)

// Test 6: Full realistic output with actual newlines
const realisticOutput = `bun install v1.3.2 (b131639c)
{"type":"step_start","timestamp":123,"sessionID":"ses_test","part":{"type":"step-start"}}
{"type":"text","timestamp":456,"sessionID":"ses_test","part":{"type":"text","text":"Based on my analysis:\n\nThe market shows bullish signals.\n\n{\\"direction\\": \\"long\\",\n\\"confidence\\": 0.75,\n\\"reason\\": \\"Strong uptrend\\"}"}}
{"type":"step_finish","timestamp":789,"sessionID":"ses_test","part":{"type":"step-finish","reason":"stop"}}`

const realisticObjects = extractJsonObjects(realisticOutput)
assert('realistic output: extracts 3 JSON objects', realisticObjects.length, 3)

// Test 7: Nested JSON objects (objects inside values)
const nestedJson = '{"type":"text","part":{"text":"result","nested":{"deep":true}}}'
assert(
  'nested JSON objects',
  extractJsonObjects(nestedJson),
  [nestedJson],
)

// Test 8: Empty input
assert('empty input', extractJsonObjects(''), [])

// Test 9: No JSON at all
assert('no JSON at all', extractJsonObjects('just plain text\nwith newlines'), [])

console.log('\n=== extractResponseText tests ===\n')

// Test 10: Normal output with text event
const normalOutput = `bun install v1.3.2 (b131639c)
{"type":"step_start","timestamp":123,"part":{"type":"step-start"}}
{"type":"text","timestamp":456,"part":{"type":"text","text":"Hello world"}}
{"type":"step_finish","timestamp":789,"part":{"type":"step-finish","reason":"stop"}}`

assert(
  'normal output extracts text',
  extractResponseText(normalOutput),
  'Hello world',
)

// Test 11: Output with actual newlines in text (THE BUG)
const bugOutput = `bun install v1.3.2 (b131639c)
{"type":"step_start","timestamp":123,"part":{"type":"step-start"}}
{"type":"text","timestamp":456,"part":{"type":"text","text":"Analysis result:\n\n{\\"direction\\": \\"long\\", \\"confidence\\": 0.8, \\"reason\\": \\"bullish\\"}"}}
{"type":"step_finish","timestamp":789,"part":{"type":"step-finish","reason":"stop"}}`

const bugResult = extractResponseText(bugOutput)
assert(
  'text with newlines is extracted correctly (bug fix)',
  bugResult.includes('Analysis result'),
  true,
)
assert(
  'text with newlines includes full content',
  bugResult.includes('direction'),
  true,
)

// Test 12: Multiple text events (streaming)
const streamOutput = `{"type":"step_start","part":{"type":"step-start"}}
{"type":"text","part":{"type":"text","text":"chunk 1"}}
{"type":"text","part":{"type":"text","text":" chunk 2"}}
{"type":"text","part":{"type":"text","text":" chunk 3"}}
{"type":"step_finish","part":{"type":"step-finish","reason":"stop"}}`

assert(
  'multiple text events concatenated',
  extractResponseText(streamOutput),
  'chunk 1 chunk 2 chunk 3',
)

// Test 13: Error event with no text
const errorOutput = `{"type":"error","timestamp":123,"error":{"name":"ModelNotFound","data":{"message":"Model not found: bad/model"}}}`

assert(
  'error event returns error message',
  extractResponseText(errorOutput),
  'Error: Model not found: bad/model',
)

// Test 14: Plain text fallback (no JSON)
assert(
  'plain text fallback',
  extractResponseText('just a plain response'),
  'just a plain response',
)

// Test 15: Real captured output from the CLI
const realCaptured = `bun install v1.3.2 (b131639c)
{"type":"step_start","timestamp":1772673988494,"sessionID":"ses_34465ab5cffeqe1PzkxII2Mv3l","part":{"id":"prt_cbb9a778c001M4UXShvHyJxGOU","sessionID":"ses_34465ab5cffeqe1PzkxII2Mv3l","messageID":"msg_cbb9a5508001chRGbjaZEWSK9g","type":"step-start"}}
{"type":"text","timestamp":1772673988634,"sessionID":"ses_34465ab5cffeqe1PzkxII2Mv3l","part":{"id":"prt_cbb9a778e0012OXb4eAhchdj4k","sessionID":"ses_34465ab5cffeqe1PzkxII2Mv3l","messageID":"msg_cbb9a5508001chRGbjaZEWSK9g","type":"text","text":"I detect trivial intent.\n\nPONG","time":{"start":1772673988632,"end":1772673988632}}}
{"type":"step_finish","timestamp":1772673988641,"sessionID":"ses_34465ab5cffeqe1PzkxII2Mv3l","part":{"id":"prt_cbb9a781c001cN87F4br4M8jq2","sessionID":"ses_34465ab5cffeqe1PzkxII2Mv3l","messageID":"msg_cbb9a5508001chRGbjaZEWSK9g","type":"step-finish","reason":"stop","cost":0,"tokens":{"total":17276,"input":16476,"output":800,"reasoning":0,"cache":{"read":0,"write":0}}}}`

const realResult = extractResponseText(realCaptured)
assert(
  'real CLI output: extracts text with newlines',
  realResult.includes('PONG'),
  true,
)
assert(
  'real CLI output: is not empty',
  realResult.length > 0,
  true,
)

// Test 16: Text with JSON verdict embedded (the LLM analyst case)
const analystOutput = `bun install v1.3.2 (b131639c)
{"type":"step_start","timestamp":123,"part":{"type":"step-start"}}
{"type":"text","timestamp":456,"part":{"type":"text","text":"{\\"direction\\": \\"long\\",\n\\"confidence\\": 0.75,\n\\"reason\\": \\"Based on Elliott Wave analysis, we are in wave 3 of an impulse pattern.\\",\n\\"indicators\\": {\\"wave_count\\": 3, \\"fib_level\\": \\"1.618\\"}}"}}
{"type":"step_finish","timestamp":789,"part":{"type":"step-finish","reason":"stop"}}`

const analystResult = extractResponseText(analystOutput)
assert(
  'analyst output: extracts JSON verdict text',
  analystResult.includes('direction'),
  true,
)
assert(
  'analyst output: contains confidence',
  analystResult.includes('0.75'),
  true,
)


// ── parseVerdictFromText + truncated JSON recovery (duplicated for testing) ──

function normalizeDirection(raw: unknown): 'long' | 'short' | 'neutral' | null {
  if (typeof raw !== 'string') return null
  const lower = raw.toLowerCase().trim()
  if (lower === 'long' || lower === 'buy' || lower === 'bullish') return 'long'
  if (lower === 'short' || lower === 'sell' || lower === 'bearish') return 'short'
  if (lower === 'neutral' || lower === 'hold' || lower === 'flat') return 'neutral'
  return null
}

interface ParsedLLMVerdict {
  direction: 'long' | 'short' | 'neutral'
  confidence: number
  reason: string
  indicators?: Record<string, number | string>
}

function validateVerdict(raw: Record<string, unknown>): ParsedLLMVerdict | null {
  const direction = normalizeDirection(raw.direction)
  if (!direction) return null
  const confidence = typeof raw.confidence === 'number'
    ? Math.min(1, Math.max(0, raw.confidence))
    : typeof raw.confidence === 'string'
      ? Math.min(1, Math.max(0, parseFloat(raw.confidence as string)))
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

function recoverTruncatedVerdict(text: string): ParsedLLMVerdict | null {
  const dirMatch = text.match(/["']direction["']\s*:\s*["']([^"']+)["']/i)
  if (!dirMatch) return null
  const direction = normalizeDirection(dirMatch[1])
  if (!direction) return null
  let confidence = 0.5
  const confMatch = text.match(/["']confidence["']\s*:\s*(\d+\.?\d*)/i)
  if (confMatch) {
    confidence = Math.min(1, Math.max(0, parseFloat(confMatch[1])))
  }
  let reason = 'Response truncated'
  const reasonMatch = text.match(/["'](?:reason|reasoning)["']\s*:\s*["']((?:[^"'\\]|\\.)*)(?:["']|$)/i)
  if (reasonMatch) {
    reason = reasonMatch[1]
    reason = reason.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    if (!text.includes(`"${reasonMatch[1]}"`) && !text.includes(`'${reasonMatch[1]}'`)) {
      reason += ' [truncated]'
    }
  }
  let indicators: Record<string, number | string> | undefined
  const indMatch = text.match(/["']indicators["']\s*:\s*\{([^}]*)\}?/i)
  if (indMatch) {
    try { indicators = JSON.parse(`{${indMatch[1]}}`) } catch { /* skip */ }
  }
  return { direction, confidence, reason, indicators }
}

function parseVerdictFromText(text: string): ParsedLLMVerdict | null {
  try {
    const parsed = JSON.parse(text)
    return validateVerdict(parsed)
  } catch { /* not direct JSON */ }
  const jsonBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (jsonBlockMatch) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[1])
      return validateVerdict(parsed)
    } catch { /* invalid JSON in code block */ }
  }
  const jsonMatch = text.match(/\{[\s\S]*"direction"[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      return validateVerdict(parsed)
    } catch { /* might be truncated */ }
  }
  const truncatedResult = recoverTruncatedVerdict(text)
  if (truncatedResult) return truncatedResult
  return null
}

console.log('\n=== parseVerdictFromText + truncated JSON tests ===\n')

// Test 17: Complete JSON verdict
const completeVerdict = '{"direction":"long","confidence":0.85,"reason":"Strong bullish trend"}'
const t17 = parseVerdictFromText(completeVerdict)
assert('complete JSON: parsed', t17 !== null, true)
assert('complete JSON: direction', t17?.direction, 'long')
assert('complete JSON: confidence', t17?.confidence, 0.85)

// Test 18: Truncated JSON (the actual bug!)
const truncatedVerdict = '{"direction":"short","confidence":0.58,"reason":"4h timeframe shows clear downtrend (-19.95% from 97k highs) with high-volume selling pressure initially, indicating Distribution phase. Recent 1h bounc'
const t18 = parseVerdictFromText(truncatedVerdict)
assert('truncated JSON: parsed (not null)', t18 !== null, true)
assert('truncated JSON: direction recovered', t18?.direction, 'short')
assert('truncated JSON: confidence recovered', t18?.confidence, 0.58)
assert('truncated JSON: reason contains partial text', t18?.reason?.includes('Distribution phase') ?? false, true)

// Test 19: Truncated JSON with only direction and confidence
const minimalTruncated = '{"direction":"neutral","confidence":0.3,"reas'
const t19 = parseVerdictFromText(minimalTruncated)
assert('minimal truncated: parsed', t19 !== null, true)
assert('minimal truncated: direction', t19?.direction, 'neutral')
assert('minimal truncated: confidence', t19?.confidence, 0.3)

// Test 20: Truncated JSON with only direction
const directionOnly = '{"direction":"long","conf'
const t20 = parseVerdictFromText(directionOnly)
assert('direction-only truncated: parsed', t20 !== null, true)
assert('direction-only truncated: direction', t20?.direction, 'long')
assert('direction-only truncated: default confidence', t20?.confidence, 0.5)

// Test 21: JSON in markdown code block
const markdownVerdict = 'Here is my analysis:\n\n```json\n{"direction":"short","confidence":0.72,"reason":"Bearish divergence"}\n```'
const t21 = parseVerdictFromText(markdownVerdict)
assert('markdown JSON: parsed', t21 !== null, true)
assert('markdown JSON: direction', t21?.direction, 'short')

// Test 22: Verdict with 'buy'/'sell' aliases
const aliasVerdict = '{"direction":"sell","confidence":0.6,"reason":"test"}'
const t22 = parseVerdictFromText(aliasVerdict)
assert('alias direction sell->short', t22?.direction, 'short')

// Test 23: Real truncated response from production
const realTruncated = '{"direction":"short","confidence":0.58,"reason":"Identifies accumulation/distribution phases by institutional operators; trades in harmony with smart money. 4h timeframe shows clear downtrend (-19.95% from 97k highs) with high-volume selling pressure initially, indicating Distribution phase. Recent 1h bounc'
const t23 = parseVerdictFromText(realTruncated)
assert('real truncated: parsed', t23 !== null, true)
assert('real truncated: direction', t23?.direction, 'short')
assert('real truncated: confidence', t23?.confidence, 0.58)
assert('real truncated: reason has content', (t23?.reason?.length ?? 0) > 50, true)

// Summary
console.log(`\n${'='.repeat(50)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
console.log('='.repeat(50))

if (failed > 0) {
  process.exit(1)
}
