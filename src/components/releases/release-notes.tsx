import type { PublicStackRelease } from '@/lib/public-stacks'

export function ReleaseNotes({
  release,
}: {
  release: PublicStackRelease & { codeSnippet?: string | null }
}) {
  const hasReleaseSignals = Boolean(
    release.securityNotes?.length ||
    release.breakingChanges?.length ||
    release.deprecations?.length ||
    release.newFeatures?.length,
  )
  return (
    <>
      {release.summary && (
        <p className="mt-2.5 text-[14px] leading-relaxed text-dust">{release.summary}</p>
      )}

      {(release.impactSummary || release.recommendedAction) && (
        <div className="mt-5 grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2">
          {release.impactSummary && (
            <InfoBlock label="affected" tone="cyan" body={release.impactSummary} />
          )}
          {release.recommendedAction && (
            <InfoBlock label="action" tone="lime" body={release.recommendedAction} />
          )}
        </div>
      )}

      {hasReleaseSignals && (
        <div className="mt-5 rounded-md border border-line bg-void overflow-hidden">
          <div className="border-b border-line px-3 py-2 font-mono text-[10px] text-fade">
            release_signals
          </div>
          <div className="font-mono text-[12.5px] leading-[1.7]">
            {release.breakingChanges?.map((change) => (
              <SignalLine key={`b-${change}`} prefix="-" tone="rose" text={change} />
            ))}
            {release.securityNotes?.map((note) => (
              <SignalLine key={`s-${note}`} prefix="!" tone="rose" text={note} />
            ))}
            {release.deprecations?.map((deprecation) => (
              <SignalLine key={`d-${deprecation}`} prefix="!" tone="amber" text={deprecation} />
            ))}
            {release.newFeatures?.map((feature) => (
              <SignalLine key={`f-${feature}`} prefix="+" tone="emerald" text={feature} />
            ))}
          </div>
        </div>
      )}

      {release.migrationSteps?.length ? (
        <div className="mt-5 rounded-md border border-line bg-void overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-3 py-2 font-mono text-[10px] text-fade">
            <span>migration_steps</span>
            <span>{release.migrationSteps.length} steps</span>
          </div>
          <ol className="font-mono text-[12.5px] leading-[1.7]">
            {release.migrationSteps.map((step, index) => (
              <li key={step} className="flex gap-3 px-3 py-1.5">
                <span className="select-none text-cyan">{String(index + 1).padStart(2, '0')}</span>
                <span className="text-ink">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {release.codeSnippet && (
        <section
          className="mt-5 overflow-hidden rounded-md border border-line bg-void"
          aria-label="Code snippet"
        >
          <div className="border-b border-line px-3 py-2 font-mono text-[10px] text-fade">
            code_snippet
          </div>
          <pre className="!m-0 !border-0 !rounded-none overflow-x-auto px-4 py-3 text-[12.5px]">
            <code>{release.codeSnippet}</code>
          </pre>
        </section>
      )}
    </>
  )
}

function InfoBlock({ label, body, tone }: { label: string; body: string; tone: 'cyan' | 'lime' }) {
  return (
    <div className="bg-void px-3 py-3">
      <div
        className={`font-mono text-[10px] uppercase tracking-[0.18em] ${
          tone === 'cyan' ? 'text-cyan' : 'text-lime'
        }`}
      >
        {label}
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-dust">{body}</p>
    </div>
  )
}

function SignalLine({
  prefix,
  tone,
  text,
}: {
  prefix: string
  tone: 'rose' | 'amber' | 'emerald'
  text: string
}) {
  const toneClass =
    tone === 'rose'
      ? 'border-rose bg-rose/[0.04] text-rose'
      : tone === 'amber'
        ? 'border-amber bg-amber/[0.04] text-amber'
        : 'border-emerald bg-emerald/[0.04] text-emerald'

  return (
    <div className={`flex gap-3 border-l-2 px-3 py-1 ${toneClass}`}>
      <span className="shrink-0 select-none">{prefix}</span>
      <span className="text-ink">{text}</span>
    </div>
  )
}
