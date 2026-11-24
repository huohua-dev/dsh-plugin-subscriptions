import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useReducer, useRef, useState } from 'react';
import { en } from './locales.js';
import { callSubscriptionsAuth } from './subscriptions-rpc.js';
import { usageDashboardCss } from './usage-dashboard-styles.js';
import { CLEAR_CONFIRM_OPEN, clearConfirmReducer, initialUsageDashboardState, usageDashboardReducer, } from './usage-dashboard-state.js';
import { TRACKED_PROVIDERS, formatCompactTokens, formatTokens, providerDisplayName, } from './usage-format.js';
import { UsageHeatmap } from './UsageHeatmap.js';
import { UsageCharts } from './UsageCharts.js';
import { ActiveWindowsPanel } from './ActiveWindowsPanel.js';
import { ClearUsageHistoryDialog } from './ClearUsageHistoryDialog.js';
const RANGES = [
    { id: '7d', key: 'usageRange7d' },
    { id: '30d', key: 'usageRange30d' },
    { id: '90d', key: 'usageRange90d' },
    { id: 'all', key: 'usageRangeAll' },
];
function fallbackTranslate(key, params) {
    let text = en[key];
    for (const [name, value] of Object.entries(params ?? {})) {
        text = text.replaceAll(`{${name}}`, String(value));
    }
    return text;
}
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
function formatClockTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
/** Presentational dashboard view (pure & SSR-testable without RPC or browser DOM). */
export function UsageDashboardView({ state, t, onAction, onOpenClear, embedded = false }) {
    const { response, request, phase } = state;
    const busy = phase === 'loading';
    const providerTotals = new Map();
    for (const entry of response?.providers ?? []) {
        providerTotals.set(entry.provider, entry.totalTokens);
    }
    const allProviderTotal = (response?.providers ?? []).reduce((sum, p) => sum + p.totalTokens, 0);
    const selectedProviderInfo = request.provider === 'all'
        ? undefined
        : response?.providers.find(p => p.provider === request.provider);
    const accountSelectValue = request.account === 'all'
        ? 'all'
        : request.provider === 'all'
            ? request.account
            : `${request.provider}\u0000${request.account}`;
    const handleAccountSelect = (raw) => {
        if (raw === 'all') {
            onAction({ type: 'account', account: 'all' });
            return;
        }
        const sep = raw.indexOf('\u0000');
        if (sep > 0) {
            const provider = raw.slice(0, sep);
            const account = raw.slice(sep + 1);
            if (request.provider === 'all') {
                onAction({ type: 'providerAccount', provider, account });
            }
            else {
                onAction({ type: 'account', account });
            }
            return;
        }
        onAction({ type: 'account', account: raw });
    };
    const summary = response?.summary;
    const hasVisibleUsage = response !== undefined && (response.summary.totalTokens > 0
        || response.heatmap.some(d => d.totalTokens > 0)
        || response.quotaCycles.length > 0
        || response.activeWindows.length > 0);
    const hasAnyGlobalUsage = allProviderTotal > 0;
    const isFiltered = request.provider !== 'all' || request.account !== 'all' || request.range !== 'all';
    const ioTotal = (summary?.inputTokens ?? 0) + (summary?.outputTokens ?? 0);
    const inputPct = ioTotal > 0 ? ((summary?.inputTokens ?? 0) / ioTotal) * 100 : 50;
    const cacheBase = (summary?.inputTokens ?? 0) + (summary?.cacheReadTokens ?? 0) + (summary?.cacheWriteTokens ?? 0);
    const cacheHitPct = cacheBase > 0 ? Math.round(((summary?.cacheReadTokens ?? 0) / cacheBase) * 100) : 0;
    return (_jsxs("div", { className: embedded ? 'dsh-usage-dashboard dsh-usage-dashboard-embedded' : 'dsh-usage-dashboard', children: [!embedded && _jsx("style", { children: usageDashboardCss }), _jsxs("div", { className: "dsh-usage-container", children: [_jsxs("header", { className: "dsh-usage-header", children: [_jsxs("div", { className: "dsh-usage-title-group", children: [_jsx("h1", { className: "dsh-usage-title", children: t('usageDashboardTitle') }), _jsx("p", { className: "dsh-usage-subtitle", children: t('usageDashboardSubtitle') })] }), _jsxs("div", { className: "dsh-usage-header-actions", children: [response !== undefined && (_jsx("span", { className: "dsh-usage-updated", children: t('usageLastUpdated', { time: formatClockTime(response.generatedAt) }) })), _jsxs("button", { type: "button", className: "dsh-usage-btn", disabled: busy, onClick: () => onAction({ type: 'refresh' }), children: [_jsxs("svg", { "aria-hidden": "true", width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M21 12a9 9 0 1 1-2.64-6.36" }), _jsx("polyline", { points: "21 3 21 9 15 9" })] }), busy ? t('usageViewLoading') : t('usageRefresh')] }), _jsx("button", { type: "button", className: "dsh-usage-btn dsh-usage-btn-danger", "aria-haspopup": "dialog", disabled: busy || response === undefined, onClick: onOpenClear, children: t('usageClearOpen') })] })] }), _jsxs("nav", { className: "dsh-usage-filters", "aria-label": t('providerTabs'), children: [_jsxs("div", { className: "dsh-usage-segmented dsh-usage-provider-pills", role: "group", "aria-label": t('providerTabs'), children: [_jsxs("button", { type: "button", className: "dsh-usage-pill", "aria-pressed": request.provider === 'all', disabled: busy, onClick: () => onAction({ type: 'provider', provider: 'all' }), children: [_jsx("span", { children: t('usageProviderAll') }), allProviderTotal > 0 && (_jsx("span", { className: "dsh-usage-pill-badge", children: formatCompactTokens(allProviderTotal) }))] }), TRACKED_PROVIDERS.map(entry => {
                                        const total = providerTotals.get(entry.id) ?? 0;
                                        return (_jsxs("button", { type: "button", className: "dsh-usage-pill", "aria-pressed": request.provider === entry.id, disabled: busy, onClick: () => onAction({ type: 'provider', provider: entry.id }), children: [_jsx("span", { className: "dsh-usage-dot", style: { background: entry.colorVar } }), _jsx("span", { children: entry.name }), total > 0 && (_jsx("span", { className: "dsh-usage-pill-badge", children: formatCompactTokens(total) }))] }, entry.id));
                                    })] }), _jsxs("div", { className: "dsh-usage-filter-right", children: [_jsxs("select", { className: "dsh-usage-select", "aria-label": t('usageAccount'), value: accountSelectValue, disabled: busy || response === undefined, onChange: event => handleAccountSelect(event.target.value), children: [_jsx("option", { value: "all", children: t('usageAccountAll') }), selectedProviderInfo !== undefined
                                                ? selectedProviderInfo.accounts.map(acct => (_jsx("option", { value: `${selectedProviderInfo.provider}\u0000${acct.key}`, children: acct.loggedIn
                                                        ? acct.label ?? acct.key
                                                        : t('usageAccountLoggedOut', { account: acct.label ?? acct.key }) }, acct.key)))
                                                : (response?.providers ?? [])
                                                    .filter(p => p.accounts.length > 0)
                                                    .map(p => (_jsx("optgroup", { label: providerDisplayName(p.provider), children: p.accounts.map(acct => (_jsx("option", { value: `${p.provider}\u0000${acct.key}`, children: acct.loggedIn
                                                            ? acct.label ?? acct.key
                                                            : t('usageAccountLoggedOut', { account: acct.label ?? acct.key }) }, `${p.provider}:${acct.key}`))) }, p.provider)))] }), _jsx("div", { className: "dsh-usage-segmented", role: "group", "aria-label": t('usageKind'), children: RANGES.map(item => (_jsx("button", { type: "button", className: "dsh-usage-pill", "aria-pressed": request.range === item.id, disabled: busy, onClick: () => onAction({ type: 'range', range: item.id }), children: t(item.key) }, item.id))) })] })] }), phase === 'error' && (_jsxs("div", { className: "dsh-usage-banner dsh-usage-banner-error", role: "alert", children: [_jsx("span", { children: t('usageViewFailed', { message: state.error ?? '' }) }), _jsx("button", { type: "button", className: "dsh-usage-btn", onClick: () => onAction({ type: 'retry' }), children: t('usageRetry') })] })), response !== undefined && response.errors.length > 0 && (_jsx("div", { className: "dsh-usage-banner dsh-usage-banner-warn", role: "status", children: _jsx("span", { children: t('usageDataErrors', { list: response.errors.join('; ') }) }) })), state.clearErrors.length > 0 && (_jsx("div", { className: "dsh-usage-banner dsh-usage-banner-warn", role: "alert", children: _jsx("span", { children: t('usageClearPartial', { list: state.clearErrors.join('; ') }) }) })), response === undefined && phase === 'loading' && (_jsx("div", { className: "dsh-usage-empty", role: "status", children: _jsx("p", { className: "dsh-usage-empty-desc", children: t('usageViewLoading') }) })), response !== undefined && !hasVisibleUsage && (_jsxs("div", { className: "dsh-usage-empty", children: [_jsx("h2", { className: "dsh-usage-empty-title", children: hasAnyGlobalUsage && isFiltered
                                    ? t('usageEmptyFilter')
                                    : t('usageEmptyDashboard') }), _jsx("p", { className: "dsh-usage-empty-desc", children: hasAnyGlobalUsage && isFiltered
                                    ? t('usageDashboardSubtitle')
                                    : response.cleared
                                        ? t('usageEmptyDashboardCleared')
                                        : t('usageEmptyDashboardHint') }), hasAnyGlobalUsage && isFiltered && (_jsx("button", { type: "button", className: "dsh-usage-btn", style: { marginTop: 6 }, onClick: () => onAction({ type: 'resetFilters' }), children: t('usageEmptyResetFilter') }))] })), response !== undefined && summary !== undefined && hasVisibleUsage && (_jsxs(_Fragment, { children: [_jsxs("section", { className: "dsh-usage-kpi-grid", "aria-label": t('usageDashboardTitle'), children: [_jsxs("article", { className: "dsh-usage-kpi-card", children: [_jsx("span", { className: "dsh-usage-kpi-label", children: t('usageKpiTotal') }), _jsx("span", { className: "dsh-usage-kpi-value", title: formatTokens(summary.totalTokens), children: formatCompactTokens(summary.totalTokens) }), _jsx("div", { className: "dsh-usage-kpi-sub", children: _jsx("span", { children: t('usageKpiExact', { count: formatTokens(summary.totalTokens) }) }) })] }), _jsxs("article", { className: "dsh-usage-kpi-card", children: [_jsx("span", { className: "dsh-usage-kpi-label", children: t('usageKpiInputOutput') }), _jsxs("span", { className: "dsh-usage-kpi-value", style: { fontSize: 19 }, children: [formatCompactTokens(summary.inputTokens), " / ", formatCompactTokens(summary.outputTokens)] }), _jsxs("div", { className: "dsh-usage-split-bar", "aria-hidden": "true", children: [_jsx("div", { style: { width: `${inputPct}%`, background: 'var(--dsh-tok-input)' } }), _jsx("div", { style: { width: `${100 - inputPct}%`, background: 'var(--dsh-tok-output)' } })] }), _jsxs("div", { className: "dsh-usage-kpi-sub", children: [_jsxs("span", { children: [t('usageKpiInputShort'), " ", formatCompactTokens(summary.inputTokens)] }), _jsxs("span", { children: [t('usageKpiOutputShort'), " ", formatCompactTokens(summary.outputTokens)] }), summary.reasoningTokens > 0 && (_jsx("span", { children: t('usageKpiReasoning', { count: formatCompactTokens(summary.reasoningTokens) }) }))] })] }), _jsxs("article", { className: "dsh-usage-kpi-card", children: [_jsx("span", { className: "dsh-usage-kpi-label", children: t('usageKpiCache') }), _jsxs("span", { className: "dsh-usage-kpi-value", style: { fontSize: 19 }, children: [formatCompactTokens(summary.cacheReadTokens), " / ", formatCompactTokens(summary.cacheWriteTokens)] }), _jsxs("div", { className: "dsh-usage-split-bar", "aria-hidden": "true", children: [_jsx("div", { style: {
                                                            width: `${cacheHitPct}%`,
                                                            background: 'var(--dsh-tok-cache-read)',
                                                        } }), _jsx("div", { style: {
                                                            width: `${Math.max(0, 100 - cacheHitPct)}%`,
                                                            background: 'var(--dsh-tok-cache-write)',
                                                            opacity: summary.cacheWriteTokens > 0 ? 0.85 : 0.15,
                                                        } })] }), _jsx("div", { className: "dsh-usage-kpi-sub", children: cacheBase > 0 ? (_jsx("span", { children: t('usageKpiCacheHit', { percent: cacheHitPct }) })) : (_jsxs("span", { children: [t('usageKpiCacheReadShort'), " 0 \u00B7 ", t('usageKpiCacheWriteShort'), " 0"] })) })] }), _jsxs("article", { className: "dsh-usage-kpi-card", children: [_jsx("span", { className: "dsh-usage-kpi-label", children: t('usageKpiActivity') }), _jsx("span", { className: "dsh-usage-kpi-value", children: t('usageKpiModelsCount', { count: summary.activeModels }) }), _jsxs("div", { className: "dsh-usage-kpi-sub", children: [_jsx("span", { children: t('usageKpiDaysCount', { days: summary.activeDays }) }), _jsx("span", { children: "\u00B7" }), _jsx("span", { children: t('usageKpiAccountsCount', { accounts: summary.activeAccounts }) })] })] })] }), _jsx(UsageHeatmap, { days: response.heatmap, ...state.selectedDate === undefined ? {} : { selectedDate: state.selectedDate }, onSelectDate: date => onAction(date === undefined ? { type: 'selectDate' } : { type: 'selectDate', date }), t: t }), _jsx(UsageCharts, { daily: response.daily, models: response.models, providerBreakdown: response.providerBreakdown, distributionMode: state.distributionMode, onDistributionMode: mode => onAction({ type: 'distribution', mode }), onSelectDate: date => onAction({ type: 'selectDate', date }), t: t }), _jsx(ActiveWindowsPanel, { windows: response.quotaCycles.length > 0 ? response.quotaCycles : response.activeWindows, now: response.generatedAt, t: t })] }))] })] }));
}
/** Sidebar plugin home page for Subscription Usage. */
export function UsageDashboard(props) {
    const { rpc, embedded = false, refreshKey = 0 } = props;
    const t = props.t ?? fallbackTranslate;
    const [state, dispatch] = useReducer(usageDashboardReducer, undefined, initialUsageDashboardState);
    const [clearTarget, setClearTarget] = useState(undefined);
    const [clearConfirm, setClearConfirm] = useState(undefined);
    const aliveRef = useRef(true);
    const lastRefreshKey = useRef(refreshKey);
    useEffect(() => {
        aliveRef.current = true;
        return () => { aliveRef.current = false; };
    }, []);
    useEffect(() => {
        if (refreshKey !== lastRefreshKey.current) {
            lastRefreshKey.current = refreshKey;
            dispatch({ type: 'refresh' });
        }
    }, [refreshKey]);
    useEffect(() => {
        if (rpc === undefined)
            return;
        let active = true;
        void callSubscriptionsAuth(rpc, 'usageDashboard', {
            provider: state.request.provider,
            account: state.request.account,
            range: state.request.range,
        })
            .then(response => {
            if (active)
                dispatch({ type: 'loaded', response });
        })
            .catch(error => {
            if (active)
                dispatch({ type: 'failed', message: messageOf(error) });
        });
        return () => { active = false; };
    }, [rpc, state.load, state.request.provider, state.request.account, state.request.range]);
    async function runClear() {
        if (rpc === undefined || clearTarget === undefined || clearConfirm?.phase === 'clearing')
            return;
        setClearConfirm(clearConfirmReducer(clearConfirm ?? CLEAR_CONFIRM_OPEN, { type: 'confirm' }));
        try {
            const result = await callSubscriptionsAuth(rpc, 'clearUsageHistory', {
                provider: clearTarget,
                confirm: true,
            });
            if (!aliveRef.current)
                return;
            setClearConfirm(undefined);
            setClearTarget(undefined);
            dispatch({ type: 'cleared', clearErrors: result.errors });
        }
        catch (error) {
            if (!aliveRef.current)
                return;
            setClearConfirm(current => clearConfirmReducer(current ?? CLEAR_CONFIRM_OPEN, { type: 'failed', message: messageOf(error) }));
            dispatch({ type: 'refresh' });
        }
    }
    if (rpc === undefined) {
        return (_jsxs("div", { className: embedded ? 'dsh-usage-dashboard dsh-usage-dashboard-embedded' : 'dsh-usage-dashboard', children: [!embedded && _jsx("style", { children: usageDashboardCss }), _jsx("div", { className: "dsh-usage-container", children: _jsx("div", { className: "dsh-usage-empty", children: _jsx("p", { className: "dsh-usage-empty-desc", children: t('usageDashboardUnavailable') }) }) })] }));
    }
    return (_jsxs(_Fragment, { children: [_jsx(UsageDashboardView, { state: state, t: t, embedded: embedded, onAction: dispatch, onOpenClear: () => {
                    setClearTarget(state.request.provider);
                    setClearConfirm(CLEAR_CONFIRM_OPEN);
                } }), clearConfirm !== undefined && clearTarget !== undefined && state.response !== undefined && (_jsx(ClearUsageHistoryDialog, { target: clearTarget, clearInfo: state.response.clearInfo, state: clearConfirm, t: t, onTargetChange: setClearTarget, onCancel: () => {
                    setClearConfirm(undefined);
                    setClearTarget(undefined);
                }, onConfirm: () => { void runClear(); } }))] }));
}
