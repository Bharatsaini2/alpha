import { Request, Response } from 'express'
import { getKOLPreviewImageBuffer } from '../services/kol-preview-image.service'

/**
 * GET /api/v1/influencer/transaction/:signature/preview-image
 * Returns PNG image of KOL swap card only (for Twitter alert preview and OG).
 */
export async function getKOLTransactionPreviewImage(
  req: Request,
  res: Response,
): Promise<void> {
  const signature = req.params.signature as string
  if (!signature) {
    res.status(400).send('Missing signature')
    return
  }

  const buffer = await getKOLPreviewImageBuffer(signature)
  if (!buffer) {
    res.status(404).send('Transaction not found or invalid')
    return
  }

  res.set({
    'Content-Type': 'image/png',
    'Cache-Control': 'public, max-age=3600',
  })
  res.send(buffer)
}
