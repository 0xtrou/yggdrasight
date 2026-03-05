import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/oculus-trading'

declare global {
  // eslint-disable-next-line no-var
  var _mongooseCache: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null }
}

if (!global._mongooseCache) {
  global._mongooseCache = { conn: null, promise: null }
}

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

export { mongoose }
