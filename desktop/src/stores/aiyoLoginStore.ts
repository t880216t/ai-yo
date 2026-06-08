// desktop/src/stores/aiyoLoginStore.ts

import { create } from 'zustand'
import { aiyoLoginApi, type AiyoLoginStatus } from '../api/aiyoLogin'

type AiyoLoginState = {
  status: AiyoLoginStatus | null
  isLoading: boolean
  error: string | null

  login: (apiKey?: string) => Promise<AiyoLoginStatus>
  saveAndVerify: (apiKey: string) => Promise<AiyoLoginStatus>
}

export const useAiyoLoginStore = create<AiyoLoginState>((set) => ({
  status: null,
  isLoading: false,
  error: null,

  login: async (apiKey?: string) => {
    set({ isLoading: true, error: null })
    try {
      const status = await aiyoLoginApi.verify(apiKey)
      set({ status, isLoading: false })
      return status
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ isLoading: false, error: msg })
      return { loggedIn: false }
    }
  },

  saveAndVerify: async (apiKey: string) => {
    set({ isLoading: true, error: null })
    try {
      await aiyoLoginApi.saveKey(apiKey)
      const status = await aiyoLoginApi.verify(apiKey)
      set({ status, isLoading: false })
      return status
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ isLoading: false, error: msg })
      return { loggedIn: false }
    }
  },
}))

/** 启动时调用一次，验证 xspace API Key */
export async function initializeAiyoLogin(): Promise<AiyoLoginStatus> {
  const status = await useAiyoLoginStore.getState().login()
  return status
}
