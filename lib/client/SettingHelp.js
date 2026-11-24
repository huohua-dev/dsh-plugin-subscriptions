import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
/** A separate button avoids nesting interactive help inside a control label. */
export function SettingHelp({ title, hint, t, portal = true }) {
    return _jsx(Tooltip, { label: hint, side: "bottom", portal: portal, openOnClick: true, maxWidth: 340, children: _jsx("button", { type: "button", className: "dsh-subscription-setting-help", "aria-label": t('settingsHelpLabel', { setting: title }), children: _jsxs("svg", { "aria-hidden": "true", width: "16", height: "16", viewBox: "0 0 16 16", fill: "none", children: [_jsx("circle", { cx: "8", cy: "8", r: "6.25", stroke: "currentColor", strokeWidth: "1.3" }), _jsx("path", { d: "M8 7v4M8 4.75v.1", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round" })] }) }) });
}
