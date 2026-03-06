/**
 * AES-256-GCM Encryption Module for OpenCode Config Bundles
 *
 * Encrypts/decrypts OpenCode configuration directories into a single
 * encrypted blob for secure server-side storage.
 *
 * Flow:
 *   Encrypt: tar directory → AES-256-GCM encrypt → single Buffer
 *   Decrypt: AES-256-GCM decrypt → untar → restore directory
 *
 * The encryption key is derived from a random 32-byte secret,
 * which is returned to the user as their "password hash".
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'crypto'
import { mkdirSync, readdirSync, statSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'

// ── Constants ────────────────────────────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // 96-bit IV for GCM (NIST recommended)
const AUTH_TAG_LENGTH = 16 // 128-bit authentication tag
const KEY_LENGTH = 32 // 256-bit key

// ── Types ────────────────────────────────────────────────────────────────────

export interface EncryptionResult {
  /** The encrypted blob: [iv(12) | authTag(16) | ciphertext] */
  encryptedBlob: Buffer
  /** The 32-byte key encoded as base64url — this is the user's "password" */
  passwordHash: string
}

// ── Key Generation ───────────────────────────────────────────────────────────

/**
 * Generate a new random 256-bit encryption key.
 * Returns it as a base64url-encoded string (the user's "password hash").
 */
export function generatePasswordHash(): string {
  return randomBytes(KEY_LENGTH).toString('base64url')
}

/**
 * Decode a base64url password hash back to a 32-byte Buffer key.
 */
export function decodePasswordHash(passwordHash: string): Buffer {
  const key = Buffer.from(passwordHash, 'base64url')
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Invalid password hash: expected ${KEY_LENGTH} bytes, got ${key.length}`)
  }
  return key
}

// ── Tar-like Packing (no external dependency) ────────────────────────────────

interface PackedEntry {
  /** Relative path from the root directory */
  relativePath: string
  /** File contents */
  data: Buffer
}

/**
 * Recursively collect all files in a directory into PackedEntry[].
 */
function packDirectory(dirPath: string, basePath = ''): PackedEntry[] {
  const entries: PackedEntry[] = []
  const items = readdirSync(dirPath)

  for (const item of items) {
    const fullPath = path.join(dirPath, item)
    const relativePath = basePath ? `${basePath}/${item}` : item
    const stat = statSync(fullPath)

    if (stat.isDirectory()) {
      entries.push(...packDirectory(fullPath, relativePath))
    } else if (stat.isFile()) {
      entries.push({
        relativePath,
        data: readFileSync(fullPath),
      })
    }
  }

  return entries
}

/**
 * Serialize PackedEntry[] into a single Buffer.
 *
 * Format per entry:
 *   [pathLength: uint32LE] [path: utf8] [dataLength: uint32LE] [data: bytes]
 *
 * Header:
 *   [entryCount: uint32LE]
 */
function serializeEntries(entries: PackedEntry[]): Buffer {
  const chunks: Buffer[] = []

  // Entry count
  const countBuf = Buffer.alloc(4)
  countBuf.writeUInt32LE(entries.length)
  chunks.push(countBuf)

  for (const entry of entries) {
    const pathBuf = Buffer.from(entry.relativePath, 'utf-8')

    // Path length + path
    const pathLenBuf = Buffer.alloc(4)
    pathLenBuf.writeUInt32LE(pathBuf.length)
    chunks.push(pathLenBuf, pathBuf)

    // Data length + data
    const dataLenBuf = Buffer.alloc(4)
    dataLenBuf.writeUInt32LE(entry.data.length)
    chunks.push(dataLenBuf, entry.data)
  }

  return Buffer.concat(chunks)
}

/**
 * Deserialize a Buffer back into PackedEntry[].
 */
function deserializeEntries(buf: Buffer): PackedEntry[] {
  const entries: PackedEntry[] = []
  let offset = 0

  const entryCount = buf.readUInt32LE(offset)
  offset += 4

  for (let i = 0; i < entryCount; i++) {
    const pathLen = buf.readUInt32LE(offset)
    offset += 4

    const relativePath = buf.subarray(offset, offset + pathLen).toString('utf-8')
    offset += pathLen

    const dataLen = buf.readUInt32LE(offset)
    offset += 4

    const data = buf.subarray(offset, offset + dataLen)
    offset += dataLen

    entries.push({ relativePath, data: Buffer.from(data) })
  }

  return entries
}

// ── Encryption / Decryption ──────────────────────────────────────────────────

/**
 * Encrypt a Buffer using AES-256-GCM.
 *
 * Returns: [iv(12) | authTag(16) | ciphertext]
 */
export function encryptBuffer(plaintext: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const ciphertext = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
  ])

  const authTag = cipher.getAuthTag()

  // Format: [iv | authTag | ciphertext]
  return Buffer.concat([iv, authTag, ciphertext])
}

/**
 * Decrypt a Buffer encrypted with encryptBuffer().
 *
 * Input: [iv(12) | authTag(16) | ciphertext]
 */
export function decryptBuffer(encrypted: Buffer, key: Buffer): Buffer {
  if (encrypted.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Encrypted data too short — invalid format')
  }

  const iv = encrypted.subarray(0, IV_LENGTH)
  const authTag = encrypted.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = encrypted.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ])
}

// ── High-Level API ───────────────────────────────────────────────────────────

/**
 * Encrypt a directory into a single encrypted blob.
 *
 * 1. Recursively packs all files into a custom archive format
 * 2. Encrypts the archive with AES-256-GCM
 * 3. Returns the encrypted blob + the password hash (key)
 */
export function encryptDirectory(dirPath: string): EncryptionResult {
  const entries = packDirectory(dirPath)
  if (entries.length === 0) {
    throw new Error(`No files found in directory: ${dirPath}`)
  }

  const serialized = serializeEntries(entries)
  const key = randomBytes(KEY_LENGTH)
  const encryptedBlob = encryptBuffer(serialized, key)
  const passwordHash = key.toString('base64url')

  return { encryptedBlob, passwordHash }
}

/**
 * Encrypt multiple source paths (files and directories) into a single encrypted blob.
 *
 * Each source path is packed with a prefix to maintain structure:
 *   ~/.config/opencode/foo.json → config/opencode/foo.json
 *   ~/.local/share/opencode/auth.json → local/share/opencode/auth.json
 *   ~/.opencode/bar → opencode/bar
 */
export function encryptConfigBundle(sources: { path: string; prefix: string }[]): EncryptionResult {
  const allEntries: PackedEntry[] = []

  for (const source of sources) {
    const stat = statSync(source.path)
    if (stat.isDirectory()) {
      const dirEntries = packDirectory(source.path)
      for (const entry of dirEntries) {
        allEntries.push({
          relativePath: `${source.prefix}/${entry.relativePath}`,
          data: entry.data,
        })
      }
    } else if (stat.isFile()) {
      allEntries.push({
        relativePath: source.prefix,
        data: readFileSync(source.path),
      })
    }
  }

  if (allEntries.length === 0) {
    throw new Error('No files found in any source path')
  }

  const serialized = serializeEntries(allEntries)
  const key = randomBytes(KEY_LENGTH)
  const encryptedBlob = encryptBuffer(serialized, key)
  const passwordHash = key.toString('base64url')

  return { encryptedBlob, passwordHash }
}

/**
 * Encrypt raw buffer data (from uploaded files) into an encrypted blob.
 * Used when configs are uploaded via HTTP (not read from filesystem).
 */
export function encryptRawBundle(serializedData: Buffer): EncryptionResult {
  const key = randomBytes(KEY_LENGTH)
  const encryptedBlob = encryptBuffer(serializedData, key)
  const passwordHash = key.toString('base64url')

  return { encryptedBlob, passwordHash }
}

/**
 * Decrypt an encrypted blob and restore files to a target directory.
 *
 * @param encryptedBlob - The encrypted archive blob
 * @param passwordHash - The base64url-encoded password hash
 * @param outputDir - Directory to restore files into
 * @returns Array of restored file paths (absolute)
 */
export function decryptToDirectory(
  encryptedBlob: Buffer,
  passwordHash: string,
  outputDir: string,
): string[] {
  const key = decodePasswordHash(passwordHash)
  const serialized = decryptBuffer(encryptedBlob, key)
  const entries = deserializeEntries(serialized)
  const restoredPaths: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(outputDir, entry.relativePath)
    const dir = path.dirname(fullPath)
    mkdirSync(dir, { recursive: true })
    writeFileSync(fullPath, entry.data)
    restoredPaths.push(fullPath)
  }

  return restoredPaths
}

/**
 * Serialize uploaded files into the packed format for encryption.
 * Used by the upload API endpoint.
 *
 * @param files - Array of { relativePath, data } from multipart upload
 */
export function serializeUploadedFiles(
  files: Array<{ relativePath: string; data: Buffer }>,
): Buffer {
  const entries: PackedEntry[] = files.map((f) => ({
    relativePath: f.relativePath,
    data: f.data,
  }))
  return serializeEntries(entries)
}
