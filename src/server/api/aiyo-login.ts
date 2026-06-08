/**
 * AiYo Login API — sidecar 代理层
 *
 * POST /api/aiyo-login/verify  — 向 xspace 验证 API Key，返回身份
 * GET  /api/aiyo-login          — 获取缓存的登录状态
 */

import { aiyoLoginService } from '../services/aiyoLoginService.js'
import { SettingsService } from '../services/settingsService.js'
import { errorResponse } from '../middleware/errorHandler.js'

const settingsService = new SettingsService()

export async function handleAiyoLoginApi(
  req: Request,
  _url: URL,
  segments: string[],
): Promise<Response> {
  try {
    const action = segments[2]

    // PUT /api/aiyo-login/key — save API key to user settings
    if (action === 'key' && req.method === 'PUT') {
      const body = await req.json().catch(() => ({}))
      const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
      if (!apiKey) {
        return Response.json({ error: 'API key is required' }, { status: 400 })
      }
      await settingsService.updateUserSettings({ aiyoLoginApiKey: apiKey })
      aiyoLoginService.setApiKey(apiKey)
      return Response.json({ ok: true })
    }

    // POST /api/aiyo-login/verify — verify with provided key, settings key, or default
    if (action === 'verify' && req.method === 'POST') {
      let requestApiKey: string | undefined
      try {
        const body = await req.json()
        if (typeof body.apiKey === 'string' && body.apiKey.trim()) {
          requestApiKey = body.apiKey.trim()
        }
      } catch { /* no body — use settings or default */ }

      // If no key provided in request, try reading from user settings
      if (!requestApiKey) {
        const settings = await settingsService.getUserSettings()
        if (typeof settings.aiyoLoginApiKey === 'string' && settings.aiyoLoginApiKey.trim()) {
          requestApiKey = settings.aiyoLoginApiKey.trim()
          aiyoLoginService.setApiKey(requestApiKey)
        }
      }

      const status = await aiyoLoginService.verify(requestApiKey)
      return Response.json(status)
    }

    if (action === undefined && req.method === 'GET') {
      return Response.json(aiyoLoginService.getStatus())
    }

    return Response.json({ error: 'Not Found' }, { status: 404 })
  } catch (error) {
    return errorResponse(error)
  }
}
