import { getAuth } from '@/lib/auth'
import { getDb } from '@/db'
import { technologies, userTechPreferences } from '@/db/schema'
import { headers } from 'next/headers'
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight01Icon } from 'hugeicons-react'
import { Suspense } from 'react'
import { Logo } from '@/components/logo'
import { TechSelector } from '@/components/tech-selector'
import { UserMenu } from '@/components/dashboard/user-menu'
import OnboardingLoading from './loading'

export default function OnboardingPage() {
  return (
    <Suspense fallback={<OnboardingLoading />}>
      <OnboardingContent />
    </Suspense>
  )
}

async function OnboardingContent() {
  const requestHeaders = await headers()
  const session = await getAuth().api.getSession({
    headers: requestHeaders,
  })

  if (!session) redirect('/sign-in')

  const db = getDb()
  const [allTechs, userPrefs] = await Promise.all([
    db.select().from(technologies),
    db
      .select({ techId: userTechPreferences.techId })
      .from(userTechPreferences)
      .where(eq(userTechPreferences.userId, session.user.id)),
  ])

  return (
    <div className="flex-1">
      <header className="sticky top-0 z-30 border-b border-line bg-void/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 h-14 flex items-center justify-between">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <Logo size="sm" />
          </Link>
          <div className="hidden sm:flex items-center gap-2 font-mono text-[11px] text-fade">
            <span className="text-mute">~/</span>
            <span className="text-dust">onboarding</span>
            <span className="text-mute">/</span>
            <span className="text-lime">configure</span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[11px]">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-fade hover:text-dust transition-colors"
            >
              skip
              <ArrowRight01Icon className="w-3 h-3" />
            </Link>
            <span className="text-mute">·</span>
            <UserMenu email={session.user.email} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12 relative z-10">
        <div className="animate-fade-up">
          <div className="flex items-center gap-3 font-mono text-[11px] text-fade tracking-[0.2em] uppercase">
            <span className="text-lime">§</span>
            <span>step 01</span>
            <span className="text-mute">/</span>
            <span>configure</span>
          </div>
          <h1 className="mt-3 font-mono text-3xl sm:text-[40px] font-bold tracking-tight text-ink lowercase">
            choose your stack<span className="text-lime">.</span>
          </h1>
          <p className="mt-2 text-dust text-[14px] max-w-xl">
            Select the frameworks and libraries you ship with. We&apos;ll watch their GitHub
            releases and turn each one into a daily, scannable digest.
          </p>
        </div>

        <div className="mt-10">
          <TechSelector allTechs={allTechs} initialSelectedIds={userPrefs.map((p) => p.techId)} />
        </div>
      </main>
    </div>
  )
}
