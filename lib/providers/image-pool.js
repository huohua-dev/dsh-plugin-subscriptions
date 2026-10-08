/** Account scheduling shared by image generation and editing, independent of chat catalogs/quota. */
import { LlmError, QUOTA_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm';
import { httpLlmError } from './common.js';
import { AUTH_COOLDOWN_MS, DEFAULT_QUOTA_COOLDOWN_MS, TRANSIENT_COOLDOWN_MS, PoolHealthRegistry, memberKey } from './pool-health.js';
export class ImageAccountPool {
    options;
    // Deliberately separate from chat health: image quotas/entitlements need not match chat.
    health = new PoolHealthRegistry();
    sticky = new WeakMap();
    constructor(options = {}) {
        this.options = options;
    }
    /** Login/logout clears cooling image members and stale session affinity. */
    clear(provider, account) {
        this.health.clear(provider, account);
        this.sticky = new WeakMap();
    }
    async request(request) {
        const { provider, tokens, signal, owner, send, rateLimitReset } = request;
        signal.throwIfAborted();
        const accounts = await tokens.list();
        if (accounts.length === 0) {
            await tokens.session(); // standard provider-specific login hint
            throw new LlmError('image_generate: no image account is logged in', 'MISSING_CREDENTIAL');
        }
        const pooling = this.options.enabled !== false;
        const members = (pooling ? accounts : accounts.slice(0, 1)).map(entry => entry.key);
        const sticky = pooling && owner !== undefined ? this.sticky.get(owner)?.get(provider) : undefined;
        const ordered = sticky !== undefined && members.includes(sticky)
            ? [sticky, ...members.filter(key => key !== sticky)] : members;
        const failures = [];
        for (const account of ordered) {
            signal.throwIfAborted();
            const key = memberKey(provider, account, 'images');
            if (pooling && !this.health.isAvailable(key)) {
                const blocker = this.health.memberBlocker(provider, account, 'images');
                if (blocker !== undefined)
                    failures.push(new LlmError(blocker.failure?.message ?? `image_generate: account unavailable (${blocker.reason})`, blocker.reason, { providerRetryAfterMs: Math.max(1, blocker.unavailableUntil - Date.now()) }));
                continue;
            }
            let failure;
            try {
                let session = await tokens.session(account);
                signal.throwIfAborted();
                let response = await send(session);
                // Only a definitive unauthorized rejection permits retrying this account.
                if (response.status === 401) {
                    await response.body?.cancel();
                    session = await tokens.session(account, true);
                    signal.throwIfAborted();
                    response = await send(session);
                }
                signal.throwIfAborted();
                if (response.ok) {
                    if (pooling && owner !== undefined) {
                        let affinity = this.sticky.get(owner);
                        if (affinity === undefined) {
                            affinity = new Map();
                            this.sticky.set(owner, affinity);
                        }
                        affinity.set(provider, account);
                    }
                    return response;
                }
                // Images can be produced despite timeouts/server failures. Switch only on
                // explicit auth/quota/entitlement rejection, never ambiguous transport/5xx.
                failure = await httpLlmError(response, 'image_generate', { rateLimitReset });
                if (![401, 402, 403, 404, 429].includes(response.status))
                    throw failure;
            }
            catch (error) {
                signal.throwIfAborted();
                if (!(error instanceof LlmError)
                    || (error.failure.status !== undefined && ![401, 402, 403, 404, 429].includes(error.failure.status))
                    || !['AUTH', 'INVALID_CREDENTIAL', 'MISSING_CREDENTIAL', QUOTA_EXCEEDED_CODE, 'RATE_LIMIT', 'HTTP_402', 'HTTP_404'].includes(error.code))
                    throw error;
                failure = error;
            }
            if (!pooling)
                throw failure;
            const delay = failure.failure.providerRetryAfterMs ?? (['RATE_LIMIT', QUOTA_EXCEEDED_CODE].includes(failure.code)
                ? DEFAULT_QUOTA_COOLDOWN_MS
                : ['AUTH', 'INVALID_CREDENTIAL', 'MISSING_CREDENTIAL'].includes(failure.code) ? AUTH_COOLDOWN_MS : TRANSIENT_COOLDOWN_MS);
            this.health.markUnavailable(key, delay, failure.code, Date.now(), failure);
            this.options.onWarn?.(`image pool ${provider}: account ${members.indexOf(account) + 1}/${members.length} rejected (${failure.code}); checking remaining accounts`);
            failures.push(failure);
        }
        const retryable = failures.filter(failure => failure.code === 'RATE_LIMIT');
        const choices = retryable.length > 0 ? retryable : failures;
        choices.sort((a, b) => (a.failure.providerRetryAfterMs ?? 0) - (b.failure.providerRetryAfterMs ?? 0));
        if (choices[0] !== undefined)
            throw choices[0];
        const recovery = this.health.earliestRecovery(new Set(members.map(account => memberKey(provider, account, 'images'))));
        throw new LlmError(`image_generate: all ${provider} image accounts are cooling down`, 'RATE_LIMIT', {
            ...recovery === undefined ? {} : { providerRetryAfterMs: Math.max(0, recovery - Date.now()) },
        });
    }
}
