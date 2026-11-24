import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ProviderActionIcon } from './ProviderActionIcon.js';
export function ProviderRefreshButton({ label, disabled, onClick }) {
    return _jsxs("button", { type: "button", className: "dsh-subscription-quiet", style: { gap: 6, marginLeft: 'auto' }, disabled: disabled, onClick: onClick, children: [_jsx(ProviderActionIcon, { icon: "refresh" }), label] });
}
