import { FileCard, PageIntro } from '@/components/review/review-ui'
import { SiteFooter } from '@/components/site/site-footer'
import { SiteHeader } from '@/components/site/site-header'

export function LegalShell({
  title,
  slug,
  updatedAt,
  children,
}: {
  title: string
  slug: string
  updatedAt: string
  children: React.ReactNode
}) {
  return (
    <div className="relative flex-1">
      <SiteHeader width="max-w-3xl" />

      <main className="relative z-10 mx-auto max-w-3xl px-5 py-14 sm:px-6">
        <PageIntro
          path={[{ label: 'stackpulse', href: '/' }, { label: slug }]}
          title={title}
          lede={<p className="font-mono text-[13px]">Last updated {updatedAt}</p>}
        />

        <FileCard path={`${slug}.md`} meta={`updated ${updatedAt}`} className="mt-10">
          <div className="legal-prose px-5 pb-6 pt-2 text-[15px] leading-relaxed text-dust sm:px-7">
            {children}
          </div>
        </FileCard>
      </main>

      <SiteFooter width="max-w-3xl" />
    </div>
  )
}
