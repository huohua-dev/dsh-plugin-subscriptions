/**
 * The on-disk shapes of the usage store and their allowlist. Pure: parsing, validation and sum arithmetic only.
 *
 * Every entry is rebuilt from named keys before it is written, and every
 * loaded value is validated, so a field the schema does not name (a prompt,
 * a token, a per-request time) can never reach a file, and a damaged file
 * cannot feed the tracker malformed state.
 */
import { CACHE_WRITE_SPLIT_PROVIDER } from './constants.js';
import { REQUIRED_BUCKETS, SPLIT_BUCKETS, isTrackedProvider, } from './window-tracker.js';
const ENTRY_KINDS = ['5h', 'weekly', 'monthly', 'unclassified', 'pending'];
const WINDOW_KINDS = ['5h', 'weekly', 'monthly', 'unclassified'];
const START_SOURCES = ['disclosed', 'length', 'nominal', 'previous-reset', 'redemption', 'first-usage', 'observed'];
const STATUSES = ['open', 'closed', 'ended-early'];
const WINDOW0_REASONS = ['tracking-start', 'cleared'];
const END_REASONS = ['detected', 'redemption'];
function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function isInstant(value) {
    return typeof value === 'number' && Number.isFinite(value);
}
function isCount(value) {
    return Number.isSafeInteger(value) && value >= 0;
}
function isPercent(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}
function oneOf(value, allowed) {
    return typeof value === 'string' && allowed.includes(value);
}
/** Copy `key` from `from` when present and `valid`; `false` when present but invalid. */
function copyOptional(to, from, key, valid) {
    if (from[key] === undefined)
        return true;
    if (!valid(from[key]))
        return false;
    to[key] = from[key];
    return true;
}
function isResetRange(value) {
    return Array.isArray(value) && value.length === 2 && isInstant(value[0]) && isInstant(value[1]);
}
/**
 * Per-model sums with exactly the allowlisted buckets: the five disjoint ones,
 * plus the two cache-write durations for Claude only.
 * @returns `undefined` when any bucket is missing or not a non-negative safe integer.
 */
export function sanitizeModels(provider, value) {
    return sanitizeBuckets(value, provider === CACHE_WRITE_SPLIT_PROVIDER);
}
/** {@link sanitizeModels} with the split buckets kept only when `split`. */
function sanitizeBuckets(value, split) {
    if (!isObject(value))
        return undefined;
    const models = {};
    for (const [model, sums] of Object.entries(value)) {
        if (!isObject(sums) || !REQUIRED_BUCKETS.every(bucket => isCount(sums[bucket])))
            return undefined;
        const counts = Object.fromEntries(REQUIRED_BUCKETS.map(bucket => [bucket, sums[bucket]]));
        if (split) {
            for (const bucket of SPLIT_BUCKETS) {
                const count = sums[bucket];
                if (count === undefined)
                    continue;
                if (!isCount(count))
                    return undefined;
                counts[bucket] = count;
            }
        }
        Object.defineProperty(models, model, { value: counts, enumerable: true, configurable: true, writable: true });
    }
    return models;
}
/** Keep only validated UTC dates and token counters; do not invent dates for old totals. */
function sanitizeDays(provider, value) {
    if (!isObject(value))
        return undefined;
    const days = {};
    for (const [day, models] of Object.entries(value)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day))
            return undefined;
        const time = new Date(day);
        if (!Number.isFinite(time.getTime()) || time.toISOString().slice(0, 10) !== day)
            return undefined;
        const sums = sanitizeModels(provider, models);
        if (sums === undefined)
            return undefined;
        days[day] = sums;
    }
    return days;
}
/**
 * A copy of `value` holding only {@link WindowUsageEntry} keys, or
 * `undefined` when it is not a valid entry of `provider`.
 */
export function sanitizeEntry(provider, value) {
    if (!isObject(value) || value.v !== 1 || value.provider !== provider)
        return undefined;
    if (typeof value.id !== 'string' || typeof value.account !== 'string' || !oneOf(value.kind, ENTRY_KINDS)
        || !oneOf(value.startSource, START_SOURCES) || !oneOf(value.status, STATUSES) || !isInstant(value.countedFrom))
        return undefined;
    const models = sanitizeModels(provider, value.models);
    if (models === undefined)
        return undefined;
    const days = value.days === undefined ? undefined : sanitizeDays(provider, value.days);
    if (value.days !== undefined && days === undefined)
        return undefined;
    const entry = {
        v: 1, id: value.id, provider, account: value.account, kind: value.kind,
        startSource: value.startSource, status: value.status, countedFrom: value.countedFrom, models, ...days === undefined ? {} : { days },
    };
    const optional = [
        ['window0', field => oneOf(field, WINDOW0_REASONS)],
        ['scope', field => typeof field === 'string'],
        ['startsAt', isInstant],
        ['resetsAt', isInstant],
        ['resetRange', isResetRange],
        ['endedAt', isInstant],
        ['endReason', field => oneOf(field, END_REASONS)],
        ['lastAddedAt', isInstant],
        ['quotaUsedPercent', isPercent],
        ['quotaPeakPercent', isPercent],
        ['quotaObservedAt', isInstant],
    ];
    if (!optional.every(([key, valid]) => copyOptional(entry, value, key, valid)))
        return undefined;
    if (Array.isArray(entry.resetRange))
        entry.resetRange = [...entry.resetRange];
    return entry;
}
/** The held sum of a series: aggregate instants and sums only. */
function sanitizeHeld(provider, value) {
    if (!isObject(value) || !isInstant(value.countedFrom) || !isInstant(value.lastAddedAt))
        return undefined;
    const models = sanitizeModels(provider, value.models);
    const days = value.days === undefined ? undefined : sanitizeDays(provider, value.days);
    if (models === undefined || (value.days !== undefined && days === undefined))
        return undefined;
    return { countedFrom: value.countedFrom, lastAddedAt: value.lastAddedAt, models, ...days === undefined ? {} : { days } };
}
/** A copy of one series holding only {@link SeriesState} keys, or `undefined` when invalid. */
function sanitizeSeries(provider, value) {
    if (!isObject(value) || typeof value.key !== 'string' || !oneOf(value.kind, WINDOW_KINDS)
        || typeof value.resetReported !== 'boolean' || typeof value.anchored !== 'boolean'
        || !Array.isArray(value.entryIds) || !value.entryIds.every(id => typeof id === 'string'))
        return undefined;
    const series = {
        key: value.key, kind: value.kind, resetReported: value.resetReported, anchored: value.anchored, entryIds: [...value.entryIds],
    };
    const optional = [
        ['scope', field => typeof field === 'string'],
        ['scopeExact', field => typeof field === 'boolean'],
        ['lengthMs', field => isInstant(field) && field > 0],
        ['lastReset', isInstant],
        ['pendingR1', isInstant],
        ['countFloor', isInstant],
        ['window0', field => typeof field === 'string'],
        ['open', field => typeof field === 'string'],
        ['lastEnd', isInstant],
        ['absent', field => field === true],
        ['turnedAway', field => field === true],
    ];
    if (!optional.every(([key, valid]) => copyOptional(series, value, key, valid)))
        return undefined;
    if (value.held !== undefined) {
        const held = sanitizeHeld(provider, value.held);
        if (held === undefined)
            return undefined;
        series.held = held;
    }
    return series;
}
/** A copy of one account's tracker state holding only {@link AccountState} keys, or `undefined` when invalid. */
export function sanitizeAccount(provider, value) {
    if (!isObject(value) || value.provider !== provider || typeof value.account !== 'string'
        || typeof value.snapshotSeen !== 'boolean' || !Array.isArray(value.series))
        return undefined;
    if (value.pending !== undefined && typeof value.pending !== 'string')
        return undefined;
    const series = value.series.map(item => sanitizeSeries(provider, item));
    if (series.some(item => item === undefined))
        return undefined;
    return {
        provider, account: value.account, snapshotSeen: value.snapshotSeen,
        ...typeof value.pending === 'string' ? { pending: value.pending } : {},
        series: series,
    };
}
/** Parse `pre-tracking.json`; `undefined` when it is not a valid total. */
export function parsePreTracking(value) {
    if (!isObject(value) || value.v !== 1 || !isInstant(value.trackingStartedAt))
        return undefined;
    const models = sanitizeBuckets(value.models, false);
    return models === undefined ? undefined : { v: 1, trackingStartedAt: value.trackingStartedAt, models };
}
/** Parse `meta.json`; `undefined` when it is not a valid meta file. */
export function parseMeta(value) {
    if (!isObject(value) || value.v !== 1 || !isInstant(value.trackingStartedAt) || !isObject(value.clearedAt))
        return undefined;
    const clearedAt = {};
    for (const [provider, at] of Object.entries(value.clearedAt)) {
        if (!isTrackedProvider(provider) || !isInstant(at))
            return undefined;
        clearedAt[provider] = at;
    }
    return { v: 1, trackingStartedAt: value.trackingStartedAt, clearedAt };
}
/**
 * Parse `<provider>/open.json`. Invalid entries and accounts are dropped one
 * by one, with their count, so one damaged record does not cost the others.
 * @returns `undefined` when the file as a whole is not an open file.
 */
export function parseOpenFile(provider, value) {
    if (!isObject(value) || value.v !== 1 || !Array.isArray(value.entries))
        return undefined;
    const rawAccounts = Array.isArray(value.accounts) ? value.accounts : [];
    const entries = value.entries.map(item => sanitizeEntry(provider, item));
    const accounts = rawAccounts.map(item => sanitizeAccount(provider, item));
    const valid = (item) => item !== undefined;
    return {
        file: {
            v: 1, ...isInstant(value.clearedAt) ? { clearedAt: value.clearedAt } : {},
            entries: entries.filter(valid), accounts: accounts.filter(valid),
        },
        dropped: entries.length + accounts.length - entries.filter(valid).length - accounts.filter(valid).length,
    };
}
/** The closed-file year of an entry: the UTC year of `startsAt`, else of `countedFrom`. */
export function closedYear(entry) {
    return new Date(entry.startsAt ?? entry.countedFrom).getUTCFullYear();
}
/** `a + sign × b`, bucket by bucket and model by model, as a new object. */
export function combineModels(a, b, sign = 1) {
    const result = structuredClone(a);
    for (const [model, counts] of Object.entries(b)) {
        const sum = result[model] ?? zeroLike(counts);
        for (const bucket of REQUIRED_BUCKETS)
            sum[bucket] += sign * counts[bucket];
        for (const bucket of SPLIT_BUCKETS) {
            if (counts[bucket] !== undefined)
                sum[bucket] = (sum[bucket] ?? 0) + sign * counts[bucket];
        }
        result[model] = sum;
    }
    return result;
}
function zeroLike(counts) {
    const zero = Object.fromEntries(REQUIRED_BUCKETS.map(bucket => [bucket, 0]));
    for (const bucket of SPLIT_BUCKETS)
        if (counts[bucket] !== undefined)
            zero[bucket] = 0;
    return zero;
}
/** Every bucket of every model zero (or no model at all). */
export function zeroModels(models) {
    return Object.values(models).every(counts => REQUIRED_BUCKETS.every(bucket => counts[bucket] === 0) && SPLIT_BUCKETS.every(bucket => (counts[bucket] ?? 0) === 0));
}
/** Drop models whose sums are all zero, so a subtracted share leaves no empty rows. */
export function pruneModels(models) {
    return Object.fromEntries(Object.entries(models).filter(([, counts]) => !zeroModels({ counts })));
}
/** Daywise addition/subtraction, preserving unallocated legacy window counts separately. */
export function combineDays(a, b, sign = 1) {
    const days = {};
    for (const day of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) {
        const sums = pruneModels(combineModels(a?.[day] ?? {}, b?.[day] ?? {}, sign));
        if (!zeroModels(sums))
            days[day] = sums;
    }
    return days;
}
