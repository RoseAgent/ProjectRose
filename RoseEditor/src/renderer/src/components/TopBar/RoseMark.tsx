import { useThemeStore } from '../../stores/useThemeStore'

interface RoseMarkProps {
  size?: number
  style?: React.CSSProperties
}

export function RoseMark({ size = 24, style = {} }: RoseMarkProps): JSX.Element {
  const theme = useThemeStore((s) => s.theme)
  const isHerbarium = theme === 'herbarium'

  const red       = isHerbarium ? '#7a2a20' : '#f38ba8'
  const deep      = isHerbarium ? '#5a1a14' : '#eba0ac'
  const green     = isHerbarium ? '#5a6a30' : '#a6e3a1'
  const oliveDeep = isHerbarium ? '#4a5a26' : '#89d4a0'
  const center    = isHerbarium ? '#c4956a' : '#f5c2e7'

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      style={style}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* stem */}
      <path d="M32 36 C 32 42, 33 48, 34 56" stroke={green} strokeWidth="1.3" strokeLinecap="round" />
      {/* left leaf */}
      <path d="M32 46 C 26 44, 22 46, 20 50 C 24 52, 30 50, 32 48" fill={green} opacity="0.85" />
      <path d="M24 48 L 30 48" stroke={oliveDeep} strokeWidth="0.6" opacity="0.5" />
      {/* right leaf */}
      <path d="M33 50 C 38 49, 42 51, 43 55 C 39 56, 34 54, 33 52" fill={green} opacity="0.7" />
      <path d="M37 52 L 42 54" stroke={oliveDeep} strokeWidth="0.6" opacity="0.5" />

      {/* outer petals */}
      <g>
        <path d="M32 8 C 40 10, 44 18, 42 26 C 38 22, 34 18, 32 12 Z" fill={red} />
        <path d="M50 18 C 52 26, 48 34, 40 36 C 40 30, 42 24, 46 20 Z" fill={red} />
        <path d="M46 36 C 42 42, 34 42, 30 38 C 34 34, 40 32, 44 34 Z" fill={red} opacity="0.92" />
        <path d="M18 36 C 14 32, 14 24, 20 20 C 22 26, 22 32, 20 36 Z" fill={red} opacity="0.92" />
        <path d="M22 10 C 28 8, 34 10, 34 16 C 30 16, 24 16, 22 14 Z" fill={red} opacity="0.9" />
      </g>

      {/* inner petals */}
      <g>
        <path d="M32 14 C 38 16, 40 22, 38 28 C 34 26, 30 22, 30 16 Z" fill={deep} opacity="0.85" />
        <path d="M26 18 C 22 22, 22 28, 26 32 C 30 28, 30 22, 28 18 Z" fill={deep} opacity="0.75" />
        <path d="M38 30 C 36 34, 30 34, 28 30 C 32 28, 36 28, 38 30 Z" fill={deep} opacity="0.9" />
      </g>

      {/* bloom center */}
      <circle cx="32" cy="25" r="2.4" fill={deep} />
      <circle cx="32" cy="25" r="0.9" fill={center} />
    </svg>
  )
}
