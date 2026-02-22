import { Request, Response } from 'express'
import sharp from 'sharp'
import influencerWhaleTransactionsModelV2 from '../models/influencerWhaleTransactionsV2.model'
import { catchAsyncErrors } from '../middlewares/catchAsyncErrors'

const WIDTH = 1200
const HEIGHT = 628

function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Build PNG buffer for KOL swap card preview (used by HTTP route and by Twitter post).
 */
export async function getKolPreviewImageBuffer(
  signature: string,
): Promise<Buffer | null> {
  const tx = await influencerWhaleTransactionsModelV2.findOne({ signature })
    .lean()
    .exec()
  if (!tx) return null

  const t = tx.transaction
  const tokenIn = t?.tokenIn
  const tokenOut = t?.tokenOut
  const inSymbol = escapeXml(tokenIn?.symbol || tx.tokenInSymbol || '?')
  const outSymbol = escapeXml(tokenOut?.symbol || tx.tokenOutSymbol || '?')
  const inName = escapeXml(tokenIn?.name || '')
  const outName = escapeXml(tokenOut?.name || '')
  const inMc = escapeXml(tokenIn?.marketCap || t?.tokenIn?.marketCap || '—')
  const outMc = escapeXml(tokenOut?.marketCap || t?.tokenOut?.marketCap || '—')
  const usdAmount = escapeXml(
    tokenOut?.usdAmount || tx.amount?.buyAmount || '0',
  )
  const isBuy = tx.type === 'buy' || (tx.type !== 'sell' && !!tokenOut?.usdAmount)
  const action = isBuy ? 'BOUGHT' : 'SOLD'

  // Layout: IN (token + MC) | center (BOUGHT/SOLD + USD) | OUT (token + MC) — matches tx-flow-visual
  const col1 = WIDTH * 0.25
  const col2 = WIDTH * 0.5
  const col3 = WIDTH * 0.75
  const yLabel = 90
  const ySymbol = 200
  const yName = 240
  const yMc = 280
  const yCenterAction = 200
  const yCenterUsd = 280
  const yCenterAmount = 340

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0b0b0b"/>
      <stop offset="100%" style="stop-color:#1a1a1a"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect x="1" y="1" width="${WIDTH - 2}" height="${HEIGHT - 2}" rx="16" fill="none" stroke="#141414" stroke-width="1"/>
  <!-- IN column -->
  <text x="${col1}" y="${yLabel}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" fill="#8f8f8f">IN</text>
  <text x="${col1}" y="${ySymbol}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="32" font-weight="bold" fill="#fff">${inSymbol}</text>
  <text x="${col1}" y="${yName}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" fill="#888">${inName}</text>
  <text x="${col1}" y="${yMc}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" fill="#666">Market Cap: $${inMc}</text>
  <!-- Center: BOUGHT/SOLD + USD amount -->
  <text x="${col2}" y="${yCenterAction}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" font-weight="600" fill="#22c55e">${action}</text>
  <text x="${col2}" y="${yCenterUsd}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" fill="#888">USD</text>
  <text x="${col2}" y="${yCenterAmount}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="40" font-weight="bold" fill="#22c55e">$${usdAmount}</text>
  <!-- OUT column -->
  <text x="${col3}" y="${yLabel}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" fill="#8f8f8f">OUT</text>
  <text x="${col3}" y="${ySymbol}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="32" font-weight="bold" fill="#fff">${outSymbol}</text>
  <text x="${col3}" y="${yName}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" fill="#888">${outName}</text>
  <text x="${col3}" y="${yMc}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" fill="#666">Market Cap: $${outMc}</text>
  <!-- Footer -->
  <text x="${col2}" y="580" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" fill="#555">Alpha Block · alpha-block.ai</text>
</svg>
`.trim()

  return sharp(Buffer.from(svg))
    .png()
    .toBuffer()
}

/**
 * GET /api/v1/influencer/transaction/:signature/preview-image
 * Returns a PNG image of the KOL swap card only (for X/Twitter preview).
 */
export const getKolTransactionPreviewImage = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const { signature } = req.params
    if (!signature) {
      res.status(400).send('Missing signature')
      return
    }

    const png = await getKolPreviewImageBuffer(signature)
    if (!png) {
      res.status(404).send('Transaction not found')
      return
    }

    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
    })
    res.send(png)
  },
)
