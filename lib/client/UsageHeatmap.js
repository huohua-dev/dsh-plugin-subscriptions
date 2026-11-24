import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { buildHeatmapWeeks, formatCompactTokens, formatTokens, providerAccentColor, providerDisplayName, } from './usage-format.js';
const WEEKDAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
export function UsageHeatmap({ days, selectedDate, onSelectDate, t }) {
    const [hoveredDate, setHoveredDate] = useState(undefined);
    const grid = useMemo(() => buildHeatmapWeeks(days), [days]);
    const byDate = useMemo(() => {
        const map = new Map();
        for (const day of days)
            map.set(day.date, day);
        return map;
    }, [days]);
    const stats = useMemo(() => {
        let activeDays = 0;
        let sum = 0;
        let peak;
        for (const day of days) {
            if (day.totalTokens > 0) {
                activeDays += 1;
                sum += day.totalTokens;
                if (!peak || day.totalTokens > peak.totalTokens)
                    peak = day;
            }
        }
        return { activeDays, avgPerActiveDay: activeDays > 0 ? Math.round(sum / activeDays) : 0, peak };
    }, [days]);
    const inspectedDate = selectedDate ?? hoveredDate;
    const inspected = inspectedDate !== undefined ? byDate.get(inspectedDate) : undefined;
    const monthByCol = useMemo(() => {
        const map = new Map();
        for (const entry of grid.monthLabels)
            map.set(entry.col, entry.label);
        return map;
    }, [grid.monthLabels]);
    return (_jsxs("section", { className: "dsh-usage-card", "aria-label": t('usageHeatmapTitle'), children: [_jsxs("div", { className: "dsh-usage-card-header", children: [_jsxs("div", { children: [_jsx("h2", { className: "dsh-usage-card-title", children: t('usageHeatmapTitle') }), _jsx("p", { className: "dsh-usage-card-subtitle", children: t('usageHeatmapSubtitle') })] }), _jsxs("div", { className: "dsh-usage-heat-legend", "aria-hidden": "true", children: [_jsx("span", { children: t('usageHeatmapLess') }), [0, 1, 2, 3, 4].map(level => (_jsx("span", { className: "dsh-usage-heat-swatch", style: { background: `var(--dsh-heat-${level})` } }, level))), _jsx("span", { children: t('usageHeatmapMore') })] })] }), _jsxs("div", { className: "dsh-usage-heatmap-body", children: [_jsx("div", { className: "dsh-usage-heatmap-scroll", children: _jsxs("div", { className: "dsh-usage-heatmap-inner", children: [_jsx("div", { className: "dsh-usage-heatmap-months", style: { gridTemplateColumns: `repeat(${grid.weeks.length}, 14px)` }, "aria-hidden": "true", children: grid.weeks.map((_, col) => (_jsx("span", { className: "dsh-usage-heatmap-month-label", children: monthByCol.get(col) ?? '' }, col))) }), _jsxs("div", { className: "dsh-usage-heatmap-matrix", children: [_jsx("div", { className: "dsh-usage-heatmap-weekdays", "aria-hidden": "true", children: WEEKDAY_LABELS.map((label, idx) => (_jsx("span", { children: label }, idx))) }), _jsx("div", { className: "dsh-usage-heatmap-weeks", role: "grid", "aria-label": t('usageHeatmapTitle'), children: grid.weeks.map((week, col) => (_jsx("div", { className: "dsh-usage-heatmap-col", role: "row", children: week.map((cell, row) => {
                                                    if (cell.date === undefined || cell.bucket === undefined) {
                                                        return (_jsx("span", { className: "dsh-usage-heat-cell", "data-empty": "true", "aria-hidden": "true" }, row));
                                                    }
                                                    const date = cell.date;
                                                    const total = cell.bucket.totalTokens;
                                                    const isSelected = selectedDate === date;
                                                    const label = total > 0
                                                        ? `${date}: ${t('usageTokens', { count: formatTokens(total) })}`
                                                        : `${date}: ${t('usageHeatmapEmptyDay')}`;
                                                    return (_jsx("button", { type: "button", className: "dsh-usage-heat-cell", "data-level": cell.level, "aria-label": label, "aria-pressed": isSelected, title: label, onMouseEnter: () => setHoveredDate(date), onMouseLeave: () => setHoveredDate(current => (current === date ? undefined : current)), onFocus: () => setHoveredDate(date), onBlur: () => setHoveredDate(current => (current === date ? undefined : current)), onClick: () => onSelectDate(isSelected ? undefined : date) }, date));
                                                }) }, col))) })] })] }) }), _jsx("aside", { className: "dsh-usage-day-inspector", "aria-live": "polite", children: inspected !== undefined ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "dsh-usage-day-inspector-head", children: [_jsx("strong", { style: { fontSize: 13 }, children: _jsx("time", { dateTime: inspected.date, children: t('usageHeatmapSelectedDay', { date: inspected.date }) }) }), selectedDate !== undefined && (_jsx("button", { type: "button", className: "dsh-usage-btn dsh-usage-btn-quiet", style: { minHeight: 24, padding: '0 8px' }, onClick: () => onSelectDate(undefined), children: t('usageHeatmapClearDay') }))] }), inspected.totalTokens === 0 ? (_jsx("p", { className: "dsh-usage-card-subtitle", style: { margin: 0 }, children: t('usageHeatmapEmptyDay') })) : (_jsxs(_Fragment, { children: [_jsxs("div", { style: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }, children: [_jsx("span", { style: { fontSize: 20, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }, children: formatCompactTokens(inspected.totalTokens) }), _jsx("span", { className: "dsh-usage-card-subtitle", style: { margin: 0, fontVariantNumeric: 'tabular-nums' }, children: t('usageTokens', { count: formatTokens(inspected.totalTokens) }) })] }), _jsxs("div", { className: "dsh-usage-kpi-sub", children: [_jsxs("span", { children: [t('usageKpiInputShort'), " ", formatCompactTokens(inspected.inputTokens)] }), _jsxs("span", { children: [t('usageKpiOutputShort'), " ", formatCompactTokens(inspected.outputTokens)] }), _jsxs("span", { children: [t('usageKpiCacheReadShort'), " ", formatCompactTokens(inspected.cacheReadTokens)] }), _jsxs("span", { children: [t('usageKpiCacheWriteShort'), " ", formatCompactTokens(inspected.cacheWriteTokens)] }), inspected.reasoningTokens > 0 && (_jsx("span", { children: t('usageKpiReasoning', { count: formatCompactTokens(inspected.reasoningTokens) }) }))] }), Object.keys(inspected.byProvider).length > 0 && (_jsx("div", { className: "dsh-usage-window-models", children: Object.entries(inspected.byProvider)
                                                .filter(([, value]) => value > 0)
                                                .sort((a, b) => b[1] - a[1])
                                                .map(([provider, value]) => (_jsxs("span", { className: "dsh-usage-badge", children: [_jsx("span", { className: "dsh-usage-dot", style: { background: providerAccentColor(provider) } }), providerDisplayName(provider), " \u00B7 ", formatCompactTokens(value)] }, provider))) })), inspected.byModel.length > 0 && (_jsx("ul", { className: "dsh-usage-day-models", children: inspected.byModel.slice(0, 6).map(entry => (_jsxs("li", { className: "dsh-usage-day-model-row", children: [_jsxs("span", { className: "dsh-usage-day-model-name", children: [_jsx("span", { className: "dsh-usage-dot", style: { background: providerAccentColor(entry.provider) } }), _jsx("span", { children: entry.model })] }), _jsx("span", { className: "dsh-usage-day-model-val", title: formatTokens(entry.totalTokens), children: formatCompactTokens(entry.totalTokens) })] }, `${entry.provider}:${entry.model}`))) }))] }))] })) : (_jsxs(_Fragment, { children: [_jsxs("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }, children: [_jsxs("div", { children: [_jsx("div", { className: "dsh-usage-kpi-label", children: t('usageHeatmapActiveDays') }), _jsx("div", { style: { fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums', marginTop: 2 }, children: stats.activeDays })] }), _jsxs("div", { children: [_jsx("div", { className: "dsh-usage-kpi-label", children: t('usageHeatmapAvgDay') }), _jsx("div", { style: { fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums', marginTop: 2 }, children: formatCompactTokens(stats.avgPerActiveDay) })] }), _jsxs("div", { children: [_jsx("div", { className: "dsh-usage-kpi-label", children: t('usageHeatmapPeakDay') }), _jsx("div", { style: { fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums', marginTop: 2 }, children: stats.peak ? formatCompactTokens(stats.peak.totalTokens) : '—' }), stats.peak && (_jsx("div", { className: "dsh-usage-dist-sub", children: stats.peak.date }))] })] }), _jsx("p", { className: "dsh-usage-card-subtitle", style: { margin: 0 }, children: t('usageHeatmapHint') })] })) })] })] }));
}
