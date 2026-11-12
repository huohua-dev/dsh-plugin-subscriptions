import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ANTIGRAVITY_QUOTA_SCOPES, antigravityQuotaScope } from '../antigravity-model-id.js';
import { quotaPercent, quotaText } from './quota-display.js';
import { usageBarColor } from './SubscriptionsSection.js';
import { useQuotaDisplayMode } from './usage-badge-preferences.js';
/** Same 4px track as the other subscription rows; fill and value follow the active quota display mode. */
function QuotaBar({ label, percent, valueText, color }) {
    const width = percent ?? 0;
    return _jsx("div", { role: "progressbar", "aria-label": label, "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": percent, "aria-valuetext": valueText, style: { height: 4, borderRadius: 2, overflow: 'hidden', background: 'var(--dsw-alias-border-l2)', marginBottom: 2 }, children: _jsx("div", { style: { width: `${width}%`, height: '100%', borderRadius: 2, background: color } }) });
}
function resetDuration(at) {
    const minutes = Math.max(1, Math.ceil((at - Date.now()) / 60000));
    const hours = Math.floor(minutes / 60);
    return hours >= 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h`
        : hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}
/** Provider-defined shared limits, unified with the global used/remaining quota display mode. */
export function AntigravityQuotaSummary({ windows, t, mode }) {
    const selectedMode = useQuotaDisplayMode();
    const quotaMode = mode ?? selectedMode;
    const titles = ['usageGeminiModels', 'usageClaudeGptModels', 'usageArgon'];
    return _jsxs("div", { style: { display: 'grid', gap: 22, paddingTop: 10 }, children: [ANTIGRAVITY_QUOTA_SCOPES.map((scope, index) => {
                const rows = windows.filter(window => window.scope === scope)
                    .sort((a, b) => (a.kind === 'weekly' ? 0 : 1) - (b.kind === 'weekly' ? 0 : 1));
                if (!rows.length)
                    return null;
                const title = t(titles[index]);
                return _jsxs("section", { "aria-label": title, children: [_jsx("h4", { style: { margin: '0 0 10px', fontSize: 13, fontWeight: 600 }, children: title }), _jsx("div", { style: { display: 'grid', gap: 14 }, children: rows.map((window, index) => {
                                const percent = quotaPercent(window.usedPercent, quotaMode);
                                const color = usageBarColor(window.usedPercent);
                                const label = t(window.kind === 'weekly' ? 'usageWeeklyLimit' : 'usageFiveHourLimit');
                                return _jsxs("div", { style: { display: 'grid', gap: 4 }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, fontSize: 12 }, children: [_jsx("span", { style: { color: 'var(--dsw-alias-label-secondary)' }, children: label }), _jsxs("span", { style: { textAlign: 'right', fontVariantNumeric: 'tabular-nums', color }, children: [quotaText(window.usedPercent, quotaMode, t), window.resetsAt !== undefined && _jsx("span", { style: { color: 'var(--dsw-alias-label-tertiary)' }, children: ` · ${window.resetsAt <= Date.now() ? t('quotaExpiredWindow') : resetDuration(window.resetsAt)}` })] })] }), _jsx(QuotaBar, { label: `${title} · ${label}`, percent: percent, valueText: quotaText(window.usedPercent, quotaMode, t), color: color })] }, `${window.kind}-${index}`);
                            }) })] }, scope);
            }), windows.filter(window => !antigravityQuotaScope(window.scope)).map((window, index) => {
                const percent = quotaPercent(window.usedPercent, quotaMode);
                const color = usageBarColor(window.usedPercent);
                const label = t(window.kind === 'weekly' ? 'usageWeeklyLimit'
                    : window.kind === 'session' ? 'usageFiveHourLimit' : 'usageWindow');
                return _jsxs("section", { "aria-label": `${window.scope ?? ''} · ${label}`, children: [_jsx("h4", { style: { margin: '0 0 10px', fontSize: 13, fontWeight: 600 }, children: window.scope }), _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 12 }, children: [_jsx("span", { children: label }), _jsx("span", { style: { color }, children: quotaText(window.usedPercent, quotaMode, t) })] }), _jsx("div", { style: { marginTop: 4 }, children: _jsx(QuotaBar, { label: `${window.scope ?? ''} · ${label}`, percent: percent, valueText: quotaText(window.usedPercent, quotaMode, t), color: color }) }), window.resetsAt !== undefined && _jsx("div", { style: { marginTop: 4, textAlign: 'right', fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }, children: window.resetsAt <= Date.now() ? t('quotaExpiredWindow') : t('usageResetsIn', { time: resetDuration(window.resetsAt) }) })] }, `model-${index}`);
            })] });
}
