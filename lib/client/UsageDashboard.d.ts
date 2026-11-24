import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client';
import { type UsageDashboardAction, type UsageDashboardState } from './usage-dashboard-state.js';
import { type Translate } from './usage-format.js';
/** Injected dependencies of {@link UsageDashboard} (slot `main` inject). */
export interface UsageDashboardInjected {
    rpc: ConnectionHandle['rpc'];
    t: Translate;
}
export type UsageDashboardProps = Partial<UsageDashboardInjected> & {
    /** Omit outer full-viewport scroll container and padding when hosted inside SubscriptionsPage. */
    embedded?: boolean;
    /** Incremented by a parent tab container to trigger a silent background refresh. */
    refreshKey?: number;
};
export interface UsageDashboardViewProps {
    state: UsageDashboardState;
    t: Translate;
    onAction: (action: UsageDashboardAction) => void;
    onOpenClear: () => void;
    embedded?: boolean;
}
/** Presentational dashboard view (pure & SSR-testable without RPC or browser DOM). */
export declare function UsageDashboardView({ state, t, onAction, onOpenClear, embedded }: UsageDashboardViewProps): import("react").JSX.Element;
/** Sidebar plugin home page for Subscription Usage. */
export declare function UsageDashboard(props: UsageDashboardProps): import("react").JSX.Element;
