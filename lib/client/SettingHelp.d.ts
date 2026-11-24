import type { SubscriptionsKey } from './locales.js';
type Translate = (key: SubscriptionsKey, params?: Record<string, unknown>) => string;
/** A separate button avoids nesting interactive help inside a control label. */
export declare function SettingHelp({ title, hint, t, portal }: {
    title: string;
    hint: string;
    t: Translate;
    portal?: boolean;
}): import("react").JSX.Element;
export {};
