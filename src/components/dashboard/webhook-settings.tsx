'use client'

import { useState, useTransition } from 'react'

import { deleteWebhookSettings, saveWebhookSettings, testWebhookSettings } from '@/lib/actions'
import type { UserWebhook } from '@/lib/webhooks'
import { PulseLoader } from '@/components/ui/pulse-loader'
import { cn } from '@/lib/utils'

const kinds = ['slack', 'discord'] as const
const importanceOptions = [
  { value: 'critical', label: 'critical only' },
  { value: 'high', label: 'high + critical' },
  { value: 'medium', label: 'medium and up' },
  { value: 'low', label: 'everything' },
] as const

export function WebhookSettings({ initial }: { initial: UserWebhook | null }) {
  const [kind, setKind] = useState<(typeof kinds)[number]>(
    initial?.kind === 'discord' ? 'discord' : 'slack',
  )
  const [url, setUrl] = useState(initial?.url ?? '')
  const [minImportance, setMinImportance] = useState<string>(initial?.minImportance ?? 'high')
  const [hasSaved, setHasSaved] = useState(initial !== null)
  const [message, setMessage] = useState<{ text: string; tone: 'lime' | 'rose' } | null>(null)
  const [isPending, startTransition] = useTransition()

  const run = (work: () => Promise<{ ok: boolean; error?: string }>, successText: string) => {
    setMessage(null)
    startTransition(async () => {
      const result = await work()
      if (result.ok) {
        setMessage({ text: successText, tone: 'lime' })
      } else {
        setMessage({ text: result.error ?? 'something went wrong', tone: 'rose' })
      }
    })
  }

  return (
    <div className="frame overflow-hidden">
      <div className="frame-titlebar">
        <span className="win-dots">
          <span style={{ background: '#fb7185' }} />
          <span style={{ background: '#fbbf24' }} />
          <span style={{ background: '#34d399' }} />
        </span>
        <span className="min-w-0 truncate text-dust">~/settings/notifications.conf</span>
        <span className="ml-auto shrink-0 text-mute">{hasSaved ? 'active' : 'not configured'}</span>
      </div>

      <div className="space-y-5 p-5 font-mono text-[12.5px]">
        <p className="text-[13px] leading-relaxed text-dust">
          Get new releases for your followed stacks pushed to a Slack or Discord channel after each
          fetch run. Prereleases and releases older than 3 days are never sent.
        </p>

        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-[0.2em] text-fade">channel</div>
          <div className="inline-flex overflow-hidden rounded-md border border-ruling">
            {kinds.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setKind(option)}
                className={cn(
                  'px-3.5 py-1.5 transition-colors',
                  kind === option
                    ? 'bg-lime font-semibold text-void'
                    : 'bg-shade text-dust hover:bg-lift hover:text-ink',
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-[0.2em] text-fade">webhook url</div>
          <input
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder={
              kind === 'slack'
                ? 'https://hooks.slack.com/services/T000/B000/xxxx'
                : 'https://discord.com/api/webhooks/0000/xxxx'
            }
            className="w-full rounded-md border border-line bg-void px-3 py-2 text-[12px] text-cyan placeholder:text-fade"
          />
          <p className="text-[11px] leading-relaxed text-fade">
            {kind === 'slack'
              ? '// slack: app settings → incoming webhooks → add new webhook to workspace'
              : '// discord: channel settings → integrations → webhooks → new webhook'}
          </p>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-[0.2em] text-fade">notify on</div>
          <div className="flex flex-wrap gap-1.5">
            {importanceOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setMinImportance(option.value)}
                className={cn(
                  'rounded-md border px-2.5 py-1 text-[11.5px] transition-colors',
                  minImportance === option.value
                    ? 'border-lime/30 bg-lime/10 text-lime'
                    : 'border-ruling bg-shade text-dust hover:border-edge hover:text-ink',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <button
            type="button"
            disabled={isPending || url.trim().length === 0}
            onClick={() =>
              run(async () => {
                const result = await saveWebhookSettings({ kind, url, minImportance })
                if (result.ok) setHasSaved(true)
                return result
              }, 'saved. new releases will be delivered after each fetch run.')
            }
            className="inline-flex items-center gap-2 rounded-md bg-lime px-4 py-2 font-semibold text-void hover:bg-lime/85 disabled:opacity-60 transition-colors"
          >
            {isPending ? <PulseLoader size="inline" tone="dark" label="working…" /> : 'save webhook'}
          </button>
          <button
            type="button"
            disabled={isPending || !hasSaved}
            onClick={() => run(testWebhookSettings, 'test message sent — check the channel.')}
            className="rounded-md border border-ruling bg-shade px-4 py-2 text-ink hover:border-lime hover:text-lime disabled:opacity-50 transition-colors"
          >
            send test
          </button>
          {hasSaved && (
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                run(async () => {
                  const result = await deleteWebhookSettings()
                  if (result.ok) {
                    setHasSaved(false)
                    setUrl('')
                  }
                  return result
                }, 'webhook removed.')
              }
              className="ml-auto rounded-md px-3 py-2 text-[11.5px] text-rose/80 hover:bg-rose/5 hover:text-rose transition-colors"
            >
              remove
            </button>
          )}
        </div>

        {message && (
          <p className={cn('text-[11.5px]', message.tone === 'lime' ? 'text-lime' : 'text-rose')}>
            <span className="text-fade">→ </span>
            {message.text}
          </p>
        )}
      </div>
    </div>
  )
}
