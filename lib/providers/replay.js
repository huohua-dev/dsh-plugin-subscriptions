import { createHash } from 'node:crypto';
const REPLAY_KIND = 'subscriptions-account-replay';
/**
 * Bind opaque provider replay to the concrete account/model behind a public route alias.
 *
 * This is the one path the pool member, independent-entry and direct-fallback
 * routes all reach, so it is also where a finished request is reported to
 * `onRequestEnd`. The report runs in `finally`, so it
 * covers a stream that ends normally, throws, or is closed early: the pool
 * closes a member with `return()` after a failed-before-output attempt that
 * may already have yielded usage, and DSH counts such attempts too. Only the
 * last usage chunk counts, and a stream without one reports nothing.
 */
export async function* streamAccountWithReplay(adapter, options, account, model = options.model, onRequestEnd) {
    const key = createHash('sha256').update(JSON.stringify([options.provider, account, model])).digest('hex');
    const messages = options.messages.map(message => {
        if (message.role !== 'assistant' || message.source?.replayState === undefined)
            return message;
        const source = message.source;
        if (source.replayState === null || typeof source.replayState !== 'object' || !('response' in source.replayState))
            return message;
        const replay = source.replayState;
        const response = replay.response;
        if (response !== null && typeof response === 'object' && 'kind' in response && response.kind === REPLAY_KIND) {
            if ('version' in response && response.version === 1 && 'key' in response && response.key === key && 'state' in response) {
                return { ...message, source: { ...source, provider: options.provider, model, replayState: { ...replay, response: response.state } } };
            }
            const { replayState: _discarded, ...withoutReplay } = source;
            return { ...message, source: withoutReplay };
        }
        // Only pre-existing provider replay formats keep their old direct-route
        // behavior. Signed Claude thinking also needs an account binding; matching
        // a provider/model or request prefix alone cannot prove who produced it.
        const signedThinking = response !== null && typeof response === 'object'
            && 'kind' in response && response.kind === 'anthropic';
        if (!signedThinking && source.provider === options.provider && source.model === model)
            return message;
        const { replayState: _discarded, ...withoutReplay } = source;
        return { ...message, source: withoutReplay };
    });
    let usage;
    try {
        for await (const chunk of adapter.streamAccount({ ...options, model, messages }, account)) {
            if (chunk.type === 'usage')
                usage = chunk;
            if (chunk.type === 'finish' && chunk.replayState !== undefined) {
                yield { ...chunk, replayState: { ...chunk.replayState, response: {
                            kind: REPLAY_KIND, version: 1, key, state: chunk.replayState.response,
                        } } };
            }
            else
                yield chunk;
        }
    }
    finally {
        if (usage !== undefined && onRequestEnd !== undefined) {
            try {
                onRequestEnd({ provider: options.provider, account, model, chunk: usage, finishedAt: Date.now() });
            }
            catch {
                // Tracking must never alter the stream (HOOK-NONBLOCK); the observer warns itself.
            }
        }
    }
}
