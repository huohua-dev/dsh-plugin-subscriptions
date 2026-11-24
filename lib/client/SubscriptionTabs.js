import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
const EDGE = 44; // Width of the scroll button and its fade, in CSS pixels.
const EPSILON = 1;
function revealDelta(el, tab) {
    const viewport = el.getBoundingClientRect();
    const item = tab.getBoundingClientRect();
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    const overflow = maxScroll > EPSILON;
    if (overflow && !tab.previousElementSibling)
        return -el.scrollLeft;
    if (overflow && !tab.nextElementSibling)
        return maxScroll - el.scrollLeft;
    // Leave space for the controls without changing the scrollable layout.
    const inset = overflow ? Math.min(EDGE + 4, Math.max(4, (viewport.width - item.width) / 2)) : 4;
    const left = item.left - viewport.left - inset;
    const right = item.right - viewport.right + inset;
    const raw = left < -EPSILON ? left : right > EPSILON ? right : 0;
    return Math.max(-el.scrollLeft, Math.min(maxScroll - el.scrollLeft, raw));
}
function Chevron({ direction }) {
    return _jsx("svg", { "aria-hidden": "true", width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: direction === -1 ? 'M10 3.5 5.5 8l4.5 4.5' : 'M6 3.5 10.5 8 6 12.5' }) });
}
/** Automatic-activation horizontal tabs, shared by provider and account settings. */
export function SubscriptionTabs({ tabs, active, onSelect, prefix, label, scrollLeftLabel, scrollRightLabel, tabRefs }) {
    const internalRefs = useRef({});
    const refs = tabRefs ?? internalRefs;
    const list = useRef(null);
    const track = useRef(null);
    const [edges, setEdges] = useState({ left: false, right: false });
    const updateEdges = useCallback(() => {
        const el = list.current;
        if (!el)
            return;
        const left = el.scrollLeft > EPSILON;
        const right = el.scrollWidth - el.clientWidth - el.scrollLeft > EPSILON;
        setEdges(previous => previous.left === left && previous.right === right ? previous : { left, right });
    }, []);
    const activeRef = useRef(active);
    activeRef.current = active;
    const tabOrder = tabs.map(tab => tab.key).join('\0');
    const lastOrderRef = useRef(tabOrder);
    const reveal = useCallback((tab, behavior = 'auto') => {
        const el = list.current;
        if (!el || !tab)
            return;
        const delta = revealDelta(el, tab);
        if (Math.abs(delta) > EPSILON)
            el.scrollBy({ left: delta, behavior });
    }, []);
    useLayoutEffect(() => {
        updateEdges();
        let lastWidth = list.current?.clientWidth ?? 0;
        const observer = new ResizeObserver(() => {
            const width = list.current?.clientWidth ?? 0;
            if (width !== lastWidth) {
                lastWidth = width;
                const tab = activeRef.current === undefined ? undefined : refs.current?.[activeRef.current];
                if (tab)
                    reveal(tab);
            }
            updateEdges();
        });
        if (list.current)
            observer.observe(list.current);
        if (track.current)
            observer.observe(track.current);
        return () => observer.disconnect();
    }, [refs, reveal, updateEdges]);
    useLayoutEffect(() => {
        const orderChanged = lastOrderRef.current !== tabOrder;
        lastOrderRef.current = tabOrder;
        const tab = active === undefined ? undefined : refs.current?.[active];
        if (orderChanged || tab !== document.activeElement)
            reveal(tab);
    }, [active, tabOrder, refs, reveal]);
    const scrollTab = (direction) => {
        const el = list.current;
        if (!el || !track.current)
            return;
        const viewport = el.getBoundingClientRect();
        const buttons = Array.from(track.current.children);
        const ordered = direction === 1 ? buttons : buttons.reverse();
        // Pick the first tab overflowing in `direction` that actually advances scrollLeft,
        // avoiding a deadlock when a wide tab sits closer than EDGE after reveal().
        const next = ordered.find(tab => {
            const rect = tab.getBoundingClientRect();
            const overflows = direction === 1
                ? rect.right > viewport.right - EDGE + EPSILON
                : rect.left < viewport.left + EDGE - EPSILON;
            if (!overflows)
                return false;
            const delta = revealDelta(el, tab);
            return direction === 1 ? delta > EPSILON : delta < -EPSILON;
        });
        const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
        if (next)
            reveal(next, behavior);
        else
            el.scrollTo({ left: direction === 1 ? el.scrollWidth - el.clientWidth : 0, behavior });
    };
    return _jsxs("div", { className: "dsh-subscription-tabs-shell", "data-left": edges.left || undefined, "data-right": edges.right || undefined, children: [_jsx("button", { type: "button", className: "dsh-subscription-tabs-arrow dsh-subscription-tabs-arrow-left", "aria-label": scrollLeftLabel, disabled: !edges.left, onClick: () => scrollTab(-1), children: _jsx(Chevron, { direction: -1 }) }), _jsx("div", { className: "dsh-subscription-tabs", ref: list, role: "tablist", "aria-label": label, onScroll: updateEdges, children: _jsx("div", { className: "dsh-subscription-tabs-track", role: "presentation", ref: track, children: tabs.map((tab, index) => _jsx("button", { type: "button", role: "tab", "data-subscription-provider": tab.provider, id: prefix + '-tab-' + tab.id, ref: node => { if (node)
                            refs.current[tab.key] = node;
                        else
                            delete refs.current[tab.key]; }, "aria-controls": prefix + '-panel-' + tab.id, "aria-selected": active === tab.key, "aria-label": tab.ariaLabel, tabIndex: active === tab.key ? 0 : -1, onFocus: event => {
                            onSelect(tab.key);
                            reveal(event.currentTarget, event.currentTarget.matches(':focus-visible') && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto');
                        }, onClick: () => onSelect(tab.key), onKeyDown: event => {
                            let next = index;
                            if (event.key === 'ArrowRight')
                                next = (index + 1) % tabs.length;
                            else if (event.key === 'ArrowLeft')
                                next = (index + tabs.length - 1) % tabs.length;
                            else if (event.key === 'Home')
                                next = 0;
                            else if (event.key === 'End')
                                next = tabs.length - 1;
                            else
                                return;
                            event.preventDefault();
                            refs.current?.[tabs[next].key]?.focus({ preventScroll: true });
                        }, children: tab.content ?? tab.label }, tab.key)) }) }), _jsx("button", { type: "button", className: "dsh-subscription-tabs-arrow dsh-subscription-tabs-arrow-right", "aria-label": scrollRightLabel, disabled: !edges.right, onClick: () => scrollTab(1), children: _jsx(Chevron, { direction: 1 }) })] });
}
