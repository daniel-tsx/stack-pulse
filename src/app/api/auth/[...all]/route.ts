import { getAuth } from '@/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'
import { connection } from 'next/server'

export async function GET(request: Request) {
  await connection()
  return toNextJsHandler(getAuth()).GET(request)
}

export async function POST(request: Request) {
  return toNextJsHandler(getAuth()).POST(request)
}
