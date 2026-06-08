// desktop/src/api/aiyoLogin.ts

import { api } from './client'

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

export const aiyoLoginApi = {
  verify(apiKey?: string) {
    return api.post<AiyoLoginStatus>('/api/aiyo-login/verify', apiKey ? { apiKey } : {})
  },

  saveKey(apiKey: string) {
    return api.put<{ ok: true }>('/api/aiyo-login/key', { apiKey })
  },

  status() {
    return api.get<AiyoLoginStatus>('/api/aiyo-login')
  },
}
