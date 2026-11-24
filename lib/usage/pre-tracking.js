/**
 * DSH's session history up to `trackingStartedAt`, folded once and
 * stored as one total per provider and model in `<provider>/pre-tracking.json`.
 *
 * Two parts:
 * - {@link PreTrackingFolder}, pure: session logs in, per-provider model sums out.
 * - {@link PreTracking}, the side-effect boundary: the one-time background
 *   scan through `ctx.sessionQuery`, the atomic write, and the status a
 *   reader shows. Nothing here runs on the request path, and reading the
 *   status never touches the session history (PRE-ONCE).
 */
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
import { join } from 'node:path';
import { parseJsonText } from '../json-text.js';
import { USAGE_DIR_SEGMENTS, USAGE_FILES, USAGE_LOCK_STALE_MS, USAGE_SHUTDOWN_LOCK_WAITS, USAGE_TRACKED_PROVIDERS, } from './constants.js';
import { HOST_EVENT, HOST_STREAM } from './host-events.js';
import { servedModel, usageCounts } from './request-counts.js';
import { parsePreTracking, pruneModels } from './usage-schema.js';
import { errorCode, nodeUsageFileSystem, readOptional, readUsageMeta, sleep, usageLock, usageLockWaitMs, writeAtomic, } from './usage-files.js';
import { addModel, emptyCounts, isTrackedProvider, overflows, validCounts } from './window-tracker.js';
/** What {@link PreTrackingFolder.count} returns for a sample rejected whole, as opposed to one merely not counted. */
const REJECTED = Symbol('rejected');
/** How a scan failure or a skipped session's reason is told in a warning. */
const FAILURE_REASON = {
    /**
     * An error code shown as is: an identifier such as DSH's
     * `SESSION_QUERY_CORRUPT_SESSION` or Node's `ENOENT`. Anything else, and
     * every error message, could carry text from the session log or its path,
     * so it is replaced by {@link unknownReason}.
     */
    codePattern: /^[A-Z][A-Z0-9_]*$/,
    /** Also the reason of a scan failure, so it names no cause it cannot know. */
    unknownReason: 'no error code',
    /** The code of the scan's own failure to take a provider's lock, so its warning still says why. */
    lockHeld: 'USAGE_LOCK_HELD',
};
/** The reason a warning gives for `error`: its code when that is a plain identifier, else a fixed word. */
function failureReason(error) {
    const code = errorCode(error);
    return code !== undefined && FAILURE_REASON.codePattern.test(code) ? code : FAILURE_REASON.unknownReason;
}
function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function routeOf(value) {
    if (!isObject(value) || typeof value.provider !== 'string' || value.provider === '' || typeof value.model !== 'string')
        return undefined;
    return { provider: value.provider, model: value.model };
}
/**
 * A DSH token-usage value, or `undefined` when there is none. Its buckets
 * are checked by the caller, so a usage object with a missing required
 * bucket is counted as invalid rather than passed over.
 */
function usageOf(value) {
    return isObject(value) ? value : undefined;
}
/** The last raw usage chunk of a compact stream (dsh-llm `lastAssistantStreamChunk(stream, 'usage')`). */
function lastStreamUsage(stream) {
    if (!Array.isArray(stream))
        return undefined;
    for (let at = stream.length - 1; at >= 0; at--) {
        const record = stream[at];
        if (!isObject(record) || record.type !== HOST_STREAM.rawRecord || !isObject(record.chunk))
            continue;
        if (record.chunk.type === HOST_STREAM.usageChunk)
            return usageOf(record.chunk.usage);
    }
    return undefined;
}
function isTurnStep(data) {
    return typeof data.turn === 'number' && typeof data.step === 'number';
}
/**
 * Folds DSH session logs into per-provider, per-model totals of the usage
 * before `trackingStartedAt` (PRE-FOLD). Pure: no clock, no I/O. Logs are
 * added one at a time, so a scan never holds more than one in memory.
 *
 * Counted events:
 * - `assistant/message`: its `usage`, else the last usage chunk of its
 *   stream; route from `message.source`, else the latest `request/context`.
 * - `assistant/attempt`: the last usage chunk of its stream; route from the
 *   latest `request/context`.
 * - `compaction/summary`: its `usage` and its own route.
 * Every other event type is ignored, so an unknown type never fails a scan.
 *
 * Only events strictly before `trackingStartedAt` count: one at the instant
 * belongs to the window entries (PRE-STRADDLE). The first
 * `inheritedEventCount` events of a fork are its parent's and are counted
 * there; a `request/context` among them still sets the route of the child's
 * own events, because DSH logs it only when the route changes.
 */
export class PreTrackingFolder {
    trackingStartedAt;
    totals = Object.fromEntries(USAGE_TRACKED_PROVIDERS.map(provider => [provider, {}]));
    unattributed = 0;
    invalid = 0;
    constructor(trackingStartedAt) {
        this.trackingStartedAt = trackingStartedAt;
    }
    /** Fold one session's complete log. */
    add(log) {
        const inherited = Math.max(0, log.inheritedEventCount);
        let context;
        let slot;
        for (const [index, event] of log.events.entries()) {
            const own = index >= inherited && event.time < this.trackingStartedAt;
            if (event.type === HOST_EVENT.requestContext) {
                context = routeOf(event.data) ?? context;
            }
            else if (event.type === HOST_EVENT.retryStarted) {
                // dsh-token-meter: a retry closes the slot, so the retried attempt adds.
                if (slot !== undefined && isObject(event.data) && slot.turn === event.data.turn && slot.step === event.data.step)
                    slot = undefined;
            }
            else if (event.type === HOST_EVENT.compactionSummary) {
                if (own && isObject(event.data))
                    this.count(routeOf(event.data), usageOf(event.data.usage));
            }
            else {
                const sample = this.sampleOf(event, context);
                if (sample !== undefined)
                    slot = this.place(slot, sample, own);
            }
        }
    }
    /** The totals so far. */
    result() {
        // A replaced sample can leave a model at zero: no empty rows.
        const totals = Object.fromEntries(USAGE_TRACKED_PROVIDERS.map(provider => [provider, structuredClone(pruneModels(this.totals[provider]))]));
        return { totals, unattributed: this.unattributed, invalid: this.invalid };
    }
    /** The usage sample of an assistant settlement, with its slot and route; `undefined` for any other event or none. */
    sampleOf(event, context) {
        if (event.type !== HOST_EVENT.assistantMessage && event.type !== HOST_EVENT.assistantAttempt)
            return undefined;
        const data = event.data;
        if (!isObject(data) || !isTurnStep(data))
            return undefined;
        const isMessage = event.type === HOST_EVENT.assistantMessage;
        // dsh-token-meter: a message's `usage` wins whenever present; only the route needs `message`.
        const usage = (isMessage ? usageOf(data.usage) : undefined) ?? lastStreamUsage(data.stream);
        if (usage === undefined)
            return undefined;
        const route = routeOf(isMessage && isObject(data.message) ? data.message.source : undefined) ?? context;
        return { turn: data.turn, step: data.step, usage, ...route === undefined ? {} : { route } };
    }
    /**
     * dsh-token-meter's `tokenUsage` rule: a sample in the same (turn,
     * step) slot as the previous one replaces it, so its counts are taken
     * out again before the new ones are added. A replaced sample that was not
     * counted here (inherited, at or after the start, unattributed or
     * rejected) has nothing to take out. A sample that is not counted itself
     * replaces nothing: at or after the tracking start it belongs to the
     * window entries, which count every request on its own, so the earlier
     * sample stays in this total. A rejected sample is skipped whole,
     * as if it were not logged: the slot and the sample it would replace stay
     *.
     * @returns the slot held after the sample.
     */
    place(previous, sample, own) {
        if (!own)
            return { turn: sample.turn, step: sample.step };
        const replaced = previous?.turn === sample.turn && previous.step === sample.step ? previous.counted : undefined;
        // Taken out first, so the overflow check sees the sums the sample would join.
        if (replaced !== undefined)
            addModel(this.totals[replaced.provider], replaced.model, negate(replaced.counts));
        const counted = this.count(sample.route, sample.usage);
        if (counted === REJECTED) {
            if (replaced !== undefined)
                addModel(this.totals[replaced.provider], replaced.model, replaced.counts);
            return previous;
        }
        return { turn: sample.turn, step: sample.step, ...counted === undefined ? {} : { counted } };
    }
    /** Add one sample to its provider's total; `undefined` when it was not added, {@link REJECTED} when it was rejected whole. */
    count(route, usage) {
        if (usage === undefined)
            return undefined;
        const counts = usageCounts(usage);
        if (!validCounts(counts)) {
            this.invalid++;
            return REJECTED;
        }
        if (emptyCounts(counts))
            return undefined;
        if (route === undefined) {
            this.unattributed++;
            return undefined;
        }
        // Copilot and non-subscription routes are out of scope.
        if (!isTrackedProvider(route.provider))
            return undefined;
        const model = servedModel(route.model);
        const models = this.totals[route.provider];
        if (overflows(models, model, counts)) {
            this.invalid++;
            return REJECTED;
        }
        addModel(models, model, counts);
        return { provider: route.provider, model, counts };
    }
}
/**
 * `work`, or a rejection with the abort reason as soon as `signal` aborts.
 * `readSession` takes no signal on either host, so without this an aborted
 * scan would keep waiting for a read it no longer uses; the read itself is
 * left to finish and its result is dropped.
 */
function untilAborted(work, signal) {
    return new Promise((resolve, reject) => {
        const onAbort = () => { reject(signal.reason); };
        if (signal.aborted) {
            onAbort();
            return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
        work.then(resolve, reject).finally(() => { signal.removeEventListener('abort', onAbort); });
    });
}
function negate(counts) {
    return Object.fromEntries(Object.entries(counts).map(([bucket, value]) => [bucket, -value]));
}
/** Fold a whole history at once (see {@link PreTrackingFolder}). */
export function foldSessions(logs, trackingStartedAt) {
    const fold = new PreTrackingFolder(trackingStartedAt);
    for (const log of logs)
        fold.add(log);
    return fold.result();
}
/**
 * The one-time scan and its stored totals.
 *
 * - A scan starts when `sessionQuery` is attached and some tracked provider
 *   that was never cleared has no total for this tracking start. It reads
 *   every session, folds them, and only then writes, one atomic file per
 *   provider. A session that cannot be read is skipped with a warning
 *  . A scan that fails or is cut short writes nothing, so the next
 *   startup scans again up to the same `trackingStartedAt` (PRE-ONCE).
 * - Each file is written under the provider's lock after re-reading
 *   `meta.json`: a clear writes `clearedAt` before it purges under that
 *   lock, so a total is never written after its clear, and one written just
 *   before is removed by the purge (PRE-CLEAR).
 * - Once every total is stored, no session is read again.
 */
export class PreTracking {
    dir;
    fs;
    now;
    warn;
    lockStaleMs;
    startedAt;
    /** The scan of the attachment that is current, if one is; a newer attachment aborts the older one's. */
    attached;
    queue = Promise.resolve();
    constructor(options) {
        this.dir = options.dir ?? dshHomePath(...USAGE_DIR_SEGMENTS);
        this.fs = options.fs ?? nodeUsageFileSystem;
        this.now = options.now ?? Date.now;
        this.warn = options.onWarn ?? (() => undefined);
        this.lockStaleMs = options.lockStaleMs ?? USAGE_LOCK_STALE_MS;
        this.startedAt = options.trackingStartedAt;
    }
    /**
     * The session history became available: run the one-time scan in the
     * background if a total is missing. Never throws; failures are warnings.
     * @returns detach: aborts a running scan (one still reading writes
     *   nothing) and makes the history unavailable again. Its promise resolves
     *   once the scan has stopped, or after the shutdown bound with a warning
     *  : a session read cannot be cancelled on the host and the final
     *   writes wait for locks, so an unbounded wait could hang shutdown.
     */
    attach(query) {
        this.attached?.abort();
        const controller = new AbortController();
        this.attached = controller;
        this.queue = this.queue.then(() => this.scan(query, controller.signal)).catch(error => {
            if (!controller.signal.aborted)
                this.warn(`earlier usage history could not be computed; retried at the next startup (${failureReason(error)})`);
        });
        return async () => {
            controller.abort();
            if (this.attached === controller)
                this.attached = undefined;
            const bound = sleep(USAGE_SHUTDOWN_LOCK_WAITS * usageLockWaitMs(this.lockStaleMs));
            try {
                const stopped = await Promise.race([this.settled().then(() => true), bound.then(() => false)]);
                if (!stopped)
                    this.warn('earlier usage history scan did not stop in time; it is retried at the next startup if it wrote nothing');
            }
            finally {
                bound.cancel();
            }
        };
    }
    /** Resolves when no scan is running or queued. */
    async settled() {
        for (let queue = this.queue;; queue = this.queue) {
            await queue;
            if (queue === this.queue)
                return;
        }
    }
    /**
     * The before-tracking block of `provider`. Reads only `meta.json` and the
     * provider's `pre-tracking.json`; never the session history (PRE-ONCE).
     */
    async status(provider) {
        const meta = await readUsageMeta(this.fs, this.dir).catch(() => undefined);
        if (meta?.clearedAt[provider] !== undefined)
            return { state: 'cleared' };
        const total = await this.readTotal(provider).catch(() => undefined);
        if (total !== undefined && (meta === undefined || total.trackingStartedAt === meta.trackingStartedAt))
            return { state: 'stored', total };
        return this.attached === undefined ? { state: 'unavailable' } : { state: 'not-computed' };
    }
    path(provider) {
        return join(this.dir, provider, USAGE_FILES.preTracking);
    }
    /** The stored total, or `undefined` when there is none or it is invalid. */
    async readTotal(provider) {
        const text = await readOptional(this.fs, this.path(provider));
        if (text === undefined)
            return undefined;
        try {
            return parsePreTracking(parseJsonText(text));
        }
        catch {
            return undefined;
        }
    }
    /**
     * The providers still needing a total: tracked, never cleared, and with
     * no valid total folded up to this tracking start. A total for another
     * start (meta.json was recreated) does not count, so it is replaced.
     */
    async missing(meta) {
        const missing = [];
        for (const provider of USAGE_TRACKED_PROVIDERS) {
            if (meta.clearedAt[provider] !== undefined)
                continue;
            if ((await this.readTotal(provider))?.trackingStartedAt !== meta.trackingStartedAt)
                missing.push(provider);
        }
        return missing;
    }
    async scan(query, signal) {
        const trackingStartedAt = await this.startedAt();
        if (trackingStartedAt === undefined || signal.aborted)
            return;
        const meta = await readUsageMeta(this.fs, this.dir);
        if (meta === undefined || meta.trackingStartedAt !== trackingStartedAt)
            return;
        if ((await this.missing(meta)).length === 0)
            return;
        const fold = new PreTrackingFolder(trackingStartedAt);
        for (const record of await untilAborted(query.listSessions(signal), signal)) {
            signal.throwIfAborted();
            const log = await this.readOrSkip(query, record.header.id, signal);
            if (log !== undefined)
                fold.add(log);
        }
        // A read that fails because the history is going away (sessionQuery's
        // persistence binding unloading) is skipped like any other before the
        // abort for that reaches this scan, so a total stored then can miss
        // those sessions for good. Not guarded: no host signal tells such a
        // failure apart, and the window is the few microtasks of an unload.
        signal.throwIfAborted();
        const result = fold.result();
        if (result.unattributed > 0)
            this.warn(`earlier usage history: ${result.unattributed} usage record(s) name no provider and are in no total`);
        if (result.invalid > 0)
            this.warn(`earlier usage history: ${result.invalid} invalid usage record(s) were skipped`);
        // Past this point the fold is complete, so the writes go on even if the
        // plugin is disposed meanwhile (detach waits for them, within its bound).
        for (const provider of USAGE_TRACKED_PROVIDERS) {
            await this.store(provider, { v: 1, trackingStartedAt, models: result.totals[provider] });
        }
    }
    /**
     * One session's log, or `undefined` when it cannot be read: an
     * unreadable or corrupt session is skipped with one warning, and the scan
     * goes on. Failing the scan instead would fail every startup again on the
     * same file, so no total would ever be stored. The warning names the
     * session and the error's code only: DSH's message can quote the log or
     * its path. The id is JSON-quoted, as it comes from the stored header and
     * could hold a line break. An abort is not a read failure and still
     * stops the scan.
     */
    async readOrSkip(query, sessionId, signal) {
        try {
            return await untilAborted(query.readSession(sessionId), signal);
        }
        catch (error) {
            signal.throwIfAborted();
            this.warn(`earlier usage history: session ${JSON.stringify(sessionId)} could not be read (${failureReason(error)}) and was skipped; its usage is in no total`);
            return undefined;
        }
    }
    /** Write one provider's total under its lock, unless it was cleared or stored meanwhile (another process). */
    async store(provider, total) {
        const release = await usageLock(this.fs, this.dir, provider, this.now, this.lockStaleMs).acquire(usageLockWaitMs(this.lockStaleMs));
        if (release === undefined)
            throw Object.assign(new Error(`the ${provider} usage lock is held`), { code: FAILURE_REASON.lockHeld });
        try {
            const meta = await readUsageMeta(this.fs, this.dir);
            if (meta === undefined || meta.trackingStartedAt !== total.trackingStartedAt || meta.clearedAt[provider] !== undefined)
                return;
            if ((await this.readTotal(provider))?.trackingStartedAt === total.trackingStartedAt)
                return;
            await writeAtomic(this.fs, this.path(provider), `${JSON.stringify(total, null, 2)}\n`);
        }
        finally {
            await release();
        }
    }
}
