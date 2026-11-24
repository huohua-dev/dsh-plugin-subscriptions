import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useId, useState } from 'react';
import { SettingHelp } from './SettingHelp.js';
import { setUsageBadgeMode, useUsageBadgeMode, setQuotaDisplayMode, useQuotaDisplayMode } from './usage-badge-preferences.js';
function SelectChevron() {
    return (_jsx("svg", { "aria-hidden": "true", className: "dsh-subscription-select-chevron", width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "m4 6 4 4 4-4" }) }));
}
/** Browser-local display preference; never changes provider or account settings. */
export function UsageBadgeDisplaySetting({ t }) {
    const mode = useUsageBadgeMode();
    const quotaMode = useQuotaDisplayMode();
    const [failed, setFailed] = useState(false);
    const badgeId = useId();
    const quotaId = useId();
    return (_jsxs("div", { className: "dsh-subscription-settings-card", style: styles.card, children: [_jsxs("div", { style: styles.field, children: [_jsxs("div", { style: styles.labelRow, children: [_jsx("label", { htmlFor: badgeId, children: t('usageBadgeDisplay') }), _jsx(SettingHelp, { title: t('usageBadgeDisplay'), hint: t('usageBadgeDisplayHint'), t: t })] }), _jsxs("div", { className: "dsh-subscription-select-wrap", children: [_jsxs("select", { id: badgeId, className: "dsh-subscription-select", style: styles.select, "aria-label": t('usageBadgeDisplay'), value: mode, onChange: event => {
                                    const value = event.currentTarget.value;
                                    if (value !== 'recent' && value !== 'hidden')
                                        return;
                                    try {
                                        setUsageBadgeMode(value);
                                        setFailed(false);
                                    }
                                    catch (error) {
                                        if (!(error instanceof DOMException) || !['SecurityError', 'QuotaExceededError'].includes(error.name))
                                            throw error;
                                        setFailed(true);
                                    }
                                }, children: [_jsx("option", { value: "recent", children: t('usageBadgeDisplayRecent') }), _jsx("option", { value: "hidden", children: t('usageBadgeDisplayHidden') })] }), _jsx(SelectChevron, {})] })] }), _jsxs("div", { style: styles.field, children: [_jsxs("div", { style: styles.labelRow, children: [_jsx("label", { htmlFor: quotaId, children: t('quotaDisplay') }), _jsx(SettingHelp, { title: t('quotaDisplay'), hint: t('quotaDisplayHint'), t: t })] }), _jsxs("div", { className: "dsh-subscription-select-wrap", children: [_jsxs("select", { id: quotaId, className: "dsh-subscription-select", style: styles.select, "aria-label": t('quotaDisplay'), value: quotaMode, onChange: event => {
                                    const value = event.currentTarget.value;
                                    if (value !== 'used' && value !== 'remaining')
                                        return;
                                    try {
                                        setQuotaDisplayMode(value);
                                        setFailed(false);
                                    }
                                    catch (error) {
                                        if (!(error instanceof DOMException) || !['SecurityError', 'QuotaExceededError'].includes(error.name))
                                            throw error;
                                        setFailed(true);
                                    }
                                }, children: [_jsx("option", { value: "used", children: t('quotaUsed') }), _jsx("option", { value: "remaining", children: t('quotaRemaining') })] }), _jsx(SelectChevron, {})] })] }), failed && _jsx("p", { role: "alert", style: { ...styles.hint, color: 'var(--dsw-alias-state-error-primary)' }, children: t('usageBadgeDisplaySaveFailed') })] }));
}
const styles = {
    card: {
        border: '0.5px solid var(--dsw-alias-settings-card-stroke, var(--dsw-alias-border-l4))',
        borderRadius: 'var(--dsw-radius-xl, 20px)', background: 'var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-2))',
        padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12,
    },
    field: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500, lineHeight: '20px' },
    labelRow: { display: 'flex', alignItems: 'center', gap: 4 },
    select: { width: '100%' },
    hint: { margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' },
};
