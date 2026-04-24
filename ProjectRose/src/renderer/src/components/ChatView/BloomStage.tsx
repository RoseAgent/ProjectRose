import clsx from 'clsx'
import { useChatStore } from '../../stores/useChatStore'
import styles from './BloomStage.module.css'

const WAVE_HEIGHTS = [0.5, 0.9, 0.65, 1.0, 0.8, 0.45, 0.9, 0.7, 1.0, 0.55, 0.85, 0.6]
const WAVEFORM_BARS = Array.from({ length: 48 }).map((_, i) => ({
  h: 0.25 + 0.75 * Math.abs(Math.sin(i * 0.37) * Math.cos(i * 0.23)),
  d: (i % 8) * 0.1,
}))

export function BloomStage(): JSX.Element {
  const isLoading = useChatStore((s) => s.isLoading)
  const isRecording = useChatStore((s) => s.isRecording)

  return (
    <div className={styles.stage}>
      {/* status label */}
      <div className={styles.statusWrap}>
        <div className={styles.statusLabel}>PLATE A · VOCALIS</div>
        <div className={styles.statusText}>
          {isLoading
            ? <>agent is <span className={styles.statusAccent}>responding</span>…</>
            : <>agent is <span className={styles.statusMuted}>listening</span>…</>
          }
        </div>
      </div>

      {/* bloom orb */}
      <div className={styles.bloomWrap}>
        {/* outermost halo — very faint */}
        <div className={clsx(styles.halo, isLoading && styles.haloActive)} />

        {/* rotating label ring */}
        <svg className={styles.ringLabel} viewBox="0 0 320 320" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <defs>
            <path id="bloomRingPath" d="M 160,160 m -145,0 a 145,145 0 1,1 290,0 a 145,145 0 1,1 -290,0" fill="none" />
          </defs>
          <circle cx="160" cy="160" r="145" fill="none" strokeWidth="1" className={styles.ringStroke} />
          <text fontSize="9" letterSpacing="4" className={styles.ringText}>
            <textPath href="#bloomRingPath" startOffset="0">
              ROSA · VOCIS · № 06 · VOCALIS · SPECIMEN · AGENT · v0.1 · ROSA · VOCIS · № 06 · VOCALIS · SPECIMEN · AGENT · v0.1 ·{' '}
            </textPath>
          </text>
        </svg>

        {/* mid ring — tick marks */}
        <svg className={styles.tickRing} viewBox="0 0 320 320" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <circle cx="160" cy="160" r="118" fill="none" strokeWidth="1" strokeDasharray="1 6" className={styles.ringStroke} />
        </svg>

        {/* inner petal orb — pulses only when responding */}
        <div className={clsx(styles.orb, isLoading && styles.orbBreathing)} />

        {/* petal silhouette overlay */}
        <svg viewBox="0 0 320 320" className={styles.petalSvg}>
          <g transform="translate(160 160)">
            {[0, 72, 144, 216, 288].map((r) => (
              <path
                key={r}
                transform={`rotate(${r})`}
                d="M 0 -70 C 28 -60, 40 -30, 30 -6 C 10 -20, -10 -40, 0 -70 Z"
                className={styles.petalShape}
              />
            ))}
            <circle r="22" className={styles.petalCore} />
            <circle r="6" className={styles.petalCenter} />
          </g>
        </svg>

        {/* inner waveform bars */}
        <div className={styles.innerWave}>
          <div className={styles.innerWaveBars}>
            {WAVE_HEIGHTS.map((h, i) => (
              <div
                key={i}
                className={clsx(styles.bar, isLoading && styles.barActive)}
                style={{ '--h': h, '--min': 0.25, '--d': `${i * 0.08}s` } as React.CSSProperties}
              />
            ))}
          </div>
        </div>

        {/* cardinal marks */}
        {([
          ['N', styles.cardinalN],
          ['E', styles.cardinalE],
          ['S', styles.cardinalS],
          ['W', styles.cardinalW],
        ] as [string, string][]).map(([d, cls]) => (
          <div key={d} className={`${styles.cardinal} ${cls}`}>{d}</div>
        ))}
      </div>

      {/* under-bloom caption */}
      <div className={styles.captionWrap}>
        <div className={styles.captionSub}>press Enter to send, or use the mic</div>
      </div>

      {/* waveform strip — IN / OUT */}
      <div className={styles.waveStrip}>
        <div className={styles.waveLabel}>IN</div>
        <div className={styles.waveBars}>
          {WAVEFORM_BARS.map(({ h, d }, i) => (
            <div
              key={i}
              className={clsx(styles.stripBar, isRecording && styles.stripBarActive)}
              style={{ '--h': h, '--min': 0.2, '--d': `${d}s` } as React.CSSProperties}
            />
          ))}
        </div>
        <div className={styles.waveLabel}>OUT</div>
      </div>
    </div>
  )
}
