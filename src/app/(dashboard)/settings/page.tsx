import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

import { Logo } from '@/components/logo'
import { UserMenu } from '@/components/dashboard/user-menu'
import { WebhookSettings } from '@/components/dashboard/webhook-settings'
import { getAuth } from '@/lib/auth'
import { getUserWebhook } from '@/lib/webhooks'
import SettingsLoading from './loading'

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Notification settings for your StackPulse feed.',
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <SettingsContent />
    </Suspense>
  )
}

async function SettingsContent() {
  const requestHeaders = await headers()
  const session = await getAuth().api.getSession({
    headers: requestHeaders,
  })

  if (!session) redirect('/sign-in')

  const webhook = await getUserWebhook(session.user.id)

  return (
    <div className="flex-1">
      <header className="sticky top-0 z-30 border-b border-line bg-void/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 h-14 flex items-center justify-between">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <Logo size="sm" />
          </Link>
          <div className="hidden sm:flex items-center gap-2 font-mono text-[11px] text-fade">
            <span className="text-mute">~/</span>
            <span className="text-dust">dashboard</span>
            <span className="text-mute">/</span>
            <span className="text-lime">settings</span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[11px]">
            <Link href="/dashboard" className="text-dust hover:text-lime transition-colors">
              back to feed
            </Link>
            <span className="text-mute">·</span>
            <UserMenu email={session.user.email} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12 relative z-10">
        <div className="animate-fade-up">
          <div className="flex items-center gap-3 font-mono text-[11px] text-fade tracking-[0.2em] uppercase">
            <span className="text-lime">§</span>
            <span>settings</span>
            <span className="text-mute">/</span>
            <span>notifications</span>
          </div>
          <h1 className="mt-3 font-mono text-3xl sm:text-[40px] font-bold tracking-tight text-ink lowercase">
            notifications
            <span className="text-lime">.</span>
          </h1>
          <p className="mt-2 text-dust text-[14px]">
            Push new releases for your followed stacks to Slack or Discord.
          </p>
        </div>

        <div className="mt-8 animate-fade-up">
          <WebhookSettings initial={webhook} />
        </div>
      </main>
    </div>
  )
}
