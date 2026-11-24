import type { ReactNode, RefObject } from 'react';
export interface SubscriptionTab<T extends string> {
    key: T;
    /** Stable, DOM-safe suffix shared with the corresponding panel. */
    id: string;
    label: string;
    ariaLabel?: string;
    content?: ReactNode;
    provider?: string;
}
/** Automatic-activation horizontal tabs, shared by provider and account settings. */
export declare function SubscriptionTabs<T extends string>({ tabs, active, onSelect, prefix, label, scrollLeftLabel, scrollRightLabel, tabRefs }: {
    tabs: readonly SubscriptionTab<T>[];
    active: T | undefined;
    onSelect: (key: T) => void;
    prefix: string;
    label: string;
    scrollLeftLabel: string;
    scrollRightLabel: string;
    tabRefs?: RefObject<Partial<Record<T, HTMLButtonElement>>>;
}): import("react").JSX.Element;
