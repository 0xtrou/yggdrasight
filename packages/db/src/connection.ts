import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/oculus-trading'

declare global {
  // eslint-disable-next-line no-var
  var _mongooseCache: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null }
}

if (!global._mongooseCache) {
  global._mongooseCache = { conn: null, promise: null }
}

/**
 * Connect to the default (system) MongoDB.
 * Used by the user registry and as fallback for non-authenticated routes.
 */
export async function connectDB(): Promise<typeof mongoose> {
  if (global._mongooseCache.conn) {
    return global._mongooseCache.conn
  }
  if (!global._mongooseCache.promise) {
    global._mongooseCache.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
    })
  }
  global._mongooseCache.conn = await global._mongooseCache.promise
  return global._mongooseCache.conn
}

/**
 * Register all @oculus/db schemas on a given Mongoose connection.
 * Returns model constructors bound to that connection.
 *
 * This is used for per-user MongoDB connections — each user gets their own
 * isolated DB, so we need models registered on their specific connection
 * rather than the default mongoose singleton.
 */
export function getModelsForConnection(connection: mongoose.Connection) {
  // Import schemas lazily to avoid circular deps
  const { SignalSchema } = require('./models/signal.model')
  const { TrackedAssetSchema } = require('./models/tracked-asset.model')
  const { CryptoProjectSchema } = require('./models/project.model')
  const { MilestoneSchema } = require('./models/milestone.model')
  const { SignalProviderSchema } = require('./models/provider.model')

  return {
    Signal: connection.models.Signal || connection.model('Signal', SignalSchema),
    TrackedAsset: connection.models.TrackedAsset || connection.model('TrackedAsset', TrackedAssetSchema),
    CryptoProject: connection.models.CryptoProject || connection.model('CryptoProject', CryptoProjectSchema),
    Milestone: connection.models.Milestone || connection.model('Milestone', MilestoneSchema),
    SignalProvider: connection.models.SignalProvider || connection.model('SignalProvider', SignalProviderSchema),
  }
}

export { mongoose }
