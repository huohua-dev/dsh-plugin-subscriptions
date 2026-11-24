import type { TrackedProvider } from '../usage/usage-schema.js';
import type { DashboardRange, UsageDashboardResponse } from '../usage/usage-dashboard.js';
export type ProviderFilter = TrackedProvider | 'all';
export type DistributionMode = 'model' | 'provider';
export interface UsageDashboardRequest {
    provider: ProviderFilter;
    account: string | 'all';
    range: DashboardRange;
}
export interface UsageDashboardState {
    phase: 'loading' | 'shown' | 'error';
    request: UsageDashboardRequest;
    distributionMode: DistributionMode;
    selectedDate?: string;
    /** Incremented whenever a fresh RPC fetch is required. */
    load: number;
    /** Last successful dashboard response (retained during subsequent loads so UI stays stable). */
    response?: UsageDashboardResponse;
    error?: string;
    clearErrors: string[];
}
export type UsageDashboardAction = {
    type: 'loaded';
    response: UsageDashboardResponse;
} | {
    type: 'failed';
    message: string;
} | {
    type: 'provider';
    provider: ProviderFilter;
} | {
    type: 'account';
    account: string | 'all';
} | {
    type: 'providerAccount';
    provider: TrackedProvider;
    account: string;
} | {
    type: 'range';
    range: DashboardRange;
} | {
    type: 'resetFilters';
} | {
    type: 'distribution';
    mode: DistributionMode;
} | {
    type: 'selectDate';
    date?: string;
} | {
    type: 'refresh';
} | {
    type: 'retry';
} | {
    type: 'cleared';
    clearErrors: string[];
};
export declare function initialUsageDashboardState(): UsageDashboardState;
export declare function usageDashboardReducer(state: UsageDashboardState, action: UsageDashboardAction): UsageDashboardState;
export interface ClearConfirmState {
    phase: 'open' | 'clearing' | 'failed';
    error?: string;
}
export type ClearConfirmAction = {
    type: 'confirm';
} | {
    type: 'failed';
    message: string;
};
export declare const CLEAR_CONFIRM_OPEN: ClearConfirmState;
/** Cancel and success close the confirmation, so they are the caller's, not states here. */
export declare function clearConfirmReducer(state: ClearConfirmState, action: ClearConfirmAction): ClearConfirmState;
