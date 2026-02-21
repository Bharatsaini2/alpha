/**
 * Whale & KOL Monitor Bootstrap
 *
 * Automatically starts whale and KOL WebSocket monitors on server boot.
 * Fixes the issue where prod shows fewer txns because monitors never start after deploy/restart.
 *
 * Default: ENABLED (runs on every start).
 * To disable: AUTO_START_WHALE_MONITORS=false
 * Delay: AUTO_START_WHALE_MONITORS_DELAY_MS (default: 8000ms to allow DB/Redis to settle)
 */

const AUTO_START_ENABLED = process.env.AUTO_START_WHALE_MONITORS !== 'false'

const BOOTSTRAP_DELAY_MS = Math.max(
  3000,
  parseInt(process.env.AUTO_START_WHALE_MONITORS_DELAY_MS || '8000', 10),
)

export function scheduleWhaleMonitorBootstrap(port: number): void {
  if (!AUTO_START_ENABLED) {
    console.log(
      '⏭️  Whale monitor auto-start disabled (AUTO_START_WHALE_MONITORS=false)',
    )
    return
  }

  console.log(
    `🕐 Whale/KOL monitor bootstrap scheduled in ${BOOTSTRAP_DELAY_MS}ms...`,
  )

  setTimeout(async () => {
    await bootstrapMonitors(port)
  }, BOOTSTRAP_DELAY_MS)
}

async function bootstrapMonitors(port: number): Promise<void> {
  const base = `http://127.0.0.1:${port}`
  const endpoints = [
    { url: '/api/v1/whale/large-transactions', label: 'Whale WebSocket' },
    {
      url: '/api/v1/influencer/influencer-latest-transactions',
      label: 'KOL WebSocket',
    },
    { url: '/api/v1/whale/parse-signatures', label: 'Whale parse-signatures' },
    {
      url: '/api/v1/influencer/parse-influencer-signatures',
      label: 'KOL parse-signatures',
    },
  ]

  console.log('🚀 [Bootstrap] Starting whale & KOL monitors...')

  for (const { url, label } of endpoints) {
    try {
      const res = await fetch(`${base}${url}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      })
      const data = (await res.json().catch(() => ({}))) as {
        status?: string
        message?: string
      }
      const ok = res.ok || res.status === 202
      if (ok) {
        console.log(
          `✅ [Bootstrap] ${label}: ${data.status || 'started'} - ${data.message || res.statusText}`,
        )
      } else {
        console.warn(
          `⚠️ [Bootstrap] ${label}: HTTP ${res.status} - ${JSON.stringify(data)}`,
        )
      }
    } catch (err: any) {
      console.error(
        `❌ [Bootstrap] ${label} failed:`,
        err?.message || err,
      )
    }
  }

  console.log('✅ [Bootstrap] Whale & KOL monitor startup complete.')
}
