import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { AccountAwareAdapter } from './accounts.js';
/** A usage chunk as the adapters yield it. */
export type UsageChunk = Extract<StreamChunk, {
    type: 'usage';
}>;
/** One finished request on one account, for usage tracking. */
export interface RequestEnd {
    /** The route that served it (`options.provider`). */
    provider: string;
    account: string;
    /** The served model, without the independent-entry account prefix. */
    model: string;
    /** The last usage chunk the stream yielded. */
    chunk: UsageChunk;
    /** Epoch ms when the stream ended. */
    finishedAt: number;
}
/** Receives finished requests; it must not block, and its errors are ignored. */
export type RequestEndObserver = (end: RequestEnd) => void;
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
export declare function streamAccountWithReplay(adapter: Pick<AccountAwareAdapter, 'streamAccount'>, options: GenerateOptions, account: string, model?: string, onRequestEnd?: RequestEndObserver): AsyncIterable<StreamChunk>;
