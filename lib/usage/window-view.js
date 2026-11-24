/**
 * The Usage view model: one account's stored window
 * entries presented as navigable windows, one at a time. Pure: the caller
 * passes the entries, what the latest snapshot reported, the live quota
 * and the tracked token totals.
 *
 * Presentation only: merging and de-duplication never rewrite a
 * stored entry. Every user-facing text is a marker id or an `empty` id; the
 * client owns the words.
 */
import { RESET_MATCH_TOLERANCE_MS } from './constants.js';
import { combineDays, combineModels } from './usage-schema.js';
/** Marker ids, in display order. There is no "estimated" marker and no rolling period. */
export const VIEW_MARKERS = [
    'window0-tracking-start',
    'window0-cleared',
    'window0-pending',
    'since-first-observed',
    'since-tracking',
    'since-cleared',
    'ended-early',
    'ended-early-later-usage',
    'reset-not-reported',
    'boundaries-unknown',
];
/** Every view kind, in selector order; a pending Window 0 is listed last ("Not observed yet"). */
export const VIEW_KINDS = ['5h', 'weekly', 'monthly', 'pending'];
const WINDOW0_MARKER = {
    'tracking-start': 'window0-tracking-start',
    cleared: 'window0-cleared',
    pending: 'window0-pending',
};
function optionKey(option) {
    return `${option.kind}\u0000${option.scope ?? ''}`;
}
function sameOption(entry, option) {
    return entry.kind === option.kind && entry.scope === option.scope;
}
function isWindow0(entry) {
    return entry.window0 !== undefined || entry.kind === 'pending';
}
/**
 * This account's entries a reader may show: none counted before the clear
 *, and one copy per id, the closed copy winning over a stale open one
 * left by a crash between the two writes (STORE-DEDUP).
 */
function visibleEntries(input) {
    const byId = new Map();
    for (const entry of input.entries) {
        if (entry.account !== input.account || entry.provider !== input.provider)
            continue;
        if (input.clearedAt !== undefined && entry.countedFrom < input.clearedAt)
            continue;
        const kept = byId.get(entry.id);
        if (kept === undefined || (kept.status === 'open' && entry.status !== 'open'))
            byId.set(entry.id, entry);
    }
    return [...byId.values()].filter(entry => entry.kind !== 'unclassified');
}
function kindOptions(entries, observed) {
    const options = new Map();
    for (const { kind, scope } of [...entries, ...observed]) {
        if (kind === 'unclassified')
            continue;
        const option = scope === undefined ? { kind } : { kind, scope };
        options.set(optionKey(option), option);
    }
    return [...options.values()].sort((a, b) => VIEW_KINDS.indexOf(a.kind) - VIEW_KINDS.indexOf(b.kind)
        || Number(a.scope !== undefined) - Number(b.scope !== undefined)
        || (a.scope ?? '').localeCompare(b.scope ?? ''));
}
function groupOf(entry) {
    return {
        entries: [entry],
        window0: isWindow0(entry),
        countedFrom: entry.countedFrom,
        ...entry.startsAt === undefined ? {} : { startsAt: entry.startsAt },
        ...entry.resetsAt === undefined ? {} : { resetsAt: entry.resetsAt },
        ...entry.endedAt === undefined ? {} : { endedAt: entry.endedAt },
        ...resetRangeOf(entry),
        status: entry.status,
    };
}
function resetRangeOf(entry) {
    if (entry.resetRange !== undefined)
        return { range: [...entry.resetRange] };
    return entry.resetsAt === undefined ? {} : { range: [entry.resetsAt, entry.resetsAt] };
}
function minDefined(a, b) {
    return a === undefined ? b : b === undefined ? a : Math.min(a, b);
}
function maxDefined(a, b) {
    return a === undefined ? b : b === undefined ? a : Math.max(a, b);
}
/** C2 merge on read: earliest start and `countedFrom`, latest reset and end, open wins. */
function merge(a, b) {
    const startsAt = minDefined(a.startsAt, b.startsAt);
    const resetsAt = maxDefined(a.resetsAt, b.resetsAt);
    const endedAt = maxDefined(a.endedAt, b.endedAt);
    const range = a.range === undefined || b.range === undefined ? a.range ?? b.range : [Math.min(a.range[0], b.range[0]), Math.max(a.range[1], b.range[1])];
    const status = a.status === 'open' || b.status === 'open' ? 'open' : a.status === 'ended-early' || b.status === 'ended-early' ? 'ended-early' : 'closed';
    // Only a merge of Window 0 entries is a Window 0; a zero-length Window 0 joined to the real window starting at its instant is real (V-SAME-START).
    const window0 = a.window0 && b.window0;
    return {
        entries: [...a.entries, ...b.entries],
        window0,
        countedFrom: Math.min(a.countedFrom, b.countedFrom),
        ...startsAt === undefined ? {} : { startsAt },
        ...resetsAt === undefined ? {} : { resetsAt },
        // An open Window 0 has no end yet, so a merge with one is still open-ended.
        ...endedAt === undefined || (window0 && status === 'open') ? {} : { endedAt },
        ...range === undefined ? {} : { range },
        status,
    };
}
/** Real windows merge when their reset ranges are within the tolerance, inclusive; one with no reset never merges. */
const REAL_MERGE = {
    interval: group => group.range,
    touches: gap => gap <= RESET_MATCH_TOLERANCE_MS,
};
/** Window 0 entries merge when `[countedFrom, endedAt)` overlap; an open one has no end. */
const WINDOW0_MERGE = {
    interval: group => [group.countedFrom, group.status === 'open' ? Number.POSITIVE_INFINITY : group.endedAt ?? Number.POSITIVE_INFINITY],
    touches: gap => gap < 0,
};
/**
 * Merge overlapping intervals transitively in one sweep over the groups
 * sorted by interval start: O(n log n), so years of stored windows stay
 * cheap to present on every read.
 */
function mergeAll(groups, rule) {
    const result = [];
    const sweep = groups.filter(group => rule.interval(group) !== undefined)
        .sort((a, b) => rule.interval(a)[0] - rule.interval(b)[0]);
    let current;
    let currentEnd = Number.NEGATIVE_INFINITY;
    for (const group of sweep) {
        const [start, end] = rule.interval(group);
        if (current !== undefined && rule.touches(start - currentEnd)) {
            current = merge(current, group);
            currentEnd = Math.max(currentEnd, end);
            continue;
        }
        if (current !== undefined)
            result.push(current);
        current = group;
        currentEnd = end;
    }
    if (current !== undefined)
        result.push(current);
    return [...result, ...groups.filter(group => rule.interval(group) === undefined)];
}
function endOf(group) {
    return group.endedAt ?? group.resetsAt;
}
/**
 * Windows that start counting at the same instant are presented as one
 *. A window is
 * addressed by an instant, so two windows sharing `countedFrom` could
 * not both be reached and Previous would loop. The groups are sorted by
 * `countedFrom`, so equal starts are adjacent.
 */
function mergeSameStart(sorted) {
    const result = [];
    for (const group of sorted) {
        const last = result.at(-1);
        if (last !== undefined && last.countedFrom === group.countedFrom)
            result[result.length - 1] = merge(last, group);
        else
            result.push(group);
    }
    return result;
}
/** The windows of one kind and scope, oldest first. */
function windowsOf(entries, option) {
    const groups = entries.filter(entry => sameOption(entry, option)).map(groupOf);
    return mergeSameStart([
        ...mergeAll(groups.filter(group => group.window0), WINDOW0_MERGE),
        ...mergeAll(groups.filter(group => !group.window0), REAL_MERGE),
    ].sort((a, b) => a.countedFrom - b.countedFrom || (endOf(a) ?? Number.POSITIVE_INFINITY) - (endOf(b) ?? Number.POSITIVE_INFINITY)));
}
/** `[countedFrom, end)`; a zero-length window still answers for its own instant, so it stays reachable. */
function contains(group, at) {
    const end = endOf(group) ?? Number.POSITIVE_INFINITY;
    return group.countedFrom <= at && (at < end || (at === group.countedFrom && end === group.countedFrom));
}
function markersOf(group, index, groups, input, observed) {
    const markers = new Set();
    const [first] = group.entries;
    // After a clear the first Window 0 reads "since history was cleared" even before the kind is known;
    // otherwise a pending Window 0 has the not-observed label.
    if (group.window0)
        markers.add(WINDOW0_MARKER[first.window0 === 'cleared' ? 'cleared' : first.kind === 'pending' ? 'pending' : 'tracking-start']);
    else {
        // The first real window after a Window 0 counts from the anchoring observation, not its start (W0-NO-SPLIT).
        if (groups.findIndex(candidate => !candidate.window0) === index && groups.some(candidate => candidate.window0))
            markers.add('since-first-observed');
        const startedEarlier = group.startsAt !== undefined && group.startsAt < group.countedFrom;
        if (startedEarlier && group.countedFrom === input.trackingStartedAt)
            markers.add('since-tracking');
        if (startedEarlier && group.countedFrom === input.clearedAt)
            markers.add('since-cleared');
        if (group.resetsAt === undefined)
            markers.add('boundaries-unknown');
    }
    if (group.status === 'ended-early') {
        markers.add('ended-early');
        if (group.entries.some(entry => entry.endReason === 'detected'))
            markers.add('ended-early-later-usage');
    }
    if (index === groups.length - 1 && observed?.resetReported === false)
        markers.add('reset-not-reported');
    return VIEW_MARKERS.filter(marker => markers.has(marker));
}
function mergedQuota(entries) {
    let peak;
    let latestPct;
    let latestObs = Number.NEGATIVE_INFINITY;
    for (const entry of entries) {
        if (entry.quotaPeakPercent !== undefined) {
            peak = peak === undefined ? entry.quotaPeakPercent : Math.max(peak, entry.quotaPeakPercent);
        }
        if (entry.quotaUsedPercent !== undefined) {
            peak = peak === undefined ? entry.quotaUsedPercent : Math.max(peak, entry.quotaUsedPercent);
            const obs = entry.quotaObservedAt ?? entry.lastAddedAt ?? entry.countedFrom;
            if (latestPct === undefined || obs >= latestObs) {
                latestPct = entry.quotaUsedPercent;
                latestObs = obs;
            }
        }
    }
    return {
        ...latestPct === undefined ? {} : { quotaUsedPercent: latestPct },
        ...peak === undefined ? {} : { quotaPeakPercent: peak },
    };
}
function presentWindow(group, index, groups, option, input) {
    const current = index === groups.length - 1;
    const end = endOf(group);
    const models = group.entries.reduce((sum, entry) => combineModels(sum, entry.models), {});
    const quota = mergedQuota(group.entries);
    return {
        ...option,
        window0: group.window0,
        ...group.window0 || group.startsAt === undefined ? {} : { startsAt: group.startsAt },
        countedFrom: group.countedFrom,
        ...end === undefined ? {} : { end },
        ...group.resetsAt === undefined ? {} : { resetsAt: group.resetsAt },
        status: group.status,
        current,
        oldest: index === 0,
        ...quota,
        markers: markersOf(group, index, groups, input, input.observed.find(window => sameOption(window, option))),
        models,
        days: group.entries.reduce((sum, entry) => combineDays(sum, entry.days), {}),
        entryIds: group.entries.map(entry => entry.id),
    };
}
function providerTotal(input) {
    const status = input.preTracking;
    if (status.state !== 'stored')
        return { state: status.state };
    return { state: 'stored', models: status.total.models };
}
function emptyState(input) {
    if (input.clearedAt !== undefined)
        return 'cleared';
    if (input.observed.length > 0 && input.observed.every(window => window.kind === 'unclassified'))
        return 'not-observed';
    return 'no-usage';
}
/**
 * Build the view of one account for one query: the kinds it can
 * show, the selected window with markers and token totals, and the navigation
 * facts. Without a query it is the default view: the current window of the
 * first kind that has one.
 */
export function buildUsageView(input, query = {}) {
    const entries = visibleEntries(input);
    const kinds = kindOptions(entries, input.observed);
    const byOption = new Map(kinds.map(option => [optionKey(option), windowsOf(entries, option)]));
    // The first snapshot may reclassify the formerly pending window between
    // reads. Only that transient selection can follow the new reported kind.
    const pendingTransition = query.kind === 'pending' && query.scope === undefined
        && !kinds.some(option => option.kind === 'pending');
    const newlyReported = pendingTransition
        ? kinds.find(option => input.observed.some(window => sameOption(window, option)))
        : undefined;
    const selected = query.kind !== undefined && !pendingTransition
        ? { kind: query.kind, ...query.scope === undefined ? {} : { scope: query.scope } }
        : newlyReported ?? kinds.find(option => (byOption.get(optionKey(option))?.length ?? 0) > 0) ?? kinds[0];
    const groups = selected === undefined ? [] : byOption.get(optionKey(selected)) ?? [];
    const index = query.at === undefined || pendingTransition
        ? groups.length - 1 : groups.findLastIndex(group => contains(group, query.at));
    const group = index < 0 ? undefined : groups[index];
    const anyWindow = [...byOption.values()].some(windows => windows.length > 0);
    const empty = anyWindow ? undefined : emptyState(input);
    return {
        provider: input.provider,
        account: input.account,
        kinds,
        ...selected === undefined ? {} : { selected },
        ...group === undefined ? {} : { window: presentWindow(group, index, groups, selected, input) },
        ...group === undefined || index === 0 ? {} : { previousAt: groups[index - 1].countedFrom },
        ...group === undefined || index === groups.length - 1 ? {} : { nextAt: groups[index + 1].countedFrom },
        ...empty === undefined ? {} : { empty },
        ...input.clearedAt === undefined ? {} : { clearedAt: input.clearedAt },
        trackingStartedAt: input.trackingStartedAt,
        providerTotal: providerTotal(input),
    };
}
/**
 * The newest merged window for every reported or stored (kind, scope) of one
 * account, in selector order. Reuses the same dedup, merge and marker rules as
 * {@link buildUsageView} without scanning once per kind.
 */
export function currentWindowsOf(input) {
    const entries = visibleEntries(input);
    const kinds = kindOptions(entries, input.observed);
    const result = [];
    for (const option of kinds) {
        const groups = windowsOf(entries, option);
        if (groups.length === 0)
            continue;
        result.push(presentWindow(groups[groups.length - 1], groups.length - 1, groups, option, input));
    }
    return result;
}
/**
 * Every merged window (current and historical) for every reported or stored
 * (kind, scope) of one account. Reuses {@link windowsOf} and {@link presentWindow}
 * so each returned cycle has exact deduped totals, markers, and quota %.
 */
export function allWindowsOf(input) {
    const entries = visibleEntries(input);
    const kinds = kindOptions(entries, input.observed);
    const result = [];
    for (const option of kinds) {
        const groups = windowsOf(entries, option);
        for (let i = 0; i < groups.length; i++) {
            result.push(presentWindow(groups[i], i, groups, option, input));
        }
    }
    return result;
}
