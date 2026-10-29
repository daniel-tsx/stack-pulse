'use client'

import { useEffect } from 'react'
import { ThemeProvider } from '@/components/theme-provider'
import { ThemeSwitcher } from '@/components/theme-switcher'
import './globals.css'

// global-error replaces the root layout, so next/font CSS vars are unavailable —
// keep the font fallback inline, but share theme tokens and preference handling.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  const mono = "'Geist Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace"

  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--void)',
          color: 'var(--ink)',
          fontFamily: mono,
          padding: '24px',
        }}
      >
        <title>Something went wrong · StackPulse</title>
        <ThemeProvider>
          <div
            style={{
              position: 'relative',
              zIndex: 1,
              width: '100%',
              maxWidth: '460px',
              background: 'var(--shade)',
              border: '1px solid var(--line)',
              borderRadius: '12px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                borderBottom: '1px solid var(--line)',
                background: 'var(--lift)',
                padding: '10px 14px',
                fontSize: '12px',
                color: 'var(--dust)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span style={{ marginRight: 'auto', color: 'var(--ink)' }}>app/root.tsx</span>
              <span style={{ color: 'var(--rose)' }}>fatal</span>
              <ThemeSwitcher />
            </div>

            <div style={{ padding: '22px', fontSize: '13px', lineHeight: 1.6 }}>
              <div style={{ color: 'var(--fade)' }}>{'// the app crashed at the root'}</div>
              <div style={{ marginTop: 10 }}>
                <span style={{ color: 'var(--fade)' }}>$ </span>
                <span style={{ color: 'var(--rose)' }}>fatal</span>
                <span style={{ color: 'var(--dust)' }}>: {error.message || 'unknown error'}</span>
              </div>
              {error.digest && (
                <div style={{ marginTop: 6, color: 'var(--fade)', fontSize: 11 }}>
                  digest: {error.digest}
                </div>
              )}
              <button
                onClick={() => unstable_retry()}
                style={{
                  marginTop: 18,
                  background: 'var(--lime)',
                  color: 'var(--void)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '9px 16px',
                  fontFamily: mono,
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                retry
              </button>
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
