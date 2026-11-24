import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { MARKER_KEYS, computeNiceTicks, formatCompactTokens, formatCycleAxisLabel, formatCycleTimeRange, formatPercent, formatRelativeDuration, formatTokens, kindLabel, providerAccentColor, providerDisplayName, quotaProgressTone, } from './usage-format.js';
const MAX_CHART_CYCLES = 24;
const CHART_W = 980;
const CHART_H = 290;
const PAD_LEFT = 58;
const PAD_RIGHT = 48;
const PAD_TOP = 26;
const PAD_BOTTOM = 44;
const PLOT_W = CHART_W - PAD_LEFT - PAD_RIGHT;
const PLOT_H = CHART_H - PAD_TOP - PAD_BOTTOM;
const QUOTA_TICKS = [0, 25, 50, 75, 100];
function clampPercent(value) {
    return Math.max(0, Math.min(100, Math.round(value)));
}
function toneStrokeColor(tone) {
    switch (tone) {
        case 'ok': return 'var(--dsw-alias-state-success-primary, #10b981)';
        case 'warn': return 'var(--dsw-alias-state-warn-primary, #f59e0b)';
        case 'danger': return 'var(--dsw-alias-state-error-primary, #ef4444)';
    }
}
function statusBadge(win, now, t) {
    switch (win.status) {
        case 'open': {
            const countdown = win.resetAt !== undefined && win.resetAt > now
                ? ` · ${t('usageCycleResetsIn', { time: formatRelativeDuration(win.resetAt - now) })}`
                : '';
            return {
                text: `${t('usageWindowStatusOpen')}${countdown}`,
                className: 'dsh-usage-badge dsh-usage-badge-open',
            };
        }
        case 'ended-early':
            return { text: t('usageWindowStatusEndedEarly'), className: 'dsh-usage-badge dsh-usage-badge-warn' };
        case 'closed':
            return { text: t('usageWindowStatusClosed'), className: 'dsh-usage-badge' };
    }
}
function cycleKey(win, fallbackIndex) {
    return win.id || `${win.provider}:${win.account}:${win.kind}:${win.scope ?? ''}:${fallbackIndex}`;
}
function shortKindTag(win, t) {
    if (win.kind === '5h')
        return win.scope ? `5h · ${win.scope}` : '5h';
    if (win.kind === 'weekly')
        return win.scope ? `${t('usageWeekly')} · ${win.scope}` : t('usageWeekly');
    return kindLabel(t, win.scope === undefined ? { kind: win.kind } : { kind: win.kind, scope: win.scope });
}
/**
 * Pure-SVG Dual-Axis Combo Chart for Quota Cycles:
 * - Left Y-axis + rounded bars: Cycle Token Usage (`totalTokens`), colored by provider
 * - Right Y-axis (0–100%) + line & semantic dots: Quota Utilization % (`quotaUsedPercent`), breaking cleanly across missing gaps
 * - Top clickable strip for active (`isCurrent`) cycles + click-to-pin inline Cycle Inspector strip below
 */
export function ActiveWindowsPanel({ windows, now = Date.now(), initialKind = 'all', initialSelectedId, t }) {
    const [kindFilter, setKindFilter] = useState(initialKind);
    const [hoveredIdx, setHoveredIdx] = useState(undefined);
    const [selectedId, setSelectedId] = useState(initialSelectedId);
    const kindCounts = useMemo(() => {
        let count5h = 0;
        let countWeekly = 0;
        for (const win of windows) {
            if (win.kind === '5h')
                count5h += 1;
            else if (win.kind === 'weekly')
                countWeekly += 1;
        }
        return { all: windows.length, '5h': count5h, weekly: countWeekly };
    }, [windows]);
    // Keep up to MAX_CHART_CYCLES most recent cycles, ordered chronologically oldest -> newest (left -> right).
    const chartCycles = useMemo(() => {
        const matching = windows.filter(win => {
            if (kindFilter === '5h')
                return win.kind === '5h';
            if (kindFilter === 'weekly')
                return win.kind === 'weekly';
            return true;
        });
        const recent = matching.slice(0, MAX_CHART_CYCLES);
        return [...recent].sort((a, b) => {
            const ta = a.startsAt ?? a.countedFrom;
            const tb = b.startsAt ?? b.countedFrom;
            if (ta !== tb)
                return ta - tb;
            if (a.isCurrent !== b.isCurrent)
                return Number(a.isCurrent) - Number(b.isCurrent);
            return a.id.localeCompare(b.id);
        });
    }, [windows, kindFilter]);
    const activePills = useMemo(() => {
        return chartCycles
            .filter(win => win.isCurrent)
            .sort((a, b) => (b.quotaUsedPercent ?? -1) - (a.quotaUsedPercent ?? -1) || b.totalTokens - a.totalTokens);
    }, [chartCycles]);
    const { tokenTicks, maxTokens, xTickIndices, lineSegments } = useMemo(() => {
        let peakTok = 0;
        for (const win of chartCycles) {
            if (win.totalTokens > peakTok)
                peakTok = win.totalTokens;
        }
        const ticks = computeNiceTicks(peakTok, 4);
        const topTok = ticks[ticks.length - 1] ?? 1;
        const n = chartCycles.length;
        const xIndices = [];
        if (n > 0) {
            const maxLabels = Math.min(n, 8);
            if (maxLabels === n) {
                for (let i = 0; i < n; i++)
                    xIndices.push(i);
            }
            else {
                for (let i = 0; i < maxLabels; i++) {
                    const idx = Math.round((i * (n - 1)) / (maxLabels - 1));
                    if (xIndices[xIndices.length - 1] !== idx)
                        xIndices.push(idx);
                }
            }
        }
        // Build contiguous polyline segments only across cycles with defined quotaUsedPercent (never plotting undefined as 0%).
        const stepVal = n > 0 ? PLOT_W / n : PLOT_W;
        const segments = [];
        let currentPts = [];
        for (let i = 0; i < n; i++) {
            const pct = chartCycles[i].quotaUsedPercent;
            if (pct !== undefined && Number.isFinite(pct)) {
                const cx = PAD_LEFT + i * stepVal + stepVal / 2;
                const cy = PAD_TOP + PLOT_H - (clampPercent(pct) / 100) * PLOT_H;
                currentPts.push(`${cx.toFixed(1)},${cy.toFixed(1)}`);
            }
            else {
                if (currentPts.length >= 2)
                    segments.push({ points: currentPts.join(' ') });
                currentPts = [];
            }
        }
        if (currentPts.length >= 2)
            segments.push({ points: currentPts.join(' ') });
        return { tokenTicks: ticks, maxTokens: topTok, xTickIndices: xIndices, lineSegments: segments };
    }, [chartCycles]);
    const selectedCycle = useMemo(() => {
        if (selectedId === undefined)
            return undefined;
        return chartCycles.find((win, idx) => cycleKey(win, idx) === selectedId);
    }, [chartCycles, selectedId]);
    const hoveredCycle = hoveredIdx !== undefined ? chartCycles[hoveredIdx] : undefined;
    const step = chartCycles.length > 0 ? PLOT_W / chartCycles.length : PLOT_W;
    const barWidth = Math.max(10, Math.min(34, step * 0.56));
    const toggleSelect = (id) => {
        setSelectedId(current => (current === id ? undefined : id));
    };
    return (_jsxs("section", { className: "dsh-usage-card", "aria-label": t('usageActiveWindowsTitle'), children: [_jsxs("div", { className: "dsh-usage-card-header", children: [_jsxs("div", { children: [_jsx("h2", { className: "dsh-usage-card-title", children: t('usageActiveWindowsTitle') }), _jsx("p", { className: "dsh-usage-card-subtitle", children: t('usageActiveWindowsNote') })] }), windows.length > 0 && (_jsx("div", { className: "dsh-usage-cycle-controls", children: _jsxs("div", { className: "dsh-usage-segmented", role: "group", "aria-label": t('usageKind'), children: [_jsx("button", { type: "button", className: "dsh-usage-pill", "aria-pressed": kindFilter === 'all', onClick: () => setKindFilter('all'), children: t('usageCyclesKindAll', { count: kindCounts.all }) }), _jsx("button", { type: "button", className: "dsh-usage-pill", "aria-pressed": kindFilter === '5h', disabled: kindCounts['5h'] === 0, onClick: () => setKindFilter('5h'), children: t('usageCyclesKind5h', { count: kindCounts['5h'] }) }), _jsx("button", { type: "button", className: "dsh-usage-pill", "aria-pressed": kindFilter === 'weekly', disabled: kindCounts.weekly === 0, onClick: () => setKindFilter('weekly'), children: t('usageCyclesKindWeekly', { count: kindCounts.weekly }) })] }) }))] }), chartCycles.length === 0 ? (_jsx("p", { className: "dsh-usage-card-subtitle", style: { margin: '12px 0', textAlign: 'center' }, children: t('usageActiveWindowsEmpty') })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "dsh-usage-cycles-legend-row", children: [activePills.length > 0 ? (_jsxs("div", { className: "dsh-usage-active-strip", role: "group", "aria-label": t('usageCyclesActiveStripLabel'), children: [_jsx("span", { className: "dsh-usage-active-strip-label", children: t('usageCyclesActiveStripLabel') }), activePills.map((win, idx) => {
                                        const id = cycleKey(win, idx);
                                        const hasQuota = win.quotaUsedPercent !== undefined && Number.isFinite(win.quotaUsedPercent);
                                        const pct = hasQuota ? clampPercent(win.quotaUsedPercent) : undefined;
                                        const tone = pct !== undefined ? quotaProgressTone(pct) : 'na';
                                        const accountText = win.accountLabel ?? win.account;
                                        const isSelected = selectedId === id;
                                        return (_jsxs("button", { type: "button", className: "dsh-usage-active-pill", "aria-pressed": isSelected, title: `${providerDisplayName(win.provider)} · ${accountText} · ${shortKindTag(win, t)}`, onClick: () => toggleSelect(id), children: [_jsx("span", { className: "dsh-usage-dot", style: { background: providerAccentColor(win.provider) } }), _jsx("span", { children: providerDisplayName(win.provider) }), _jsx("span", { className: "dsh-usage-active-pill-kind", children: shortKindTag(win, t) }), _jsx("span", { className: "dsh-usage-active-pill-tok", children: formatCompactTokens(win.totalTokens) }), _jsx("span", { className: "dsh-usage-active-pill-pct", "data-tone": tone, children: pct !== undefined ? `${pct}%` : 'n/a' })] }, id));
                                    })] })) : _jsx("span", {}), _jsxs("div", { className: "dsh-usage-legend", "aria-hidden": "true", children: [_jsxs("span", { className: "dsh-usage-legend-item", children: [_jsx("span", { className: "dsh-usage-legend-swatch", style: { background: 'var(--dsh-tok-input)' } }), t('usageCyclesLegendTokens')] }), _jsxs("span", { className: "dsh-usage-legend-item", children: [_jsx("span", { className: "dsh-usage-legend-active-bar" }), t('usageCyclesLegendActive')] }), _jsxs("span", { className: "dsh-usage-legend-item", children: [_jsx("span", { className: "dsh-usage-legend-line" }), t('usageCyclesLegendQuota')] }), _jsxs("span", { className: "dsh-usage-legend-item", children: [_jsx("span", { className: "dsh-usage-legend-hollow" }), t('usageCyclesLegendNa')] })] })] }), _jsxs("div", { className: "dsh-usage-combo-wrap", onMouseLeave: () => setHoveredIdx(undefined), children: [_jsxs("svg", { className: "dsh-usage-combo-svg", viewBox: `0 0 ${CHART_W} ${CHART_H}`, role: "img", "aria-label": t('usageActiveWindowsTitle'), children: [_jsx("text", { x: PAD_LEFT - 10, y: 13, textAnchor: "end", fontSize: "10", fontWeight: "500", fill: "var(--dsw-alias-label-tertiary)", children: t('usageCyclesAxisTokens') }), _jsx("text", { x: CHART_W - PAD_RIGHT + 8, y: 13, textAnchor: "start", fontSize: "10", fontWeight: "500", fill: "var(--dsw-alias-label-tertiary)", children: t('usageCyclesAxisQuota') }), QUOTA_TICKS.map(pct => {
                                        const y = PAD_TOP + PLOT_H - (pct / 100) * PLOT_H;
                                        return (_jsxs("g", { children: [_jsx("line", { x1: PAD_LEFT, x2: CHART_W - PAD_RIGHT, y1: y, y2: y, stroke: "var(--dsw-alias-border-l2)", strokeWidth: "0.75", strokeDasharray: pct === 0 ? undefined : '3 3' }), _jsxs("text", { x: CHART_W - PAD_RIGHT + 8, y: y + 3.5, textAnchor: "start", fontSize: "10.5", fill: "var(--dsw-alias-label-tertiary)", style: { fontVariantNumeric: 'tabular-nums' }, children: [pct, "%"] })] }, `q-${pct}`));
                                    }), _jsx("line", { x1: PAD_LEFT, x2: CHART_W - PAD_RIGHT, y1: PAD_TOP + PLOT_H - 0.8 * PLOT_H, y2: PAD_TOP + PLOT_H - 0.8 * PLOT_H, stroke: "var(--dsw-alias-state-warn-primary, #f59e0b)", strokeOpacity: "0.28", strokeWidth: "1", strokeDasharray: "4 4" }), tokenTicks.map(tick => {
                                        const ratio = maxTokens > 0 ? tick / maxTokens : 0;
                                        const y = PAD_TOP + PLOT_H - ratio * PLOT_H;
                                        return (_jsx("text", { x: PAD_LEFT - 10, y: y + 3.5, textAnchor: "end", fontSize: "10.5", fill: "var(--dsw-alias-label-tertiary)", style: { fontVariantNumeric: 'tabular-nums' }, children: formatCompactTokens(tick) }, `t-${tick}`));
                                    }), chartCycles.map((win, index) => {
                                        const id = cycleKey(win, index);
                                        const slotX = PAD_LEFT + index * step;
                                        const cx = slotX + step / 2;
                                        const barX = slotX + (step - barWidth) / 2;
                                        const barH = win.totalTokens > 0 && maxTokens > 0
                                            ? Math.max(3, (win.totalTokens / maxTokens) * PLOT_H)
                                            : 0;
                                        const barY = PAD_TOP + PLOT_H - barH;
                                        const isHovered = hoveredIdx === index;
                                        const isSelected = selectedId === id;
                                        const emphasized = isHovered || isSelected;
                                        const dimmed = (hoveredIdx !== undefined && !isHovered) || (hoveredIdx === undefined && selectedId !== undefined && !isSelected);
                                        const providerColor = providerAccentColor(win.provider);
                                        return (_jsxs("g", { style: { cursor: 'pointer' }, onMouseEnter: () => setHoveredIdx(index), onClick: () => toggleSelect(id), children: [(isHovered || isSelected) && (_jsx("rect", { x: slotX + 1, y: PAD_TOP, width: Math.max(2, step - 2), height: PLOT_H, rx: 4, fill: isSelected
                                                        ? 'var(--dsw-alias-interactive-bg-active, rgba(128,128,128,0.14))'
                                                        : 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.08))' })), _jsx("rect", { x: slotX, y: PAD_TOP, width: step, height: PLOT_H + 22, fill: "transparent" }), barH > 0 && (_jsx("rect", { x: barX, y: barY, width: barWidth, height: barH, rx: 3.5, fill: providerColor, fillOpacity: emphasized ? 0.96 : dimmed ? 0.36 : win.isCurrent ? 0.88 : 0.68, stroke: win.isCurrent ? 'var(--dsw-alias-label-primary)' : isSelected ? 'var(--dsw-alias-label-primary)' : 'none', strokeOpacity: win.isCurrent ? 0.6 : 0.85, strokeWidth: win.isCurrent || isSelected ? 1.25 : 0 })), win.isCurrent && (_jsx("circle", { cx: cx, cy: Math.max(PAD_TOP + 4, barY - 7), r: 3, fill: "var(--dsw-alias-state-success-primary, #10b981)" })), _jsx("circle", { cx: cx, cy: PAD_TOP + PLOT_H + 10, r: 2.8, fill: providerColor, opacity: dimmed ? 0.4 : 0.95 })] }, id));
                                    }), lineSegments.map((seg, i) => (_jsxs("g", { style: { pointerEvents: 'none' }, children: [_jsx("polyline", { points: seg.points, fill: "none", stroke: "var(--dsw-alias-card-fill, var(--dsw-alias-bg-layer-1))", strokeWidth: "4.5", strokeLinecap: "round", strokeLinejoin: "round", opacity: "0.85" }), _jsx("polyline", { points: seg.points, fill: "none", stroke: "var(--dsw-alias-label-primary)", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", opacity: "0.82" })] }, `seg-${i}`))), chartCycles.map((win, index) => {
                                        const id = cycleKey(win, index);
                                        const cx = PAD_LEFT + index * step + step / 2;
                                        const isHovered = hoveredIdx === index;
                                        const isSelected = selectedId === id;
                                        const emphasized = isHovered || isSelected;
                                        const pct = win.quotaUsedPercent !== undefined && Number.isFinite(win.quotaUsedPercent)
                                            ? clampPercent(win.quotaUsedPercent)
                                            : undefined;
                                        if (pct === undefined) {
                                            return (_jsx("circle", { "data-quota-na": "true", cx: cx, cy: PAD_TOP + PLOT_H - 4, r: emphasized ? 4.2 : 3.2, fill: "var(--dsw-alias-card-fill, var(--dsw-alias-bg-layer-1))", stroke: "var(--dsw-alias-label-tertiary)", strokeWidth: "1.5", style: { pointerEvents: 'none' } }, `dot-${id}`));
                                        }
                                        const cy = PAD_TOP + PLOT_H - (pct / 100) * PLOT_H;
                                        const tone = quotaProgressTone(pct);
                                        const dotColor = toneStrokeColor(tone);
                                        const peakPct = win.quotaPeakPercent !== undefined && Number.isFinite(win.quotaPeakPercent)
                                            ? clampPercent(win.quotaPeakPercent)
                                            : undefined;
                                        const showPeak = peakPct !== undefined && peakPct > pct;
                                        const peakY = showPeak ? PAD_TOP + PLOT_H - (peakPct / 100) * PLOT_H : undefined;
                                        return (_jsxs("g", { style: { pointerEvents: 'none' }, children: [showPeak && peakY !== undefined && (_jsxs(_Fragment, { children: [_jsx("line", { x1: cx, x2: cx, y1: cy - 4, y2: peakY, stroke: dotColor, strokeWidth: "1.25", strokeDasharray: "2 1.5", opacity: "0.8" }), _jsx("line", { x1: cx - 3.5, x2: cx + 3.5, y1: peakY, y2: peakY, stroke: dotColor, strokeWidth: "1.5", strokeLinecap: "round" })] })), _jsx("circle", { cx: cx, cy: cy, r: emphasized ? 6.5 : 5.2, fill: "var(--dsw-alias-card-fill, var(--dsw-alias-bg-layer-1))" }), _jsx("circle", { "data-quota-point": "true", "data-tone": tone, cx: cx, cy: cy, r: emphasized ? 4.8 : 3.6, fill: dotColor })] }, `dot-${id}`));
                                    }), xTickIndices.map(idx => {
                                        const win = chartCycles[idx];
                                        const x = PAD_LEFT + idx * step + step / 2;
                                        const anchor = idx === 0 && chartCycles.length > 4
                                            ? 'start'
                                            : idx === chartCycles.length - 1 && chartCycles.length > 4
                                                ? 'end'
                                                : 'middle';
                                        return (_jsx("text", { x: x, y: CHART_H - 10, textAnchor: anchor, fontSize: "10.5", fill: "var(--dsw-alias-label-tertiary)", style: { fontVariantNumeric: 'tabular-nums' }, children: formatCycleAxisLabel(win) }, `x-${idx}`));
                                    })] }), hoveredCycle !== undefined && hoveredIdx !== undefined && (() => {
                                const badge = statusBadge(hoveredCycle, now, t);
                                const hasQuota = hoveredCycle.quotaUsedPercent !== undefined && Number.isFinite(hoveredCycle.quotaUsedPercent);
                                const pct = hasQuota ? clampPercent(hoveredCycle.quotaUsedPercent) : undefined;
                                const peakPct = hoveredCycle.quotaPeakPercent !== undefined && Number.isFinite(hoveredCycle.quotaPeakPercent)
                                    ? clampPercent(hoveredCycle.quotaPeakPercent)
                                    : undefined;
                                const range = formatCycleTimeRange(t, {
                                    ...hoveredCycle.startsAt === undefined ? {} : { startsAt: hoveredCycle.startsAt },
                                    countedFrom: hoveredCycle.countedFrom,
                                    ...hoveredCycle.endsAt === undefined ? {} : { endsAt: hoveredCycle.endsAt },
                                });
                                const accountText = hoveredCycle.loggedIn
                                    ? hoveredCycle.accountLabel ?? hoveredCycle.account
                                    : t('usageAccountLoggedOut', { account: hoveredCycle.accountLabel ?? hoveredCycle.account });
                                const label = kindLabel(t, hoveredCycle.scope === undefined ? { kind: hoveredCycle.kind } : { kind: hoveredCycle.kind, scope: hoveredCycle.scope });
                                return (_jsxs("div", { className: "dsh-usage-tooltip", style: hoveredIdx > chartCycles.length * 0.54
                                        ? { left: 66, maxWidth: 270 }
                                        : { right: 56, maxWidth: 270 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, marginBottom: 2 }, children: [_jsx("span", { className: "dsh-usage-dot", style: { background: providerAccentColor(hoveredCycle.provider) } }), _jsx("span", { children: providerDisplayName(hoveredCycle.provider) }), _jsx("span", { style: { opacity: 0.6, fontWeight: 400 }, children: "\u00B7" }), _jsx("span", { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }, children: accountText })] }), _jsxs("div", { style: { opacity: 0.8, marginBottom: 4 }, children: [label, " \u00B7 ", badge.text] }), _jsx("div", { style: { opacity: 0.72, marginBottom: 6 }, children: range }), _jsxs("div", { className: "dsh-usage-tooltip-row", style: { fontWeight: 600 }, children: [_jsx("span", { children: t('usageCycleTokensLabel') }), _jsx("span", { children: formatCompactTokens(hoveredCycle.totalTokens) })] }), _jsxs("div", { className: "dsh-usage-tooltip-row", style: { fontWeight: 600, marginBottom: 4 }, children: [_jsx("span", { children: t('usageCycleQuotaLabel') }), _jsx("span", { style: { color: pct !== undefined ? toneStrokeColor(quotaProgressTone(pct)) : undefined }, children: pct !== undefined
                                                        ? `${t('usageCycleQuotaUsed', { percent: pct })}${peakPct !== undefined && peakPct > pct ? ` (${t('usageCycleQuotaPeak', { percent: peakPct })})` : ''}`
                                                        : t('usageCycleQuotaNa') })] }), _jsxs("div", { style: { opacity: 0.78, marginBottom: hoveredCycle.models.length > 0 ? 4 : 0 }, children: [t('usageKpiInputShort'), " ", formatCompactTokens(hoveredCycle.inputTokens), ' · ', t('usageKpiOutputShort'), " ", formatCompactTokens(hoveredCycle.outputTokens), ' · ', t('usageKpiCacheReadShort'), " ", formatCompactTokens(hoveredCycle.cacheReadTokens)] }), hoveredCycle.models.slice(0, 2).map(m => (_jsxs("div", { className: "dsh-usage-tooltip-row", style: { opacity: 0.85 }, children: [_jsx("span", { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: m.model }), _jsxs("span", { children: [formatCompactTokens(m.totalTokens), " (", formatPercent(m.share), ")"] })] }, m.model)))] }));
                            })()] }), selectedCycle !== undefined ? (() => {
                        const label = kindLabel(t, selectedCycle.scope === undefined ? { kind: selectedCycle.kind } : { kind: selectedCycle.kind, scope: selectedCycle.scope });
                        const accountText = selectedCycle.loggedIn
                            ? selectedCycle.accountLabel ?? selectedCycle.account
                            : t('usageAccountLoggedOut', { account: selectedCycle.accountLabel ?? selectedCycle.account });
                        const badge = statusBadge(selectedCycle, now, t);
                        const cycleRange = formatCycleTimeRange(t, {
                            ...selectedCycle.startsAt === undefined ? {} : { startsAt: selectedCycle.startsAt },
                            countedFrom: selectedCycle.countedFrom,
                            ...selectedCycle.endsAt === undefined ? {} : { endsAt: selectedCycle.endsAt },
                        });
                        const hasQuota = selectedCycle.quotaUsedPercent !== undefined && Number.isFinite(selectedCycle.quotaUsedPercent);
                        const usedPct = hasQuota ? clampPercent(selectedCycle.quotaUsedPercent) : undefined;
                        const peakPct = selectedCycle.quotaPeakPercent !== undefined && Number.isFinite(selectedCycle.quotaPeakPercent)
                            ? clampPercent(selectedCycle.quotaPeakPercent)
                            : undefined;
                        const showPeak = usedPct !== undefined && peakPct !== undefined && peakPct > usedPct;
                        const tone = usedPct !== undefined ? quotaProgressTone(usedPct) : 'na';
                        return (_jsxs("aside", { className: "dsh-usage-cycle-inspector", "aria-live": "polite", children: [_jsxs("div", { className: "dsh-usage-window-top", children: [_jsxs("span", { className: "dsh-usage-window-id", children: [_jsx("span", { className: "dsh-usage-dot", style: { background: providerAccentColor(selectedCycle.provider) } }), _jsx("span", { className: "dsh-usage-window-provider", children: providerDisplayName(selectedCycle.provider) }), _jsx("span", { className: "dsh-usage-window-sep", "aria-hidden": "true", children: "\u00B7" }), _jsx("span", { className: "dsh-usage-window-account", title: accountText, children: accountText })] }), _jsxs("div", { className: "dsh-usage-window-meta", children: [_jsx("span", { className: "dsh-usage-badge", title: label, children: label }), _jsx("span", { className: badge.className, children: badge.text }), _jsx("span", { className: "dsh-usage-dist-sub", children: cycleRange }), _jsx("button", { type: "button", className: "dsh-usage-btn dsh-usage-btn-quiet", style: { minHeight: 24, padding: '0 8px' }, onClick: () => setSelectedId(undefined), children: t('usageCyclesClearSelection') })] })] }), _jsxs("div", { className: "dsh-usage-cycle-inspector-grid", children: [_jsxs("div", { className: "dsh-usage-cycle-inspector-col", children: [_jsxs("div", { className: "dsh-usage-cycle-metrics", children: [_jsxs("div", { children: [_jsx("div", { className: "dsh-usage-cycle-metric-label", children: t('usageCycleTokensLabel') }), _jsx("span", { className: "dsh-usage-window-total", title: t('usageTokens', { count: formatTokens(selectedCycle.totalTokens) }), children: formatCompactTokens(selectedCycle.totalTokens) })] }), _jsxs("div", { className: "dsh-usage-cycle-quota-col", children: [_jsx("div", { className: "dsh-usage-cycle-metric-label", children: t('usageCycleQuotaLabel') }), _jsx("span", { className: "dsh-usage-cycle-quota-val", "data-tone": tone, children: usedPct !== undefined
                                                                        ? t('usageCycleQuotaUsed', { percent: usedPct })
                                                                        : t('usageCycleQuotaNa') }), showPeak && (_jsx("span", { className: "dsh-usage-dist-sub", children: t('usageCycleQuotaPeak', { percent: peakPct }) }))] })] }), _jsxs("div", { className: "dsh-usage-quota-track", "data-na": usedPct === undefined ? 'true' : 'false', role: usedPct !== undefined ? 'progressbar' : undefined, "aria-valuenow": usedPct, "aria-valuemin": usedPct !== undefined ? 0 : undefined, "aria-valuemax": usedPct !== undefined ? 100 : undefined, "aria-label": usedPct !== undefined ? t('usageCycleQuotaUsed', { percent: usedPct }) : t('usageCycleQuotaNa'), children: [usedPct !== undefined && (_jsx("div", { className: "dsh-usage-quota-fill", "data-tone": tone, style: { width: `${usedPct}%` } })), showPeak && peakPct !== undefined && (_jsx("div", { className: "dsh-usage-quota-peak-mark", style: { left: `calc(${peakPct}% - 1px)` }, title: t('usageCycleQuotaPeak', { percent: peakPct }) }))] }), _jsxs("div", { className: "dsh-usage-dist-sub", children: [t('usageKpiInputShort'), " ", formatCompactTokens(selectedCycle.inputTokens), ' · ', t('usageKpiOutputShort'), " ", formatCompactTokens(selectedCycle.outputTokens), ' · ', t('usageKpiCacheReadShort'), " ", formatCompactTokens(selectedCycle.cacheReadTokens), selectedCycle.cacheWriteTokens > 0 && ` · ${t('usageKpiCacheWriteShort')} ${formatCompactTokens(selectedCycle.cacheWriteTokens)}`, selectedCycle.reasoningTokens > 0 && ` · ${t('usageKpiReasoning', { count: formatCompactTokens(selectedCycle.reasoningTokens) })}`] })] }), _jsxs("div", { className: "dsh-usage-cycle-inspector-col", children: [selectedCycle.models.length > 0 && (_jsxs("div", { className: "dsh-usage-window-models", children: [selectedCycle.models.slice(0, 5).map(entry => (_jsxs("span", { className: "dsh-usage-model-chip", title: formatTokens(entry.totalTokens), children: [_jsx("span", { children: entry.model }), _jsx("strong", { children: formatCompactTokens(entry.totalTokens) }), entry.share > 0 && _jsxs("span", { children: ["(", formatPercent(entry.share), ")"] })] }, entry.model))), selectedCycle.models.length > 5 && (_jsxs("span", { className: "dsh-usage-model-chip", children: ["+", selectedCycle.models.length - 5] }))] })), selectedCycle.markers.length > 0 && (_jsx("ul", { className: "dsh-usage-markers", children: selectedCycle.markers.map(marker => (_jsx("li", { children: t(MARKER_KEYS[marker]) }, marker))) }))] })] })] }));
                    })() : (_jsx("p", { className: "dsh-usage-card-subtitle", style: { margin: 0 }, children: t('usageCyclesInspectorHint') }))] }))] }));
}
