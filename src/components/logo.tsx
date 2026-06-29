type LogoProps = {
  size?: 'sm' | 'md' | 'lg'
  className?: string
  showWordmark?: boolean
  /**
   * Subtle one-shot reveal: the five beats rise off the feed line and the
   * flagged beat pings once. Reserve for high-visibility brand surfaces
   * (landing header, welcome screens). Honours prefers-reduced-motion.
   */
  animated?: boolean
}

const markSize = { sm: 18, md: 22, lg: 28 } as const
const textSize = { sm: 'text-[13px]', md: 'text-[15px]', lg: 'text-[17px]' } as const

// "Beat Stack" — the PulseLoader frozen into a mark: five release beats rising
// off the feed line in one asymmetric heartbeat (peaks 0.55/0.85/1/0.7/0.45),
// the tallest capped by the flagged-release dot that rhymes with the wordmark's
// lime full stop. Bottoms sit on the feed line at y=24.
const BARS = [
  { x: 6, top: 16.3 },
  { x: 11, top: 12.1 },
  { x: 16, top: 10 },
  { x: 21, top: 14.2 },
  { x: 26, top: 17.7 },
] as const
const BASE_Y = 24

export function Logo({
  size = 'md',
  className = '',
  showWordmark = true,
  animated = false,
}: LogoProps) {
  const m = markSize[size]
  return (
    <span className={`inline-flex items-center gap-2 ${animated ? 'logo-animated' : ''} ${className}`}>
      <svg
        width={m}
        height={m}
        viewBox="0 0 32 32"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect x="0.5" y="0.5" width="31" height="31" rx="7" fill="#0d0d10" stroke="#26262e" />
        {/* feed line — the timeline every release lands on */}
        <line
          x1="6"
          y1={BASE_Y}
          x2="26"
          y2={BASE_Y}
          stroke="#a3e635"
          strokeWidth="1"
          strokeOpacity="0.34"
          strokeLinecap="round"
        />
        {/* five release beats */}
        {BARS.map((bar, i) => (
          <line
            key={bar.x}
            className="logo-mark-bar"
            x1={bar.x}
            y1={BASE_Y}
            x2={bar.x}
            y2={bar.top}
            stroke="#a3e635"
            strokeWidth="2.7"
            strokeLinecap="round"
            style={{ animationDelay: `${i * 0.08}s` }}
          />
        ))}
        {/* one-shot ping on the flagged beat (animated surfaces only) */}
        {animated && <circle className="logo-ping" cx="16" cy="5.35" r="2.3" fill="#a3e635" />}
        {/* the flagged / breaking release, floating clear of the tallest beat */}
        <circle cx="16" cy="5.35" r="2.3" fill="#a3e635" />
      </svg>
      {showWordmark && (
        <span
          className={`font-mono ${textSize[size]} font-semibold tracking-tight text-ink lowercase`}
        >
          stack<span className="text-lime">.</span>pulse
        </span>
      )}
    </span>
  )
}
