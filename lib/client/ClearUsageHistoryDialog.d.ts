import type { TrackedProvider } from '../usage/usage-schema.js';
import type { DashboardClearInfo } from '../usage/usage-dashboard.js';
import type { ClearConfirmState, ProviderFilter } from './usage-dashboard-state.js';
import { type Translate } from './usage-format.js';
interface Props {
    target: ProviderFilter;
    clearInfo: Readonly<Record<TrackedProvider, DashboardClearInfo>>;
    state: ClearConfirmState;
    t: Translate;
    onTargetChange: (target: ProviderFilter) => void;
    onCancel: () => void;
    onConfirm: () => void;
}
/**
 * Confirmation modal for clearing stored usage history for one provider or all providers.
 * Opened directly from the Usage Dashboard page (never nested inside another dialog).
 */
export declare function ClearUsageHistoryDialog({ target, clearInfo, state, t, onTargetChange, onCancel, onConfirm }: Props): import("react").JSX.Element;
export {};
