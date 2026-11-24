import { errorMessage } from '../http.js';
/**
 * Wrap every present fetcher of `fetchers` in place so each successful fetch
 * is reported to `observe` after it completes. A failed fetch is not
 * reported. An observer exception goes to `onWarn` and never reaches the
 * fetch caller, which always receives the fetcher's own snapshot.
 * Call it once per table: a second call wraps the wrappers, and every fetch
 * would then be observed twice.
 * @returns the same `fetchers` object.
 */
export function observeUsageFetchers(fetchers, observe, onWarn = () => undefined, now = Date.now) {
    for (const provider of Object.keys(fetchers)) {
        const fetcher = fetchers[provider];
        if (fetcher === undefined)
            continue;
        fetchers[provider] = async (account, signal) => {
            const snapshot = await fetcher(account, signal);
            try {
                observe(provider, account, snapshot, now());
            }
            catch (error) {
                onWarn(`usage window tracking failed for ${provider}: ${errorMessage(error)}`);
            }
            return snapshot;
        };
    }
    return fetchers;
}
