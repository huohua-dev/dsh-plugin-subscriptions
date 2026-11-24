import { parseAccountModelId } from '../providers/account-preferences.js';
/** Copy only the token buckets reported by DSH. No message or request data is retained. */
export function usageCounts(usage) {
    return {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens ?? 0,
        cacheWriteTokens: usage.cacheWriteTokens ?? 0,
        reasoningTokens: usage.reasoningTokens ?? 0,
    };
}
export function requestCounts(chunk) {
    return usageCounts(chunk.usage);
}
/** Keep the actual model id, not the account-prefixed picker alias. */
export function servedModel(model) {
    try {
        return parseAccountModelId(model)?.model ?? model;
    }
    catch {
        return model;
    }
}
