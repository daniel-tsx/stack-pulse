import { ImageResponse } from 'next/og'

export const alt = 'StackPulse - GitHub release tracker for breaking changes and upgrade notes'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OpengraphImage() {
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
          marginTop: '120px',
          display: 'flex',
          flexDirection: 'column',
          fontSize: '92px',
          fontWeight: 700,
          lineHeight: 1.05,
          letterSpacing: '-0.02em',
        }}
      >
        <div style={{ color: '#5a5a62', fontSize: '32px', marginBottom: '8px' }}>{'/*'}</div>
        <div>Track releases.</div>
        <div style={{ color: '#a3e635' }}>Catch breaks.</div>
        <div style={{ color: '#5a5a62', fontSize: '32px', marginTop: '8px' }}>{'*/'}</div>
      </div>

      {/* Bottom strip */}
      <div
        style={{
          marginTop: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          fontSize: '20px',
          color: '#5a5a62',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{ width: '10px', height: '10px', background: '#a3e635', borderRadius: '5px' }}
          />
          <span>live</span>
        </div>
        <span style={{ color: '#3a3a42' }}>·</span>
        <span>github releases, AI-distilled</span>
        <span style={{ color: '#3a3a42' }}>·</span>
        <span>breaking changes and upgrade notes</span>
      </div>
    </div>,
    size,
  )
}
