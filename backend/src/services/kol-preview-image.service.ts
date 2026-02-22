import sharp from 'sharp'
import influencerWhaleTransactionsModelV2 from '../models/influencerWhaleTransactionsV2.model'

const W = 800
const H = 400
const BG = '#0b0b0b'
const TEXT = '#ffffff'
const MUTED = '#8f8f8f'

/**
 * Build SVG for KOL swap card only (no header/footer).
 * Used for Twitter KOL move alert preview and OG image.
 */
function buildSwapCardSvg(tx: {
  transaction?: {
    tokenIn?: { symbol?: string }
    tokenOut?: { symbol?: string; usdAmount?: string }
  }
  influencerUsername?: string
  type?: string
}): string {
  const tokenIn = tx.transaction?.tokenIn?.symbol ?? '—'
  const tokenOut = tx.transaction?.tokenOut?.symbol ?? '—'
  const usdRaw = tx.transaction?.tokenOut?.usdAmount ?? '0'
  const usd = Number(usdRaw)
  const usdStr = isNaN(usd)
    ? usdRaw
    : usd >= 1000
      ? `$${(usd / 1000).toFixed(2)}K`
      : `$${usd.toFixed(2)}`
  const title = 'KOL Move'
  const sub = tx.influencerUsername ? `@${tx.influencerUsername}` : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="100%" height="100%" fill="${BG}"/>
  <text x="50%" y="28%" dominant-baseline="middle" text-anchor="middle" fill="${MUTED}" font-family="system-ui, sans-serif" font-size="14">${escapeXml(title)}</text>
  <text x="50%" y="38%" dominant-baseline="middle" text-anchor="middle" fill="${TEXT}" font-family="system-ui, sans-serif" font-size="20" font-weight="600">${escapeXml(tokenIn)} → ${escapeXml(tokenOut)}</text>
  <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" fill="${TEXT}" font-family="system-ui, sans-serif" font-size="32" font-weight="700">${escapeXml(usdStr)}</text>
  ${sub ? `<text x="50%" y="65%" dominant-baseline="middle" text-anchor="middle" fill="${MUTED}" font-family="system-ui, sans-serif" font-size="14">${escapeXml(sub)}</text>` : ''}
</svg>`
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Returns PNG buffer for the KOL tx preview (swap card only), or null if tx not found / invalid.
 */
export async function getKOLPreviewImageBuffer(
  signature: string,
): Promise<Buffer | null> {
  const tx = await influencerWhaleTransactionsModelV2.findOne(
    { signature },
    { transaction: 1, influencerUsername: 1, type: 1 },
  )
    .lean()
    .exec()

  if (!tx) return null

  const svg = buildSwapCardSvg(tx as any)
  try {
    const png = await sharp(Buffer.from(svg))
      .png()
      .toBuffer()
    return png
  } catch {
    return null
  }
}
