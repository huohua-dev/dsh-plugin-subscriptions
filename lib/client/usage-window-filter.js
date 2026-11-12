import { antigravityQuotaApplies, antigravityQuotaScope } from '../antigravity-model-id.js';
/** Presentation only: never trim the raw snapshots used by quota/routing logic. */
export function visibleUsageWindows(provider, windows, visibleModels) {
    const all = windows ?? [];
    // Other providers may scope quotas by family rather than exact model ID.
    if (provider !== 'antigravity' || visibleModels === undefined)
        return all;
    return all.filter(window => !window.scope || antigravityQuotaScope(window.scope)
        || visibleModels.some(model => antigravityQuotaApplies(window.scope, model)));
}
