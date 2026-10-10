import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

type Db = ReturnType<typeof drizzle>

let db: Db | null = null
const scopedDatabases = new WeakMap<AbortSignal, Db>()

export function getDb(signal?: AbortSignal): Db {
  if (signal) {
    signal.throwIfAborted()
    const existing = scopedDatabases.get(signal)
    if (existing) return existing
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    const scoped = drizzle(neon(url, { fetchOptions: { signal } }), { schema })
    scopedDatabases.set(signal, scoped)
    return scoped
  }
  if (!db) {
    const databaseUrl = process.env.DATABASE_URL
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required')
    }
    db = drizzle(neon(databaseUrl), { schema })
  }

  return db
}
