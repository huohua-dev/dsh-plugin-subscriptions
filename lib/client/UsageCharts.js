import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { computeNiceTicks, formatCompactTokens, formatPercent, formatShortUtcDate, formatTokens, providerAccentColor, providerDisplayName, } from './usage-format.js';
const CHART_W = 580;
const CHART_H = 224;
const PAD_LEFT = 48;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 28;
const PLOT_W = CHART_W - PAD_LEFT - PAD_RIGHT;
const PLOT_H = CHART_H - PAD_TOP - PAD_BOTTOM;
function DailyTrendChart({ daily, onSelectDate, t, }) {
    const [hoveredIdx, setHoveredIdx] = useState(undefined);
    const { maxVal, ticks, hasData, xTickIndices } = useMemo(() => {
        let max = 0;
        for (const day of daily) {
            if (day.totalTokens > max)
                max = day.totalTokens;
        }
        const niceTicks = computeNiceTicks(max, 4);
        const top = niceTicks[niceTicks.length - 1] ?? 1;
        const indices = [];
        if (daily.length > 0) {
            const target = Math.min(6, daily.length);
            if (target === 1) {
                indices.push(0);
            }
            else {
                for (let i = 0; i < target; i++) {
                    const idx = Math.round((i * (daily.length - 1)) / (target - 1));
                    if (indices[indices.length - 1] !== idx)
                        indices.push(idx);
                }
            }
        }
        return { maxVal: top, ticks: niceTicks, hasData: max > 0, xTickIndices: indices };
    }, [daily]);
    const hovered = hoveredIdx !== undefined ? daily[hoveredIdx] : undefined;
    const step = daily.length > 0 ? PLOT_W / daily.length : PLOT_W;
    const barWidth = Math.max(2, Math.min(24, step * 0.68));
    return (_jsxs("section", { className: "dsh-usage-card", "aria-label": t('usageTrendTitle'), children: [_jsxs("div", { className: "dsh-usage-card-header", children: [_jsxs("div", { children: [_jsx("h2", { className: "dsh-usage-card-title", children: t('usageTrendTitle') }), _jsx("p", { className: "dsh-usage-card-subtitle", children: t('usageTrendSubtitle') })] }), _jsxs("div", { className: "dsh-usage-legend", "aria-hidden": "true", children: [_jsxs("span", { className: "dsh-usage-legend-item", children: [_jsx("span", { className: "dsh-usage-legend-swatch", style: { background: 'var(--dsh-tok-input)' } }), t('usageLegendInput')] }), _jsxs("span", { className: "dsh-usage-legend-item", children: [_jsx("span", { className: "dsh-usage-legend-swatch", style: { background: 'var(--dsh-tok-output)' } }), t('usageLegendOutput')] }), _jsxs("span", { className: "dsh-usage-legend-item", children: [_jsx("span", { className: "dsh-usage-legend-swatch", style: { background: 'var(--dsh-tok-cache-read)' } }), t('usageLegendCacheRead')] }), _jsxs("span", { className: "dsh-usage-legend-item", children: [_jsx("span", { className: "dsh-usage-legend-swatch", style: { background: 'var(--dsh-tok-cache-write)' } }), t('usageLegendCacheWrite')] })] })] }), !hasData ? (_jsx("p", { className: "dsh-usage-card-subtitle", style: { margin: '24px 0', textAlign: 'center' }, children: t('usageTrendEmpty') })) : (_jsxs("div", { className: "dsh-usage-chart-wrap", onMouseLeave: () => setHoveredIdx(undefined), children: [_jsxs("svg", { className: "dsh-usage-chart-svg", viewBox: `0 0 ${CHART_W} ${CHART_H}`, role: "img", "aria-label": t('usageTrendTitle'), children: [ticks.map(tick => {
                                const y = PAD_TOP + PLOT_H - (tick / maxVal) * PLOT_H;
                                return (_jsxs("g", { children: [_jsx("line", { x1: PAD_LEFT, x2: CHART_W - PAD_RIGHT, y1: y, y2: y, stroke: "var(--dsw-alias-border-l2)", strokeWidth: "0.75", strokeDasharray: tick === 0 ? undefined : '3 3' }), _jsx("text", { x: PAD_LEFT - 8, y: y + 3.5, textAnchor: "end", fontSize: "10.5", fill: "var(--dsw-alias-label-tertiary)", style: { fontVariantNumeric: 'tabular-nums' }, children: formatCompactTokens(tick) })] }, tick));
                            }), daily.map((day, index) => {
                                const slotX = PAD_LEFT + index * step;
                                const barX = slotX + (step - barWidth) / 2;
                                const segments = [
                                    { key: 'input', value: day.inputTokens, color: 'var(--dsh-tok-input)' },
                                    { key: 'output', value: day.outputTokens, color: 'var(--dsh-tok-output)' },
                                    { key: 'cacheRead', value: day.cacheReadTokens, color: 'var(--dsh-tok-cache-read)' },
                                    { key: 'cacheWrite', value: day.cacheWriteTokens, color: 'var(--dsh-tok-cache-write)' },
                                ];
                                let yCursor = PAD_TOP + PLOT_H;
                                const isHovered = hoveredIdx === index;
                                return (_jsxs("g", { style: { cursor: onSelectDate ? 'pointer' : 'default' }, onMouseEnter: () => setHoveredIdx(index), onClick: () => onSelectDate?.(day.date), children: [isHovered && (_jsx("rect", { x: slotX, y: PAD_TOP, width: step, height: PLOT_H, rx: 3, fill: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.08))" })), _jsx("rect", { x: slotX, y: PAD_TOP, width: step, height: PLOT_H, fill: "transparent" }), segments.map(seg => {
                                            if (seg.value <= 0)
                                                return null;
                                            const h = Math.max(1, (seg.value / maxVal) * PLOT_H);
                                            yCursor -= h;
                                            return (_jsx("rect", { x: barX, y: yCursor, width: barWidth, height: h, rx: 1.2, fill: seg.color, opacity: hoveredIdx === undefined || isHovered ? 0.94 : 0.52 }, seg.key));
                                        })] }, day.date));
                            }), xTickIndices.map(idx => {
                                const day = daily[idx];
                                const x = PAD_LEFT + idx * step + step / 2;
                                const anchor = idx === 0 ? 'start' : idx === daily.length - 1 ? 'end' : 'middle';
                                return (_jsx("text", { x: x, y: CHART_H - 6, textAnchor: anchor, fontSize: "10.5", fill: "var(--dsw-alias-label-tertiary)", children: formatShortUtcDate(day.date) }, day.date));
                            })] }), hovered !== undefined && hoveredIdx !== undefined && (_jsxs("div", { className: "dsh-usage-tooltip", style: hoveredIdx > daily.length * 0.58
                            ? { left: 12 }
                            : { right: 12 }, children: [_jsxs("div", { style: { fontWeight: 600, marginBottom: 4 }, children: [hovered.date, " (UTC)"] }), _jsxs("div", { className: "dsh-usage-tooltip-row", style: { fontWeight: 600, marginBottom: 4 }, children: [_jsx("span", { children: t('usageKpiTotal') }), _jsx("span", { children: formatTokens(hovered.totalTokens) })] }), _jsxs("div", { className: "dsh-usage-tooltip-row", children: [_jsx("span", { style: { color: 'var(--dsh-tok-input)' }, children: t('usageLegendInput') }), _jsx("span", { children: formatTokens(hovered.inputTokens) })] }), _jsxs("div", { className: "dsh-usage-tooltip-row", children: [_jsx("span", { style: { color: 'var(--dsh-tok-output)' }, children: t('usageLegendOutput') }), _jsx("span", { children: formatTokens(hovered.outputTokens) })] }), _jsxs("div", { className: "dsh-usage-tooltip-row", children: [_jsx("span", { style: { color: 'var(--dsh-tok-cache-read)' }, children: t('usageLegendCacheRead') }), _jsx("span", { children: formatTokens(hovered.cacheReadTokens) })] }), _jsxs("div", { className: "dsh-usage-tooltip-row", children: [_jsx("span", { style: { color: 'var(--dsh-tok-cache-write)' }, children: t('usageLegendCacheWrite') }), _jsx("span", { children: formatTokens(hovered.cacheWriteTokens) })] }), hovered.reasoningTokens > 0 && (_jsx("div", { style: { marginTop: 4, opacity: 0.8 }, children: t('usageKpiReasoning', { count: formatTokens(hovered.reasoningTokens) }) }))] }))] }))] }));
}
function TokenProgressBar({ totals, maxTokens }) {
    if (maxTokens <= 0 || totals.totalTokens <= 0) {
        return _jsx("div", { className: "dsh-usage-dist-track", "aria-hidden": "true" });
    }
    const widthPct = (value) => `${(value / maxTokens) * 100}%`;
    return (_jsxs("div", { className: "dsh-usage-dist-track", "aria-hidden": "true", children: [totals.inputTokens > 0 && (_jsx("div", { style: { width: widthPct(totals.inputTokens), background: 'var(--dsh-tok-input)' } })), totals.outputTokens > 0 && (_jsx("div", { style: { width: widthPct(totals.outputTokens), background: 'var(--dsh-tok-output)' } })), totals.cacheReadTokens > 0 && (_jsx("div", { style: { width: widthPct(totals.cacheReadTokens), background: 'var(--dsh-tok-cache-read)' } })), totals.cacheWriteTokens > 0 && (_jsx("div", { style: { width: widthPct(totals.cacheWriteTokens), background: 'var(--dsh-tok-cache-write)' } }))] }));
}
function DistributionChart({ models, providerBreakdown, mode, onMode, t, }) {
    const [expanded, setExpanded] = useState(false);
    const MAX_VISIBLE = 7;
    const rows = mode === 'model' ? models : providerBreakdown;
    const visibleRows = mode === 'model' && !expanded ? models.slice(0, MAX_VISIBLE) : rows;
    const maxTokens = rows.length > 0 ? rows[0].totalTokens : 0;
    return (_jsxs("section", { className: "dsh-usage-card", "aria-label": t('usageDistributionTitle'), children: [_jsxs("div", { className: "dsh-usage-card-header", children: [_jsx("h2", { className: "dsh-usage-card-title", children: t('usageDistributionTitle') }), _jsxs("div", { className: "dsh-usage-segmented dsh-usage-segmented-compact", role: "group", "aria-label": t('usageDistributionTitle'), children: [_jsx("button", { type: "button", className: "dsh-usage-pill", "aria-pressed": mode === 'model', onClick: () => onMode('model'), children: t('usageByModel') }), _jsx("button", { type: "button", className: "dsh-usage-pill", "aria-pressed": mode === 'provider', onClick: () => onMode('provider'), children: t('usageByProvider') })] })] }), rows.length === 0 ? (_jsx("p", { className: "dsh-usage-card-subtitle", style: { margin: '24px 0', textAlign: 'center' }, children: t('usageDistributionEmpty') })) : (_jsxs("div", { className: "dsh-usage-dist-list", children: [mode === 'model'
                        ? visibleRows.map(entry => (_jsxs("div", { className: "dsh-usage-dist-row", children: [_jsxs("div", { className: "dsh-usage-dist-head", children: [_jsxs("span", { className: "dsh-usage-dist-label", title: `${providerDisplayName(entry.provider)} · ${entry.model}`, children: [_jsx("span", { className: "dsh-usage-dot", style: { background: providerAccentColor(entry.provider) } }), _jsx("span", { children: entry.model })] }), _jsxs("span", { className: "dsh-usage-dist-val", title: formatTokens(entry.totalTokens), children: [_jsx("strong", { children: formatCompactTokens(entry.totalTokens) }), " \u00B7 ", formatPercent(entry.share)] })] }), _jsx(TokenProgressBar, { totals: entry, maxTokens: maxTokens }), _jsxs("div", { className: "dsh-usage-dist-sub", children: [providerDisplayName(entry.provider), " \u00B7 ", t('usageKpiInputShort'), " ", formatCompactTokens(entry.inputTokens), ' · ', t('usageKpiOutputShort'), " ", formatCompactTokens(entry.outputTokens), ' · ', t('usageKpiCacheReadShort'), " ", formatCompactTokens(entry.cacheReadTokens), entry.cacheWriteTokens > 0 && ` · ${t('usageKpiCacheWriteShort')} ${formatCompactTokens(entry.cacheWriteTokens)}`, entry.reasoningTokens > 0 && ` · ${t('usageKpiReasoning', { count: formatCompactTokens(entry.reasoningTokens) })}`] })] }, `${entry.provider}:${entry.model}`)))
                        : visibleRows.map(entry => (_jsxs("div", { className: "dsh-usage-dist-row", children: [_jsxs("div", { className: "dsh-usage-dist-head", children: [_jsxs("span", { className: "dsh-usage-dist-label", children: [_jsx("span", { className: "dsh-usage-dot", style: { background: providerAccentColor(entry.provider) } }), _jsx("span", { children: providerDisplayName(entry.provider) })] }), _jsxs("span", { className: "dsh-usage-dist-val", title: formatTokens(entry.totalTokens), children: [_jsx("strong", { children: formatCompactTokens(entry.totalTokens) }), " \u00B7 ", formatPercent(entry.share)] })] }), _jsx(TokenProgressBar, { totals: entry, maxTokens: maxTokens }), _jsxs("div", { className: "dsh-usage-dist-sub", children: [t('usageKpiModelsCount', { count: entry.activeModels }), ' · ', t('usageKpiAccountsCount', { accounts: entry.activeAccounts }), ' · ', t('usageKpiInputShort'), " ", formatCompactTokens(entry.inputTokens), ' · ', t('usageKpiOutputShort'), " ", formatCompactTokens(entry.outputTokens), ' · ', t('usageKpiCacheReadShort'), " ", formatCompactTokens(entry.cacheReadTokens)] })] }, entry.provider))), mode === 'model' && models.length > MAX_VISIBLE && (_jsx("button", { type: "button", className: "dsh-usage-btn dsh-usage-btn-quiet", style: { alignSelf: 'flex-start', padding: '0 6px', minHeight: 26 }, onClick: () => setExpanded(prev => !prev), children: expanded
                            ? t('usageDistributionShowLess')
                            : t('usageDistributionShowMore', { count: models.length - MAX_VISIBLE }) }))] }))] }));
}
export function UsageCharts({ daily, models, providerBreakdown, distributionMode, onDistributionMode, onSelectDate, t, }) {
    return (_jsxs("div", { className: "dsh-usage-charts-grid", children: [_jsx(DailyTrendChart, { daily: daily, ...onSelectDate ? { onSelectDate } : {}, t: t }), _jsx(DistributionChart, { models: models, providerBreakdown: providerBreakdown, mode: distributionMode, onMode: onDistributionMode, t: t })] }));
}
