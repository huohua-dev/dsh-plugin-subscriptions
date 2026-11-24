import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useId, useRef } from 'react';
import { formatInstant, providerDisplayName, TRACKED_PROVIDERS } from './usage-format.js';
import { dialogLayout, providerSettingsCss } from './provider-settings-styles.js';
const { border, stack, actions } = dialogLayout;
function summarizeTarget(target, clearInfo) {
    const list = target === 'all'
        ? TRACKED_PROVIDERS.map(p => clearInfo[p.id]).filter((info) => info !== undefined)
        : clearInfo[target] ? [clearInfo[target]] : [];
    let accounts = 0;
    let from;
    let to;
    let earlierHistory = false;
    for (const info of list) {
        accounts += info.accounts;
        if (info.from !== undefined && (from === undefined || info.from < from))
            from = info.from;
        if (info.to !== undefined && (to === undefined || info.to > to))
            to = info.to;
        if (info.earlierHistory)
            earlierHistory = true;
    }
    return {
        accounts,
        ...from === undefined ? {} : { from },
        ...to === undefined ? {} : { to },
        earlierHistory,
    };
}
/**
 * Confirmation modal for clearing stored usage history for one provider or all providers.
 * Opened directly from the Usage Dashboard page (never nested inside another dialog).
 */
export function ClearUsageHistoryDialog({ target, clearInfo, state, t, onTargetChange, onCancel, onConfirm }) {
    const dialog = useRef(null);
    const cancelButton = useRef(null);
    const title = useId();
    const description = useId();
    const clearing = state.phase === 'clearing';
    useEffect(() => {
        const element = dialog.current;
        if (!element)
            return;
        const previous = document.activeElement;
        element.showModal();
        // Ensure initial focus lands on Cancel even though the scope <select> precedes it in DOM order.
        cancelButton.current?.focus();
        return () => {
            element.close();
            if (previous instanceof HTMLElement && previous.isConnected)
                previous.focus();
        };
    }, []);
    const targetName = target === 'all' ? t('usageClearAllProviders') : providerDisplayName(target);
    const stored = summarizeTarget(target, clearInfo);
    const nothing = stored.accounts === 0 && !stored.earlierHistory;
    return (_jsxs("dialog", { className: "dsh-subscription-manager", ref: dialog, "aria-labelledby": title, "aria-describedby": description, onCancel: event => {
            event.preventDefault();
            if (!clearing)
                onCancel();
        }, style: { width: 480, maxWidth: 'calc(100vw - 32px)' }, children: [_jsx("style", { children: providerSettingsCss }), _jsxs("div", { style: { ...stack, padding: 20 }, children: [_jsx("h2", { id: title, style: { margin: 0 }, children: t('usageClearTitle', { provider: targetName }) }), _jsxs("label", { style: { ...stack, gap: 4 }, children: [_jsx("span", { className: "dsh-subscription-label", children: t('usageClearScopeLabel') }), _jsxs("select", { value: target, disabled: clearing, onChange: event => onTargetChange(event.target.value), children: [_jsx("option", { value: "all", children: t('usageClearAllProviders') }), TRACKED_PROVIDERS.map(entry => (_jsx("option", { value: entry.id, children: entry.name }, entry.id)))] })] }), _jsxs("section", { id: description, style: { ...stack, gap: 6 }, children: [_jsx("strong", { children: t('usageClearRemoved') }), _jsxs("ul", { style: { margin: 0, paddingLeft: 20 }, children: [nothing && _jsx("li", { children: t('usageClearNothingStored') }), stored.accounts > 0 && stored.from !== undefined && stored.to !== undefined && (_jsx("li", { children: t('usageClearRemovedWindows', {
                                            count: stored.accounts,
                                            from: formatInstant(stored.from),
                                            to: formatInstant(stored.to),
                                        }) })), stored.earlierHistory && _jsx("li", { children: t('usageClearRemovedEarlier') })] }), _jsx("strong", { children: t('usageClearKept') }), _jsx("p", { className: "dsh-subscription-hint", style: { margin: 0 }, children: t('usageClearKeptList') }), _jsx("p", { style: { margin: 0 }, children: t('usageClearIrreversible') })] }), state.phase === 'failed' && _jsx("p", { role: "alert", children: t('usageClearFailed', { message: state.error ?? '' }) }), _jsxs("footer", { style: { ...actions, justifyContent: 'flex-end', borderTop: border, paddingTop: 12 }, children: [_jsx("button", { ref: cancelButton, type: "button", autoFocus: true, disabled: clearing, onClick: onCancel, children: t('cancel') }), _jsx("button", { type: "button", className: "dsh-subscription-primary", disabled: clearing, onClick: onConfirm, children: clearing ? t('usageClearing') : t('usageClearConfirm') })] })] })] }));
}
