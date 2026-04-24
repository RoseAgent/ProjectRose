import { useEffect, useMemo } from 'react'
import { useCostStore } from '../../stores/useCostStore'
import { useProjectStore } from '../../stores/useProjectStore'
import type { CostEntry } from '../../../../shared/roseModelTypes'
import styles from './CostView.module.css'

function formatCost(usd: number): string {
  if (usd === 0) return '$0.000000'
  if (usd < 0.001) return `$${usd.toFixed(6)}`
  if (usd < 0.01) return `$${usd.toFixed(5)}`
  return `$${usd.toFixed(4)}`
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  } catch {
    return iso
  }
}

function monthKey(iso: string): string {
  return iso.slice(0, 7) // "2026-04"
}

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7)
}

function weekAgoIso(): string {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString()
}

interface ModelStat {
  model: string
  provider: string
  requests: number
  inputTokens: number
  outputTokens: number
  totalCost: number
  knownPricing: boolean
}

export function CostView(): JSX.Element {
  const rootPath = useProjectStore((s) => s.rootPath)
  const { entries, loading, load, appendEntry } = useCostStore()

  useEffect(() => {
    if (!rootPath) return
    load(rootPath)
    const cleanup = window.api.cost.onUsageEvent((entry: CostEntry) => appendEntry(entry))
    return cleanup
  }, [rootPath, load, appendEntry])

  const totalCost = useMemo(() => entries.reduce((s, e) => s + e.costUSD, 0), [entries])
  const totalInput = useMemo(() => entries.reduce((s, e) => s + e.inputTokens, 0), [entries])
  const totalOutput = useMemo(() => entries.reduce((s, e) => s + e.outputTokens, 0), [entries])

  const monthCost = useMemo(() => {
    const cur = currentMonthKey()
    return entries.filter((e) => monthKey(e.timestamp) === cur).reduce((s, e) => s + e.costUSD, 0)
  }, [entries])

  const weekCost = useMemo(() => {
    const ago = weekAgoIso()
    return entries.filter((e) => e.timestamp >= ago).reduce((s, e) => s + e.costUSD, 0)
  }, [entries])

  const modelStats = useMemo((): ModelStat[] => {
    const map = new Map<string, ModelStat>()
    for (const e of entries) {
      const key = `${e.provider}:${e.model}`
      const existing = map.get(key)
      if (existing) {
        existing.requests += 1
        existing.inputTokens += e.inputTokens
        existing.outputTokens += e.outputTokens
        existing.totalCost += e.costUSD
      } else {
        map.set(key, {
          model: e.model,
          provider: e.provider,
          requests: 1,
          inputTokens: e.inputTokens,
          outputTokens: e.outputTokens,
          totalCost: e.costUSD,
          knownPricing: e.costUSD > 0 || (e.inputTokens === 0 && e.outputTokens === 0)
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalCost - a.totalCost)
  }, [entries])

  const maxModelCost = useMemo(
    () => Math.max(...modelStats.map((m) => m.totalCost), 0.000001),
    [modelStats]
  )

  const recentEntries = useMemo(() => [...entries].reverse().slice(0, 50), [entries])

  if (loading) {
    return <div className={styles.container}><p className={styles.muted}>Loading...</p></div>
  }

  if (!rootPath) {
    return <div className={styles.container}><p className={styles.muted}>Open a project to view cost tracking.</p></div>
  }

  return (
    <div className={styles.container}>
      <div className={styles.section}>
        <div className={styles.label}>COST TRACKING</div>
        <h2 className={styles.heading}>API Usage & Cost</h2>
        <p className={styles.subheading}>{entries.length} requests recorded · stored in .projectrose/costs/</p>
      </div>

      <div className={styles.section}>
        <div className={styles.label}>SUMMARY</div>
        <div className={styles.cards}>
          <div className={styles.card}>
            <div className={styles.cardLabel}>ALL TIME</div>
            <div className={styles.cardValue}>{formatCost(totalCost)}</div>
            <div className={styles.cardSub}>{entries.length} requests</div>
          </div>
          <div className={styles.card}>
            <div className={styles.cardLabel}>THIS MONTH</div>
            <div className={styles.cardValue}>{formatCost(monthCost)}</div>
            <div className={styles.cardSub}>{new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</div>
          </div>
          <div className={styles.card}>
            <div className={styles.cardLabel}>LAST 7 DAYS</div>
            <div className={styles.cardValue}>{formatCost(weekCost)}</div>
            <div className={styles.cardSub}>{formatTokens(totalInput + totalOutput)} total tokens</div>
          </div>
        </div>
      </div>

      {modelStats.length > 0 && (
        <div className={styles.section}>
          <div className={styles.label}>BY MODEL</div>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>MODEL</th>
                <th>PROVIDER</th>
                <th>REQUESTS</th>
                <th>INPUT</th>
                <th>OUTPUT</th>
                <th>COST</th>
              </tr>
            </thead>
            <tbody>
              {modelStats.map((m) => (
                <tr key={`${m.provider}:${m.model}`}>
                  <td>
                    <div className={styles.modelName}>{m.model}</div>
                    <div className={styles.bar} style={{ width: `${Math.round((m.totalCost / maxModelCost) * 100)}%` }} />
                  </td>
                  <td><span className={styles.provider}>{m.provider.toUpperCase()}</span></td>
                  <td className={styles.tokens}>{m.requests}</td>
                  <td className={styles.tokens}>{formatTokens(m.inputTokens)}</td>
                  <td className={styles.tokens}>{formatTokens(m.outputTokens)}</td>
                  <td>
                    <span className={`${styles.cost} ${m.totalCost === 0 && m.requests > 0 ? styles.unknown : ''}`}>
                      {m.totalCost === 0 && m.inputTokens > 0 ? 'unknown pricing' : formatCost(m.totalCost)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.section}>
        <div className={styles.label}>RECENT REQUESTS</div>
        {recentEntries.length === 0 ? (
          <p className={styles.muted}>No requests yet. Start chatting to see cost data here.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>TIME</th>
                <th>MODEL</th>
                <th>IN</th>
                <th>OUT</th>
                <th>COST</th>
              </tr>
            </thead>
            <tbody>
              {recentEntries.map((e, i) => (
                <tr key={i}>
                  <td><span className={styles.timestamp}>{formatDate(e.timestamp)}</span></td>
                  <td><span className={styles.modelName}>{e.model}</span></td>
                  <td className={styles.tokens}>{formatTokens(e.inputTokens)}</td>
                  <td className={styles.tokens}>{formatTokens(e.outputTokens)}</td>
                  <td>
                    <span className={`${styles.cost} ${e.costUSD === 0 && e.inputTokens > 0 ? styles.unknown : ''}`}>
                      {e.costUSD === 0 && e.inputTokens > 0 ? '?' : formatCost(e.costUSD)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
