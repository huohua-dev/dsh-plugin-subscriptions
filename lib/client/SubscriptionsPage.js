import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useId, useRef, useState } from 'react';
import { en } from './locales.js';
import { SubscriptionNavIcon } from './SubscriptionNavIcon.js';
import { SubscriptionsSection } from './SubscriptionsSection.js';
import { UsageDashboard } from './UsageDashboard.js';
import { UsageNavIcon } from './UsageNavIcon.js';
import { usageDashboardCss } from './usage-dashboard-styles.js';
const TABS = ['usage', 'settings'];
function fallbackTranslate(key, params) {
    let text = en[key];
    for (const [name, value] of Object.entries(params ?? {})) {
        text = text.replaceAll(`{${name}}`, String(value));
    }
    return text;
}
function SettingsTabIcon({ size }) {
    return (_jsxs("svg", { "aria-hidden": "true", width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("line", { x1: "4", y1: "7", x2: "20", y2: "7" }), _jsx("circle", { cx: "9", cy: "7", r: "2.2", fill: "var(--dsw-alias-bg-base, currentColor)" }), _jsx("line", { x1: "4", y1: "17", x2: "20", y2: "17" }), _jsx("circle", { cx: "15", cy: "17", r: "2.2", fill: "var(--dsw-alias-bg-base, currentColor)" })] }));
}
/**
 * Unified Subscriptions sidebar page with accessible top tabs:
 * - **Usage** (default home): full cross-provider analytics dashboard
 * - **Settings**: OAuth account login, quota limits, account pool & proxy configuration
 */
export function SubscriptionsPage(props) {
    const { rpc, initialTab = 'usage' } = props;
    const t = props.t ?? fallbackTranslate;
    const [activeTab, setActiveTab] = useState(initialTab);
    const [visitedSettings, setVisitedSettings] = useState(initialTab === 'settings');
    const [usageRefreshKey, setUsageRefreshKey] = useState(0);
    const tabIdPrefix = useId();
    const tabRefs = useRef({});
    const selectTab = (next) => {
        if (next === activeTab)
            return;
        if (next === 'settings') {
            setVisitedSettings(true);
        }
        else if (activeTab === 'settings') {
            // Silently refresh usage when returning from Settings in case accounts changed.
            setUsageRefreshKey(k => k + 1);
        }
        setActiveTab(next);
    };
    const handleTabKeyDown = (event, current) => {
        const idx = TABS.indexOf(current);
        let nextIdx;
        if (event.key === 'ArrowRight')
            nextIdx = (idx + 1) % TABS.length;
        else if (event.key === 'ArrowLeft')
            nextIdx = (idx - 1 + TABS.length) % TABS.length;
        else if (event.key === 'Home')
            nextIdx = 0;
        else if (event.key === 'End')
            nextIdx = TABS.length - 1;
        if (nextIdx === undefined)
            return;
        event.preventDefault();
        const nextTab = TABS[nextIdx];
        selectTab(nextTab);
        tabRefs.current[nextTab]?.focus();
    };
    return (_jsxs("div", { className: "dsh-subscriptions-page", children: [_jsx("style", { children: usageDashboardCss }), _jsxs("div", { className: "dsh-subscriptions-page-inner", children: [_jsxs("header", { className: "dsh-subscriptions-page-topbar", children: [_jsxs("div", { className: "dsh-subscriptions-page-brand", children: [_jsx(SubscriptionNavIcon, { size: 18, active: true }), _jsx("span", { children: t('nav') })] }), _jsxs("div", { className: "dsh-subscriptions-page-tabs", role: "tablist", "aria-label": t('nav'), children: [_jsxs("button", { ref: el => { tabRefs.current.usage = el; }, type: "button", role: "tab", id: `${tabIdPrefix}-tab-usage`, "aria-selected": activeTab === 'usage', "aria-controls": `${tabIdPrefix}-panel-usage`, tabIndex: activeTab === 'usage' ? 0 : -1, className: "dsh-subscriptions-page-tab", onClick: () => selectTab('usage'), onKeyDown: event => handleTabKeyDown(event, 'usage'), children: [_jsx(UsageNavIcon, { size: 15, active: activeTab === 'usage' }), _jsx("span", { children: t('usageNav') })] }), _jsxs("button", { ref: el => { tabRefs.current.settings = el; }, type: "button", role: "tab", id: `${tabIdPrefix}-tab-settings`, "aria-selected": activeTab === 'settings', "aria-controls": `${tabIdPrefix}-panel-settings`, tabIndex: activeTab === 'settings' ? 0 : -1, className: "dsh-subscriptions-page-tab", onClick: () => selectTab('settings'), onKeyDown: event => handleTabKeyDown(event, 'settings'), children: [_jsx(SettingsTabIcon, { size: 15 }), _jsx("span", { children: t('usageTabSettings') })] })] })] }), _jsx("div", { role: "tabpanel", id: `${tabIdPrefix}-panel-usage`, "aria-labelledby": `${tabIdPrefix}-tab-usage`, hidden: activeTab !== 'usage', className: "dsh-subscriptions-page-panel", children: _jsx(UsageDashboard, { ...rpc === undefined ? {} : { rpc }, t: t, embedded: true, refreshKey: usageRefreshKey }) }), visitedSettings && (_jsx("div", { role: "tabpanel", id: `${tabIdPrefix}-panel-settings`, "aria-labelledby": `${tabIdPrefix}-tab-settings`, hidden: activeTab !== 'settings', className: "dsh-subscriptions-page-panel", children: _jsx(SubscriptionsSection, { ...rpc === undefined ? {} : { rpc }, t: t, hideUsageHint: true, embedded: true }) }))] })] }));
}
