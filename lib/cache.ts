/**
 * 轻量的进程内缓存（LRU 淘汰 + 后台刷新）。
 *
 * 服务端运行时（本地 dev / 单实例 Node / Vercel 同一个 Serverless 实例）共享该缓存，
 * 目的是避免每次页面刷新都打到 Yahoo Finance（容易 429）。
 * 多实例部署时缓存相互独立，属于「尽力而为」的优化，不影响正确性。
 */

interface CacheEntry {
  value: unknown;
  freshUntil: number;
  expireAt: number;
}

export interface CachedResult<T> {
  value: T;
  /** 命中缓存（可能是新鲜命中，也可能是过期但仍在宽限期内） */
  cached: boolean;
  /** 数据已过新鲜期，本次返回的是旧值，同时后台正在刷新 */
  stale: boolean;
}

const MAX_ENTRIES = 200;
const store = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

function put(key: string, value: unknown, freshSeconds: number, staleSeconds: number) {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next();
    if (!oldest.done) store.delete(oldest.value);
  }
  const now = Date.now();
  store.set(key, {
    value,
    freshUntil: now + freshSeconds * 1000,
    expireAt: now + (freshSeconds + staleSeconds) * 1000,
  });
}

function load<T>(key: string, loader: () => Promise<T>, freshSeconds: number, staleSeconds: number) {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = loader()
    .then((value) => {
      put(key, value, freshSeconds, staleSeconds);
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

/**
 * 读取缓存；未命中则执行 loader。
 * 数据过期但仍在 stale 宽限期内时，立即返回旧数据并在后台重新拉取（stale-while-revalidate）。
 */
export async function cached<T>(
  key: string,
  freshSeconds: number,
  staleSeconds: number,
  loader: () => Promise<T>,
): Promise<CachedResult<T>> {
  const now = Date.now();
  const entry = store.get(key);

  if (entry && now < entry.freshUntil) {
    return { value: entry.value as T, cached: true, stale: false };
  }

  if (entry && now < entry.expireAt) {
    void load(key, loader, freshSeconds, staleSeconds).catch(() => {
      // 后台刷新失败不阻塞请求，继续使用旧数据
    });
    return { value: entry.value as T, cached: true, stale: true };
  }

  const value = await load(key, loader, freshSeconds, staleSeconds);
  return { value, cached: false, stale: false };
}

/** 清空缓存（调试用） */
export function clearCache() {
  store.clear();
  inflight.clear();
}

export function cacheStats() {
  return { entries: store.size, inflight: inflight.size };
}
