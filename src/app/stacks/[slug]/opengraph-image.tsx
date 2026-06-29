import { ImageResponse } from 'next/og'

import { getPublicStackPage } from '@/lib/public-stacks'

export const alt = 'Stack release notes, breaking changes, and upgrade notes on StackPulse'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const data = await getPublicStackPage(slug)

  const name = data?.tech.name ?? 'StackPulse'
  const stats = data?.stats

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#08080a',
        color: '#e8e8ec',
        fontFamily: 'monospace',
        padding: '60px',
        position: 'relative',
      }}
    >
      {/* Top-left logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <svg width="48" height="48" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
          <rect width="32" height="32" rx="7" fill="#0d0d10" />
          <line x1="6" y1="24" x2="26" y2="24" stroke="#40561c" strokeWidth="1" strokeLinecap="round" />
          <path
            d="M6 24 L6 16.3 M11 24 L11 12.1 M16 24 L16 10 M21 24 L21 14.2 M26 24 L26 17.7"
            fill="none"
            stroke="#a3e635"
            strokeWidth="2.7"
            strokeLinecap="round"
          />
          <circle cx="16" cy="5.35" r="2.3" fill="#a3e635" />
        </svg>
        <div style={{ display: 'flex', fontSize: '24px', fontWeight: 600 }}>
          <span>stack</span>
          <span style={{ color: '#a3e635' }}>.</span>
          <span>pulse</span>
        </div>
      </div>

      {/* Headline */}
      <div
        style={{
          marginTop: '110px',
          display: 'flex',
          flexDirection: 'column',
          lineHeight: 1.05,
          letterSpacing: '-0.02em',
        }}
      >
        <div style={{ color: '#5a5a62', fontSize: '30px', marginBottom: '14px', display: 'flex' }}>
          {'// release intelligence for'}
        </div>
        <div
          style={{
            fontSize: name.length > 14 ? '72px' : '96px',
            fontWeight: 700,
            display: 'flex',
          }}
        >
          <span>{name}</span>
          <span style={{ color: '#a3e635' }}>.</span>
        </div>
        <div style={{ color: '#9b9ba1', fontSize: '32px', marginTop: '20px', display: 'flex' }}>
          breaking changes · deprecations · migration notes
        </div>
      </div>

      {/* Bottom stats strip */}
      <div
        style={{
          marginTop: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: '18px',
          fontSize: '22px',
          color: '#5a5a62',
        }}
      >
        {stats && stats.releases > 0 ? (
          <>
            <span style={{ color: '#e8e8ec' }}>{stats.releases} recent releases</span>
            <span style={{ color: '#3a3a42' }}>·</span>
            <span style={{ color: stats.breaking > 0 ? '#fb7185' : '#5a5a62' }}>
              {stats.breaking} breaking
            </span>
            <span style={{ color: '#3a3a42' }}>·</span>
            <span style={{ color: stats.deprecations > 0 ? '#fbbf24' : '#5a5a62' }}>
              {stats.deprecations} deprecations
            </span>
            <span style={{ color: '#3a3a42' }}>·</span>
            <span>AI-distilled from GitHub</span>
          </>
        ) : (
          <>
            <div
              style={{ width: '10px', height: '10px', background: '#a3e635', borderRadius: '5px' }}
            />
            <span>github releases, AI-distilled</span>
          </>
        )}
      </div>
    </div>,
    size,
  )
}
