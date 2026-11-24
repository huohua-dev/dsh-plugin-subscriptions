/**
 * The usage service: the side-effect
 * boundary between the stored entries and the pure view model.
 *
 * - Open entries come from this process's memory (the window store), so a
 *   finished request shows before any save. Other processes' committed open
 *   entries come from `open.json`, and closed windows from `closed-YYYY.jsonl`.
 * - A provider's files are read only when that provider is read. Each file is
 *   cached by size and modification time, so later navigation re-reads
 *   nothing, and an append or flush invalidates exactly that file.
 * - The before-tracking total is read once it is stored (or cleared); while
 *   "not computed" it is re-checked, so a scan finishing later shows up.
 * - No DSH session is scanned and no quota is fetched by this reader.
 * - A damaged file or line is skipped and named in `errors[]`; it never
 *   fails the result (SVC-ERRORS).
 */
import { isAbsolute, join, relative, sep } from 'node:path';
import { parseJsonText } from '../json-text.js';
import { USAGE_FILES } from './constants.js';
import { combineDays, combineModels, parseMeta, parseOpenFile, parsePreTracking } from './usage-schema.js';
import { errorCode, nodeUsageFileSystem, readOptional } from './usage-files.js';
import { parseClosed } from './window-store.js';
import { buildUsageView } from './window-view.js';
/** Compute clear-confirmation summary from already-loaded entries without spread stack limits. */
export function summarizeStored(all, total, clearedAt) {
    const cutoff = clearedAt ?? Number.NEGATIVE_INFINITY;
    const accounts = new Set();
    let from = Number.POSITIVE_INFINITY;
    let to = Number.NEGATIVE_INFINITY;
    let count = 0;
    for (const entry of all) {
        if (entry.countedFrom < cutoff)
            continue;
        count++;
        accounts.add(entry.account);
        if (entry.countedFrom < from)
            from = entry.countedFrom;
        const end = entry.endedAt ?? entry.resetsAt ?? entry.lastAddedAt ?? entry.countedFrom;
        if (end > to)
            to = end;
    }
    return {
        accounts: accounts.size,
        ...count === 0 ? {} : { from, to },
        // An empty stored total has nothing to remove.
        earlierHistory: total.state === 'stored' && Object.keys(total.total.models).length > 0,
    };
}
/** Usage tracking is off in this process, or the service was disposed. */
export class UsageUnavailable extends Error {
    code = 'USAGE_UNAVAILABLE';
}
/** Stands in for an error with no plain code. */
const NO_ERROR_CODE = 'no error code';
const SERVICE_ERRORS = {
    disposed: 'the usage service was disposed',
    inactive: 'usage tracking is not active',
    openInvalid: (path) => `${path}: not a valid open-entries file; its entries were skipped`,
    openDropped: (path, count) => `${path}: ${count} invalid record(s) skipped`,
    closedLine: (path, line) => `${path} line ${line}: not a valid entry; skipped`,
    preTrackingInvalid: (path) => `${path}: not a valid total; earlier history shows as not computed`,
    // Only a code, never the error's message: Node file errors quote absolute paths (SVC-ERRORS).
    unreadable: (path, error) => `${path}: could not be read (${errorCode(error) ?? NO_ERROR_CODE})`,
    clearIncomplete: (label, error) => `${label}: usage history could not be fully cleared (${errorCode(error) ?? NO_ERROR_CODE}); the cut-off holds and the removal is retried`,
    clearNotRecorded: (provider) => `the clear of ${provider} was not recorded`,
};
/** Pre-tracking states that cannot change without a clear, so they are cached. */
const FINAL_TOTAL_STATES = new Set(['stored', 'cleared']);
function isClosedFile(name) {
    return name.startsWith(USAGE_FILES.closedPrefix) && name.endsWith(USAGE_FILES.closedSuffix);
}
function parseOpen(provider, path, text) {
    let parsed;
    try {
        parsed = parseOpenFile(provider, parseJsonText(text));
    }
    catch {
        parsed = undefined;
    }
    if (parsed === undefined)
        return { entries: [], errors: [SERVICE_ERRORS.openInvalid(path)] };
    return { entries: parsed.file.entries, errors: parsed.dropped > 0 ? [SERVICE_ERRORS.openDropped(path, parsed.dropped)] : [] };
}
function parseClosedFile(provider, path, text) {
    const lines = parseClosed(provider, text);
    return {
        entries: lines.flatMap(line => line.entry === undefined ? [] : [line.entry]),
        errors: lines.flatMap(line => line.entry === undefined ? [SERVICE_ERRORS.closedLine(path, line.line ?? 0)] : []),
    };
}
export class UsageService {
    store;
    preTracking;
    fs;
    caches = new Map();
    /** Bumped by every clear, so a read that overlapped one starts again and never caches or shows pre-clear data. */
    generations = new Map();
    disposed = false;
    constructor(options) {
        this.store = options.store;
        this.preTracking = options.preTracking;
        this.fs = options.fs ?? nodeUsageFileSystem;
    }
    /**
     * Load one provider's full snapshot in a single disk pass so callers that
     * need accounts, view, summary, or dashboard aggregation read consistent
     * state without repeating `load(provider)`.
     * @throws UsageUnavailable when tracking is off or the service was disposed.
     */
    async snapshot(provider) {
        const { entries, errors, total, clearedAt } = await this.load(provider);
        const trackingStartedAt = this.store.trackingStartedAt;
        if (trackingStartedAt === undefined)
            throw new UsageUnavailable(SERVICE_ERRORS.inactive);
        const cutoff = clearedAt ?? Number.NEGATIVE_INFINITY;
        const accountSet = new Set();
        for (const entry of entries) {
            if (entry.countedFrom >= cutoff)
                accountSet.add(entry.account);
        }
        const accounts = [...accountSet].sort();
        const stored = summarizeStored(entries, total, clearedAt);
        return {
            provider,
            entries,
            errors,
            total,
            ...clearedAt === undefined ? {} : { clearedAt },
            trackingStartedAt,
            accounts,
            stored,
            observed: account => this.store.tracker?.observedWindows(provider, account) ?? [],
        };
    }
    /**
     * One account's view for one query, with the damaged data that was
     * skipped.
     * @throws UsageUnavailable when tracking is off or the service was disposed.
     */
    async read(query) {
        const { provider, account, ...viewQuery } = query;
        const snap = await this.snapshot(provider);
        const view = buildUsageView({
            provider,
            account,
            entries: snap.entries,
            observed: snap.observed(account),
            trackingStartedAt: snap.trackingStartedAt,
            ...snap.clearedAt === undefined ? {} : { clearedAt: snap.clearedAt },
            preTracking: snap.total,
        }, viewQuery);
        return { view, errors: snap.errors };
    }
    /**
     * Accounts that have stored, visible history (any account, including one
     * removed from settings), in key order.
     * @throws UsageUnavailable when tracking is off or the service was disposed.
     */
    async accounts(provider) {
        return [...new Set((await this.visible(provider)).map(entry => entry.account))].sort();
    }
    /**
     * What the provider has stored, for the clear confirmation.
     * @throws UsageUnavailable when tracking is off or the service was disposed.
     */
    async summary(provider) {
        const { entries, total, clearedAt } = await this.load(provider);
        return summarizeStored(entries, total, clearedAt);
    }
    /** The provider's entries a reader may show: none counted before its clear. */
    async visible(provider) {
        const { entries, clearedAt } = await this.load(provider);
        return entries.filter(entry => entry.countedFrom >= (clearedAt ?? Number.NEGATIVE_INFINITY));
    }
    /**
     * Clear one provider's history through the store, and drop its
     * caches. No real window is re-opened.
     * @returns the new cut-off, and the purge error when only the delete failed.
     * @throws when this clear's cut-off was not written (an earlier clear's
     *   cut-off does not count): nothing was cleared.
     */
    async clear(provider) {
        this.ensureOpen();
        const before = this.store.clearedAt(provider) ?? Number.NEGATIVE_INFINITY;
        this.invalidate(provider);
        const errors = [];
        let threw = false;
        try {
            await this.store.clearProvider(provider);
        }
        catch (error) {
            threw = true;
            errors.push(SERVICE_ERRORS.clearIncomplete(this.relativeLabel(provider, error), error));
        }
        finally {
            this.invalidate(provider);
        }
        const clearedAt = this.store.clearedAt(provider);
        if (clearedAt === undefined || (threw && clearedAt <= before)) {
            throw new Error(errors[0] ?? SERVICE_ERRORS.clearNotRecorded(provider));
        }
        return { clearedAt, errors };
    }
    /** Later reads and clears are refused; a read in flight is rejected, never left unhandled. */
    dispose() {
        this.disposed = true;
        this.caches.clear();
    }
    /**
     * The file a file-system error names, relative to the usage directory (for
     * example `claude/open.json`), or `<provider>/` when it names none or one
     * outside it: an absolute path never reaches a result (SVC-ERRORS).
     */
    relativeLabel(provider, error) {
        const path = typeof error === 'object' && error !== null && 'path' in error && typeof error.path === 'string' ? error.path : undefined;
        const inside = path === undefined ? undefined : relative(this.store.dir, path);
        if (inside === undefined || inside === '' || isAbsolute(inside) || inside.startsWith('..'))
            return `${provider}/`;
        return inside.split(sep).join('/');
    }
    ensureOpen() {
        if (this.disposed)
            throw new UsageUnavailable(SERVICE_ERRORS.disposed);
    }
    invalidate(provider) {
        this.generations.set(provider, (this.generations.get(provider) ?? 0) + 1);
        this.caches.delete(provider);
    }
    /** The provider's entries (memory first, then `open.json`, then closed files), errors and total; restarted if a clear overlapped. */
    async load(provider) {
        this.ensureOpen();
        await this.store.ready;
        for (;;) {
            this.ensureOpen();
            const generation = this.generations.get(provider) ?? 0;
            const cache = { files: new Map(this.caches.get(provider)?.files) };
            const previousTotal = this.caches.get(provider)?.total;
            const cutoff = await this.readClearCutoff(provider);
            const files = await this.readFiles(provider, cache);
            const total = cutoff !== undefined
                ? { state: 'cleared' } : previousTotal ?? await this.readTotal(provider, files.errors);
            const after = await this.readClearCutoff(provider);
            this.ensureOpen();
            if (cutoff !== after || generation !== (this.generations.get(provider) ?? 0))
                continue;
            if (FINAL_TOTAL_STATES.has(total.state))
                cache.total = total;
            this.caches.set(provider, cache);
            return { entries: this.combine(provider, files.entries), errors: files.errors, total, ...cutoff === undefined ? {} : { clearedAt: cutoff } };
        }
    }
    /** Reads the shared clear marker even when this process has not saved since a peer cleared. */
    async readClearCutoff(provider) {
        const local = this.store.clearedAt(provider);
        try {
            const raw = await readOptional(this.fs, join(this.store.dir, USAGE_FILES.meta));
            const shared = raw === undefined ? undefined : parseMeta(parseJsonText(raw))?.clearedAt[provider];
            if (shared === undefined)
                return local;
            return local === undefined ? shared : Math.max(local, shared);
        }
        catch {
            return local;
        }
    }
    /**
     * This process's entries joined with the stored ones. An id that is
     * also stored may carry another process's committed counts, which this
     * process's memory never sees: each stored copy gets this process's unsaved
     * delta added, and the in-memory copy (first, with this process's latest
     * boundaries) takes the sums of the closed copy if there is one, else the
     * open one. The view then lets a closed copy win, and nothing is
     * counted twice or hidden.
     */
    combine(provider, stored) {
        const deltas = this.store.unsavedDeltas(provider);
        const dayDeltas = this.store.unsavedDayDeltas(provider);
        const withDelta = stored.map(entry => {
            const delta = deltas.get(entry.id);
            const days = dayDeltas.get(entry.id);
            return {
                ...entry,
                ...delta === undefined ? {} : { models: combineModels(entry.models, delta) },
                ...days === undefined ? {} : { days: combineDays(entry.days, days) },
            };
        });
        const preferred = new Map();
        for (const entry of withDelta) {
            const kept = preferred.get(entry.id);
            if (kept === undefined || (kept.status === 'open' && entry.status !== 'open'))
                preferred.set(entry.id, entry);
        }
        const memory = this.store.entries(provider).map(entry => {
            const copy = preferred.get(entry.id);
            if (copy === undefined)
                return entry;
            const peaks = [entry.quotaPeakPercent, entry.quotaUsedPercent, copy.quotaPeakPercent, copy.quotaUsedPercent]
                .filter((v) => v !== undefined);
            const quotaPeakPercent = peaks.length === 0 ? undefined : Math.max(...peaks);
            let quotaUsedPercent = entry.quotaUsedPercent;
            let quotaObservedAt = entry.quotaObservedAt;
            if (copy.quotaUsedPercent !== undefined && (quotaUsedPercent === undefined
                || (copy.quotaObservedAt !== undefined && (quotaObservedAt === undefined || copy.quotaObservedAt > quotaObservedAt)))) {
                quotaUsedPercent = copy.quotaUsedPercent;
                quotaObservedAt = copy.quotaObservedAt;
            }
            return {
                ...entry,
                models: copy.models,
                ...copy.days === undefined ? {} : { days: copy.days },
                ...quotaUsedPercent === undefined ? {} : { quotaUsedPercent },
                ...quotaPeakPercent === undefined ? {} : { quotaPeakPercent },
                ...quotaObservedAt === undefined ? {} : { quotaObservedAt },
            };
        });
        return [...memory, ...withDelta];
    }
    /** `open.json` and every closed file of the provider, each from cache while its stat key is unchanged. */
    async readFiles(provider, cache) {
        const dir = join(this.store.dir, provider);
        let listed;
        try {
            listed = await this.fs.readdir(dir);
        }
        catch (error) {
            // The directory itself is unreadable: serve memory only and say so, never fail the read (SVC-ERRORS).
            return { entries: [], errors: [SERVICE_ERRORS.unreadable(`${provider}/`, error)] };
        }
        const names = listed.filter(name => name === USAGE_FILES.open || isClosedFile(name)).sort();
        for (const cached of [...cache.files.keys()])
            if (!names.includes(cached))
                cache.files.delete(cached);
        // `open.json` first, so its entries precede the closed copies (STORE-DEDUP).
        const ordered = [...names.filter(name => name === USAGE_FILES.open), ...names.filter(isClosedFile)];
        const entries = [];
        const errors = [];
        for (const name of ordered) {
            const file = await this.readFile(provider, join(dir, name), `${provider}/${name}`, cache.files.get(name));
            if (file === undefined)
                cache.files.delete(name);
            else {
                cache.files.set(name, file);
                entries.push(...file.entries);
                errors.push(...file.errors);
            }
        }
        return { entries, errors };
    }
    /** One file, re-read only when its size or modification time changed; `undefined` when it vanished meanwhile. */
    async readFile(provider, path, label, cached) {
        try {
            const stat = await this.fs.stat(path);
            // ctime too: a same-size rewrite within one coarse mtime tick still changes it.
            const key = `${stat.mtimeMs}:${stat.ctimeMs ?? ''}:${stat.size ?? ''}`;
            if (cached?.key === key)
                return cached;
            const text = await readOptional(this.fs, path);
            if (text === undefined)
                return undefined;
            const parse = label.endsWith(USAGE_FILES.open) ? parseOpen : parseClosedFile;
            return { key, ...parse(provider, label, text) };
        }
        catch (error) {
            if (errorCode(error) === 'ENOENT')
                return undefined;
            return { key: '', entries: [], errors: [SERVICE_ERRORS.unreadable(label, error)] };
        }
    }
    /** The before-tracking status; a damaged stored total is named in `errors`. */
    async readTotal(provider, errors) {
        const status = await this.preTracking?.status(provider) ?? { state: 'unavailable' };
        if (status.state !== 'not-computed')
            return status;
        const label = `${provider}/${USAGE_FILES.preTracking}`;
        try {
            const text = await readOptional(this.fs, join(this.store.dir, provider, USAGE_FILES.preTracking));
            if (text !== undefined && parsePreTracking(parseJsonText(text)) === undefined)
                errors.push(SERVICE_ERRORS.preTrackingInvalid(label));
        }
        catch (error) {
            errors.push(error instanceof SyntaxError ? SERVICE_ERRORS.preTrackingInvalid(label) : SERVICE_ERRORS.unreadable(label, error));
        }
        return status;
    }
}
