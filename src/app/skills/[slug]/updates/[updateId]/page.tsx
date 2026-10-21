import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SkillDate, SkillPanel, SkillShell } from '@/components/skills/skill-ui'
import { getPublicSkillUpdate, skillAnalysisLabel } from '@/lib/public-skills'

type Props = { params: Promise<{ slug: string; updateId: string }> }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, updateId } = await params
  const data = await getPublicSkillUpdate(slug, updateId)
  return data
    ? {
        title: `${data.skill.name} · ${data.update.newRevision.slice(0, 7)} impact report`,
        description:
          data.update.report?.summary.slice(0, 180) ?? 'Skill change detected; analysis pending.',
        alternates: { canonical: `/skills/${slug}/updates/${updateId}` },
      }
    : { title: 'Update not found', robots: { index: false } }
}

export default async function SkillUpdatePage({ params }: Props) {
  const { slug, updateId } = await params
  const data = await getPublicSkillUpdate(slug, updateId)
  if (!data) notFound()
  const { skill, update } = data
  const report = update.report
  const blobUrl = (path: string, side: string) => {
    const file = update.evidence?.files.find(
      (file) => file.path === path || file.previousPath === path,
    )
    const revisionPath = file
      ? side === 'before'
        ? (file.previousPath ?? file.path)
        : file.path
      : path
    return `https://github.com/${skill.repository}/blob/${side === 'before' ? update.previousRevision : update.newRevision}/${revisionPath.split('/').map(encodeURIComponent).join('/')}`
  }
  return (
    <SkillShell>
      <Link href={`/skills/${slug}`} className="font-mono text-xs text-lime hover:underline">
        ← {skill.name} history
      </Link>
      <h1 className="mt-6 break-words font-mono text-3xl font-semibold text-ink">
        {skill.name}
        <span className="text-lime">.</span>
      </h1>
      <p className="mt-4 font-mono text-sm text-lime">
        {update.previousRevision.slice(0, 7)} → {update.newRevision.slice(0, 7)}
      </p>
      <p className="mt-3 text-xs text-dust">
        {skillAnalysisLabel(update.analysisStatus)} · detected{' '}
        <SkillDate value={update.createdAt} />
      </p>
      <SkillPanel title="assessment">
        {report ? (
          <>
            <h2 className="font-mono text-xl text-ink">
              {report.recommendation.replaceAll('_', ' ')}
            </h2>
            <p>{report.summary}</p>
            <p>{report.justification}</p>
            <p className="font-mono text-xs text-amber">
              potential impact: {report.impact} · confidence: {report.confidence}
            </p>
          </>
        ) : (
          <p>
            {update.analysisStatus === 'failed'
              ? 'Analysis failed. This change is preserved for retry; no update recommendation is available.'
              : 'This source change is recorded. Analysis is pending; no update recommendation is available yet.'}
          </p>
        )}
        <p className="border-l-2 border-amber pl-3">
          Advisory analysis of source instructions. This update has not been tested in your
          environment. Review the evidence before changing a pinned revision.
        </p>
      </SkillPanel>
      {report &&
        (
          [
            ['verifiedChanges', 'verified textual changes'],
            ['capabilityChanges', 'potential capability changes'],
            ['behaviorImpact', 'potential agent behavior impact'],
            ['securityConsiderations', 'security and operations review'],
          ] as const
        ).map(([key, title]) => (
          <SkillPanel key={key} title={title}>
            <h2 className="font-mono text-base text-ink">{title}</h2>
            {report[key].length ? (
              <ul className="space-y-5">
                {report[key].map((finding, i) => (
                  <li key={i}>
                    <p>{finding.statement}</p>
                    <blockquote className="mt-2 whitespace-pre-wrap border-l border-line pl-3 font-mono text-xs">
                      {finding.quote}
                    </blockquote>
                    <a
                      href={blobUrl(finding.path, finding.side)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block break-all text-xs text-lime hover:underline"
                    >
                      {finding.path} · {finding.side} ↗
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No supported findings in this category.</p>
            )}
          </SkillPanel>
        ))}
      <SkillPanel title="source_evidence">
        <a
          href={`https://github.com/${skill.repository}/compare/${update.previousRevision}...${update.newRevision}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-lime underline underline-offset-4"
        >
          open repository comparison ↗
        </a>
        <p>
          File evidence below compares the two skill trees directly. The repository comparison may
          include unrelated files or use a merge base after a force push.
        </p>
        <dl className="font-mono text-xs">
          <dt>previous revision</dt>
          <dd className="break-all">{update.previousRevision}</dd>
          <dt className="mt-3">new revision</dt>
          <dd className="break-all">{update.newRevision}</dd>
        </dl>
        <p>
          {update.evidence
            ? `${update.evidence.totalChangedFiles} changed files · ${update.evidence.complete ? 'complete sampled source coverage' : 'incomplete source coverage'}`
            : 'Source evidence collection is pending or unavailable.'}
        </p>
        <ul className="space-y-2 font-mono text-xs">
          {update.evidence?.files.map((file) => (
            <li key={file.path} className="break-all">
              {file.status}:{' '}
              <a
                className="text-lime underline underline-offset-4"
                target="_blank"
                rel="noopener noreferrer"
                href={blobUrl(
                  file.status === 'deleted' ? (file.previousPath ?? file.path) : file.path,
                  file.status === 'deleted' ? 'before' : 'after',
                )}
              >
                {file.path}
              </a>
              {file.previousPath && ` ← ${file.previousPath}`}
            </li>
          ))}
        </ul>
        <ul className="list-inside list-disc">
          {[
            ...new Set([...(update.evidence?.limitations ?? []), ...(report?.limitations ?? [])]),
          ].map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        {update.telemetry && (
          <p className="font-mono text-xs">
            requested: {update.telemetry.requestedModel} · returned:{' '}
            {update.telemetry.returnedModel ?? 'unknown'} · provider:{' '}
            {update.telemetry.provider ?? 'unknown'} · {update.telemetry.inputTokens ?? '?'} input /{' '}
            {update.telemetry.outputTokens ?? '?'} output tokens · cost:{' '}
            {update.telemetry.costUsd === null
              ? 'unavailable'
              : `$${update.telemetry.costUsd} (${update.telemetry.costKind})`}
          </p>
        )}
      </SkillPanel>
    </SkillShell>
  )
}
