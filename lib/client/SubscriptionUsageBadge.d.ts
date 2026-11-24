import type { ComponentType } from 'react';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client';
import type { AccountStatus, ProviderStatus, ProviderUsage, SubscriptionProvider, UsageWindow } from './SubscriptionsSection.js';
import type { ModelDirectoriesLike } from './SpeedSelect.js';
import type { SubscriptionsKey } from './locales.js';
import { type QuotaDisplayMode } from './usage-badge-preferences.js';
/** DSH renamed the data icon in 0.1.7; retain older supported hosts too. */
export declare function usageBadgeIcon(icons: {
    IconDataOutlineRegular?: ComponentType;
    IconDataOutline16?: ComponentType;
}): ComponentType;
/** Injected dependencies (slot `inject`, session-bound). */
export interface SubscriptionUsageBadgeInjected {
    /** Connection RPC caller to reach the `subscriptions-auth` endpoints. */
    rpc: ConnectionHandle['rpc'];
    /** Resolve the session's effective provider and model together. */
    currentModel: () => Promise<{
        provider: string;
        model: string;
    } | undefined>;
}
/** Props delivered by the slot outlet + inject + the locale seat. */
export type SubscriptionUsageBadgeProps = PropsRuntime<'conversation.composer.dock'> & Partial<SubscriptionUsageBadgeInjected> & Partial<PropsLocale<'settings.subscriptions'>>;
/** One logged-in account's usage windows, as listed in the expanded dialog. */
export interface AccountUsageDisplay {
    /** Account key (the `usage` endpoint's `account` argument). */
    key: string;
    /** Display handle (email / login), when the provider reports one. */
    account?: string;
    plan?: string;
    /** Configured default, not evidence of which account served a request. */
    isDefault: boolean;
    windows: UsageWindow[];
    usage?: ProviderUsage;
    loadFailed?: boolean;
}
/** Every signed-in account, including those with unknown quota. */
export interface ProviderUsageDisplay {
    provider: SubscriptionProvider;
    name: string;
    /** Default account first, then the rest in the `status` endpoint's order. */
    accounts: AccountUsageDisplay[];
}
export declare function CodexExhaustionNotice({ display, translate }: {
    display: ProviderUsageDisplay;
    translate: (key: SubscriptionsKey) => string;
}): import("react").JSX.Element | null;
/** The account the collapsed pill reads: the default one, else the first listed. */
export declare function pillAccountOf(d: ProviderUsageDisplay): AccountUsageDisplay;
/** Connected accounts eligible for composer badge polling (skips disabled providers). */
export declare function enabledBadgeRoster(providers: Partial<Record<SubscriptionProvider, ProviderStatus>>): {
    provider: SubscriptionProvider;
    account: AccountStatus;
}[];
/**
 * The `currentModel` half of the inject face: the session's effective
 * model selection through ui-model-selection's `modelDirectories` service,
 * resolved lazily per call (the service may register after this plugin, and
 * a shell without it reports "unknown"; an unknown model keeps whatever
 * subscription this view already showed, while a model that is known and is
 * not a subscription hides the badge).
 */
export declare function createCurrentModelReader(models: () => ModelDirectoriesLike | undefined, sessionId: string): SubscriptionUsageBadgeInjected['currentModel'];
/**
 * Compact time-remaining label derived from the window's `resetsAt` timestamp:
 * "6d 18h" (days+hours), "1h 58m" (hours+minutes), or "42m" (minutes only).
 * Falls back to the scope/kind abbreviation when no reset time is known.
 */
export declare function windowLabel(w: UsageWindow): string;
/** Keep model quotas separate: matching percentages do not imply a shared pool. */
export declare function prioritizeWindows(windows: readonly UsageWindow[], model?: string, provider?: SubscriptionProvider): UsageWindow[];
/** Small previews keep a live model catalog from taking over the dialog. */
export declare const WINDOW_PREVIEW_LIMIT = 4;
export declare function previewWindows(windows: readonly UsageWindow[], model?: string, provider?: SubscriptionProvider): {
    shown: UsageWindow[];
    hidden: UsageWindow[];
};
/**
 * Bounded readout; Antigravity quotas belong to individual models, not the
 * account. The composer stats row is narrow, so the pill carries only the
 * provider name and at most two percentages ("Gemini · 13% used / 15% used"):
 * the default/listed source, the window labels, the freshness note and the
 * remaining windows are all one click away in the dialog.
 */
export declare function compactSegment(d: ProviderUsageDisplay, model?: string, t?: Translate, mode?: QuotaDisplayMode): string;
type ModelSelection = {
    provider: string;
    model: string;
};
/**
 * Remember the most recent subscription in this view, including its model
 * scope, and drop it as soon as the session settles on a provider that is not
 * a subscription: a pill naming a provider the session stopped using is noise,
 * not history. An unknown current model (the shell may not report one yet)
 * keeps the last known selection so the pill does not flicker between polls.
 */
export declare function retainSubscriptionSelection(previous: ModelSelection | undefined, current: ModelSelection | undefined): ModelSelection | undefined;
/** At most one provider; no known selection or no usage means no badge. */
export declare function collapsedDisplays(displays: readonly ProviderUsageDisplay[], current: string | undefined): readonly ProviderUsageDisplay[];
/** Order for the expanded dialog: the current provider first, the rest in poll order. */
export declare function expandedDisplays(displays: readonly ProviderUsageDisplay[], current: string | undefined): readonly ProviderUsageDisplay[];
type Translate = (key: SubscriptionsKey, params?: Record<string, unknown>) => string;
/**
 * The composer subscription-usage badge: a pill reading e.g. `Codex · 13% used / 25% used`
 * for the current model's provider, opening a dialog with every provider's
 * accounts and their windows, including unavailable telemetry.
 */
export declare function SubscriptionUsageBadge({ rpc, currentModel, t }: SubscriptionUsageBadgeProps): import("react").JSX.Element;
/** Preview each account independently; remaining visible quotas stay accessible. */
export declare function AccountWindows({ windows, model, provider, translate, mode }: {
    windows: readonly UsageWindow[];
    model: string | undefined;
    provider?: SubscriptionProvider;
    translate: Translate;
    mode?: QuotaDisplayMode | undefined;
}): import("react").JSX.Element;
export {};
