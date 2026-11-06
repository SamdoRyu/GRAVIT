// 브라우저 저장소 도우미 — v1 mock(src/data/mock/v1)이 쓴다. 테스트는 메모리 저장소로 바꿔 끼운다. 소유: D.
// 데모 mock 엔진 · 데모 저장 형식은 #102 ④에서 걷어냈다.
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  /**
   * Optional: notifies when ANOTHER tab/instance writes `key` (the browser `storage` event).
   * Returns an unsubscribe function.
   */
  subscribe?(key: string, cb: (newValue: string | null) => void): () => void
}

export function createSharedMemoryStorage() {
  const map = new Map<string, string>()
  const views = new Set<{ key: string; cb: (v: string | null) => void; owner: object }>()
  return {
    view(): StorageLike {
      const owner = {}
      const notify = (key: string, value: string | null) => {
        for (const s of [...views]) if (s.owner !== owner && s.key === key) s.cb(value)
      }
      return {
        getItem: (k) => map.get(k) ?? null,
        setItem(k, v) {
          map.set(k, v)
          notify(k, v)
        },
        removeItem(k) {
          map.delete(k)
          notify(k, null)
        },
        subscribe(key, cb) {
          const entry = { key, cb, owner }
          views.add(entry)
          return () => void views.delete(entry)
        },
      }
    },
  }
}

export function createMemoryStorage(): StorageLike {
  return createSharedMemoryStorage().view()
}

/** window.localStorage (with `storage` event support) when usable, otherwise in-memory. */
export function defaultStorage(): StorageLike {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const ls = window.localStorage
      const probe = '__office_probe__'
      ls.setItem(probe, '1')
      ls.removeItem(probe)
      return {
        getItem: (k) => ls.getItem(k),
        setItem: (k, v) => ls.setItem(k, v),
        removeItem: (k) => ls.removeItem(k),
        subscribe(key, cb) {
          const handler = (e: StorageEvent) => {
            if (e.storageArea === ls && e.key === key) cb(e.newValue)
          }
          window.addEventListener('storage', handler)
          return () => window.removeEventListener('storage', handler)
        },
      }
    }
  } catch {
    // blocked or unavailable
  }
  return createMemoryStorage()
}
