import html2canvas from 'html2canvas'
import { compressDataUrl } from '../lib/imageCompress'

export type CaptureKind = 'full' | 'viewport' | 'element'

export async function captureToDataUrl(kind: CaptureKind, element?: Element): Promise<string> {
  const target = (kind === 'element' && element ? element : document.body) as HTMLElement
  const canvas = await html2canvas(target, {
    ...(kind === 'viewport'
      ? { windowWidth: window.innerWidth, height: window.innerHeight }
      : {}),
    useCORS: true,
    logging: false,
  })
  return compressDataUrl(canvas.toDataURL('image/png'))
}
