// Connection-local, memory-only cache: no credentials or account history on disk.
const caches = new WeakMap();
function cache(rpc) {
    let value = caches.get(rpc);
    if (!value) {
        value = { values: new Map(), listeners: new Set() };
        caches.set(rpc, value);
    }
    return value;
}
export function readUsageCache(rpc, key) { return cache(rpc).values.get(key); }
export function publishUsage(rpc, key, usage) {
    const state = cache(rpc);
    state.values.set(key, usage);
    for (const listener of state.listeners)
        listener(key, usage);
}
export function failUsage(rpc, key) {
    const previous = readUsageCache(rpc, key);
    if (previous)
        publishUsage(rpc, key, { ...previous, stale: true, refreshFailed: true });
}
export function subscribeUsage(rpc, listener) {
    cache(rpc).listeners.add(listener);
    return () => { cache(rpc).listeners.delete(listener); };
}
/** Called after a status read so logout cannot leave recoverable account history. */
export function retainUsageAccounts(rpc, live) {
    for (const key of cache(rpc).values.keys())
        if (!live.has(key))
            cache(rpc).values.delete(key);
}
