/**
 * AiyoLoginService — sidecar 代理 xspace API-Key 身份验证
 *
 * 使用 Node.js http 模块（非 fetch），确保服务端发出的请求
 * 绝对不会触发 CORS 预检（OPTIONS）。
 */

import * as http from 'http'

export interface AiyoIdentity {
  userId: string
  username: string
  spaceId: string
  roleCodes: string[]
  permissions: string[]
  traceId: string
}

export type AiyoLoginStatus =
  | { loggedIn: false }
  | { loggedIn: true; identity: AiyoIdentity }

export class AiyoLoginService {
  private xspaceHost = '127.0.0.1'
  private xspacePort = 8000
  private apiKey = 'xspace_ak_49d66ddc70ae9f7a962d4e3079de59e4'
  private cachedIdentity: AiyoIdentity | null = null

  /** 更新运行时 API Key 并清除缓存身份 */
  setApiKey(key: string): void {
    this.apiKey = key
    this.cachedIdentity = null
  }

  async verify(apiKey?: string): Promise<AiyoLoginStatus> {
    const effectiveKey = apiKey ?? this.apiKey
    return new Promise((resolve) => {
      const body = JSON.stringify({})
      const req = http.request(
        {
          hostname: this.xspaceHost,
          port: this.xspacePort,
          path: '/api/identity/resolve',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': body.length,
            'X-Api-Key': effectiveKey,
          },
          timeout: 10_000,
        },
        (res) => {
          let data = ''
          res.on('data', (chunk) => { data += chunk })
          res.on('end', () => {
            if (res.statusCode !== 200) {
              this.cachedIdentity = null
              resolve({ loggedIn: false })
              return
            }

            try {
              const json = JSON.parse(data) as {
                success: boolean
                data?: {
                  authenticated: boolean
                  user_id: string
                  username: string
                  space_id: string
                  role_codes: string[]
                  permissions: string[]
                  trace_id: string
                }
              }

              if (!json.success || !json.data?.authenticated) {
                this.cachedIdentity = null
                resolve({ loggedIn: false })
                return
              }

              this.cachedIdentity = {
                userId: json.data.user_id,
                username: json.data.username,
                spaceId: json.data.space_id,
                roleCodes: json.data.role_codes,
                permissions: json.data.permissions,
                traceId: json.data.trace_id,
              }
              resolve({ loggedIn: true, identity: this.cachedIdentity })
            } catch {
              this.cachedIdentity = null
              resolve({ loggedIn: false })
            }
          })
        },
      )

      req.on('error', () => {
        this.cachedIdentity = null
        resolve({ loggedIn: false })
      })
      req.on('timeout', () => {
        req.destroy()
        this.cachedIdentity = null
        resolve({ loggedIn: false })
      })

      req.write(body)
      req.end()
    })
  }

  getStatus(): AiyoLoginStatus {
    if (this.cachedIdentity) {
      return { loggedIn: true, identity: this.cachedIdentity }
    }
    return { loggedIn: false }
  }
}

export const aiyoLoginService = new AiyoLoginService()
