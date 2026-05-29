import { describe, expect, it, vi, beforeEach } from 'vitest'

const html2canvasMock = vi.fn()
vi.mock('html2canvas', () => ({ default: (...args: unknown[]) => html2canvasMock(...args) }))
vi.mock('../lib/imageCompress', () => ({ compressDataUrl: vi.fn(async (d: string) => `compressed:${d}`) }))

import { captureToDataUrl } from './screenshot'
import { compressDataUrl } from '../lib/imageCompress'

beforeEach(() => {
  html2canvasMock.mockReset()
  html2canvasMock.mockResolvedValue({ toDataURL: () => 'data:image/png;base64,RAW' })
  vi.mocked(compressDataUrl).mockClear()
})

describe('captureToDataUrl', () => {
  it('captures document.body for full and compresses the result', async () => {
    const out = await captureToDataUrl('full')
    expect(html2canvasMock).toHaveBeenCalledWith(document.body, expect.any(Object))
    expect(compressDataUrl).toHaveBeenCalledWith('data:image/png;base64,RAW')
    expect(out).toBe('compressed:data:image/png;base64,RAW')
  })
  it('captures the given element for element kind', async () => {
    const el = document.createElement('div')
    await captureToDataUrl('element', el)
    expect(html2canvasMock).toHaveBeenCalledWith(el, expect.any(Object))
  })
  it('falls back to document.body for element kind without element', async () => {
    await captureToDataUrl('element')
    expect(html2canvasMock).toHaveBeenCalledWith(document.body, expect.any(Object))
  })
  it('passes viewport height option for viewport kind', async () => {
    await captureToDataUrl('viewport')
    const opts = html2canvasMock.mock.calls[0]![1] as Record<string, unknown>
    expect(opts.height).toBe(window.innerHeight)
    expect(opts.windowWidth).toBe(window.innerWidth)
  })
})
