type CacheKey = string;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<CacheKey, CacheEntry<unknown>>();

export function makeCacheKey(parts: readonly (string | number | boolean | undefined | null)[]): string {
  return parts.map((part) => (part === undefined || part === null ? "" : String(part))).join("|");
}

export function getFromCache<T>(key: CacheKey): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value as T;
}

export function setInCache<T>(key: CacheKey, value: T, ttlMs: number): void {
  store.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

