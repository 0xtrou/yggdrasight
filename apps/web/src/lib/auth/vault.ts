/**
 * OpenCode Vault — Encrypted Config Storage & Lifecycle Manager
 *
 * Manages the full lifecycle of encrypted OpenCode auth credentials:
 *   1. Store encrypted auth.json blob in user's MongoDB via GridFS
 *   2. Decrypt auth.json to a temporary file for Docker container mounts
 *   3. Clean up temp files after container exits
 *
 * Only auth.json is required — OpenCode works without ~/.opencode/ or ~/.config/opencode/.
 */
import mongoose from 'mongoose'
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { Readable } from 'stream'

import {
  encryptBuffer,
  decryptBuffer,
  decodePasswordHash,
  serializeUploadedFiles,
  decryptToDirectory,
} from './crypto'

// ── Constants ────────────────────────────────────────────────────────────────

const GRIDFS_BUCKET_NAME = 'opencode_configs'
const CONFIG_FILENAME = 'opencode-config.enc'

// ── Types ────────────────────────────────────────────────────────────────────

export interface VaultStoreResult {
  /** GridFS file ID */
  fileId: string
  /** Size of the encrypted blob in bytes */
  size: number
}

export interface DecryptedConfigPaths {
  /** Root temp directory containing the restored auth.json */
  rootDir: string
  /** Path to .local/share/opencode/auth.json */
  authJsonPath: string
}

// ── GridFS Helpers ───────────────────────────────────────────────────────────

/**
 * Get a GridFS bucket for the given Mongoose connection.
 */
function getBucket(connection: mongoose.Connection): mongoose.mongo.GridFSBucket {
  const db = connection.db
  if (!db) throw new Error('MongoDB connection not established')
  return new mongoose.mongo.GridFSBucket(db, { bucketName: GRIDFS_BUCKET_NAME })
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Store an encrypted config blob in the user's MongoDB via GridFS.
 *
 * @param connection - Mongoose connection to the user's MongoDB
 * @param encryptedBlob - The AES-256-GCM encrypted config bundle
 * @returns VaultStoreResult with the GridFS file ID and size
 */
export async function storeEncryptedConfig(
  connection: mongoose.Connection,
  encryptedBlob: Buffer,
): Promise<VaultStoreResult> {
  const bucket = getBucket(connection)

  // Delete any existing config first (one config per user)
  const existing = await bucket.find({ filename: CONFIG_FILENAME }).toArray()
  for (const file of existing) {
    await bucket.delete(file._id)
  }

  // Upload new encrypted blob
  const uploadStream = bucket.openUploadStream(CONFIG_FILENAME, {
    metadata: {
      encryptedAt: new Date().toISOString(),
      algorithm: 'aes-256-gcm',
    },
  })

  const readable = Readable.from(encryptedBlob)
  await new Promise<void>((resolve, reject) => {
    readable.pipe(uploadStream)
      .on('finish', resolve)
      .on('error', reject)
  })

  return {
    fileId: String(uploadStream.id),
    size: encryptedBlob.length,
  }
}

/**
 * Retrieve the encrypted config blob from the user's MongoDB.
 *
 * @param connection - Mongoose connection to the user's MongoDB
 * @returns The encrypted blob Buffer, or null if not found
 */
export async function retrieveEncryptedConfig(
  connection: mongoose.Connection,
): Promise<Buffer | null> {
  const bucket = getBucket(connection)

  const files = await bucket.find({ filename: CONFIG_FILENAME }).toArray()
  if (files.length === 0) return null

  // Download the file
  const downloadStream = bucket.openDownloadStreamByName(CONFIG_FILENAME)
  const chunks: Buffer[] = []

  return new Promise<Buffer>((resolve, reject) => {
    downloadStream.on('data', (chunk: Buffer) => chunks.push(chunk))
    downloadStream.on('end', () => resolve(Buffer.concat(chunks)))
    downloadStream.on('error', reject)
  })
}

/**
 * Decrypt the user's config from MongoDB and restore to a temp directory.
 *
 * This is the core function called before every Docker container run.
 * It:
 *   1. Fetches the encrypted blob from GridFS
 *   2. Decrypts it with the user's password hash
 *   3. Restores the file structure to a temp directory
 *   4. Returns paths for Docker volume mounts
 *
 * The caller MUST call cleanupDecryptedConfig() after the container exits.
 *
 * @param connection - Mongoose connection to the user's MongoDB
 * @param passwordHash - The user's base64url password hash
 * @returns DecryptedConfigPaths with mount paths, or null if no config stored
 */
export async function decryptConfigForMount(
  connection: mongoose.Connection,
  passwordHash: string,
): Promise<DecryptedConfigPaths | null> {
  const encryptedBlob = await retrieveEncryptedConfig(connection)
  if (!encryptedBlob) return null

  // Create a unique temp directory
  const tempRoot = path.join(tmpdir(), `oculus-config-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  mkdirSync(tempRoot, { recursive: true })

  // Decrypt and restore all files to temp directory
  decryptToDirectory(encryptedBlob, passwordHash, tempRoot)

  // Ensure auth.json directory exists
  const authDir = path.join(tempRoot, '.local', 'share', 'opencode')
  mkdirSync(authDir, { recursive: true })

  return {
    rootDir: tempRoot,
    authJsonPath: path.join(authDir, 'auth.json'),
  }
}

/**
 * Clean up a temp directory created by decryptConfigForMount().
 */
export function cleanupDecryptedConfig(configPaths: DecryptedConfigPaths): void {
  try {
    if (existsSync(configPaths.rootDir)) {
      rmSync(configPaths.rootDir, { recursive: true, force: true })
    }
  } catch (err) {
    console.warn('[vault] Failed to cleanup temp config:', err)
  }
}

/**
 * Process uploaded files and store them encrypted in the user's MongoDB.
 *
 * @param connection - Mongoose connection to the user's MongoDB
 * @param files - Uploaded files with their relative paths
 * @param passwordHash - The password hash to encrypt with
 * @returns VaultStoreResult
 */
export async function processAndStoreUpload(
  connection: mongoose.Connection,
  files: Array<{ relativePath: string; data: Buffer }>,
  passwordHash: string,
): Promise<VaultStoreResult> {
  const serialized = serializeUploadedFiles(files)
  const key = decodePasswordHash(passwordHash)
  const encrypted = encryptBuffer(serialized, key)

  return storeEncryptedConfig(connection, encrypted)
}

/**
 * Check if a user has a stored config in their MongoDB.
 */
export async function hasStoredConfig(connection: mongoose.Connection): Promise<boolean> {
  const bucket = getBucket(connection)
  const files = await bucket.find({ filename: CONFIG_FILENAME }).toArray()
  return files.length > 0
}
