'use client'

import Link from 'next/link'

import { UserMenu } from '@/components/dashboard/user-menu'
import { useSession } from '@/lib/auth-client'
import { safeReturnPath } from '@/lib/auth-return-path'

export function ReleaseAuth({ returnPath }: { returnPath: string }) {
  const { data: session } = useSession()

  if (session) return <UserMenu email={session.user.email} />

  return (
    <Link
      href={`/sign-in?returnTo=${encodeURIComponent(safeReturnPath(returnPath))}`}
      className="inline-flex min-h-11 items-center font-mono text-[12px] text-lime hover:underline"
    >
      Sign in
    </Link>
  )
}
