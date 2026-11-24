/**
 * The controller behind the `usageDashboard`, `accountUsage` and
 * `clearUsageHistory` endpoints. `src/auth/rpc.ts` validates the payload shape
 * and the provider; this module resolves accounts, aggregates dashboard data,
 * checks the kind and scope against what the provider reports, and calls the
 * usage service. It lives here rather than in `index.ts` so it can be tested
 * without a cordis boot; `index.ts` only supplies the account list.
 */
import { type TrackedProvider } from './constants.js';
import type { ClearResult, ProviderUsageSnapshot, StoredSummary, UsageService } from './service.js';
import { DASHBOARD_RANGES, type DashboardActiveWindow, type DashboardActiveWindowModel, type DashboardClearInfo, type DashboardCycleModel, type DashboardDailyBucket, type DashboardDailyModelEntry, type DashboardModelSummary, type DashboardProviderAccount, type DashboardProviderBreakdown, type DashboardProviderInfo, type DashboardQuotaCycle, type DashboardRange, type DashboardSummary, type TokenTotals, type UsageDashboardPayload, type UsageDashboardResponse } from './usage-dashboard.js';
import { type UsageView, type ViewKind } from './window-view.js';
export { DASHBOARD_RANGES, type DashboardActiveWindow, type DashboardActiveWindowModel, type DashboardClearInfo, type DashboardCycleModel, type DashboardDailyBucket, type DashboardDailyModelEntry, type DashboardModelSummary, type DashboardProviderAccount, type DashboardProviderBreakdown, type DashboardProviderInfo, type DashboardQuotaCycle, type DashboardRange, type DashboardSummary, type TokenTotals, type UsageDashboardPayload, type UsageDashboardResponse, };
/** One account the dialog can switch to. */
export interface UsageAccount {
    key: string;
    /** Display identity (email or login) of a logged-in account; a removed account shows its key. */
    label?: string;
    /** False: history only, read-only, no live quota. */
    loggedIn: boolean;
    isDefault: boolean;
}
/** A logged-in account as the auth store lists it, default first. */
export interface LoggedInAccount {
    key: string;
    label?: string;
}
export interface AccountUsagePayload {
    provider: TrackedProvider;
    account?: string;
    kind?: ViewKind;
    scope?: string;
    at?: number;
}
export interface AccountUsageResponse {
    provider: TrackedProvider;
    /** Absent when the provider has no logged-in account and no stored history. */
    account?: string;
    /** Logged-in accounts in the card's order (default first), then accounts with stored history only. */
    accounts: UsageAccount[];
    view: UsageView;
    /** The provider's stored history, for the clear confirmation. */
    stored: StoredSummary;
    errors: string[];
}
export interface UsageHistoryController {
    usageDashboard(payload: UsageDashboardPayload): Promise<UsageDashboardResponse>;
    accountUsage(payload: AccountUsagePayload): Promise<AccountUsageResponse>;
    clearUsageHistory(provider: TrackedProvider | 'all'): Promise<ClearResult>;
}
/** A payload naming a kind or scope the provider does not report. */
export declare class UsageQueryRejected extends Error {
}
type UsageServiceFace = Pick<UsageService, 'read' | 'accounts' | 'summary' | 'clear'> & {
    snapshot?: (provider: TrackedProvider) => Promise<ProviderUsageSnapshot>;
};
/**
 * @param service - the usage reader.
 * @param loggedInAccounts - the provider's logged-in accounts, default first; a store read, no token refresh.
 * @param now - optional clock override for deterministic dashboard tests.
 */
export declare function createUsageHistoryController(service: UsageServiceFace, loggedInAccounts: (provider: TrackedProvider) => Promise<LoggedInAccount[]>, now?: () => number): UsageHistoryController;
