import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client';
import type { Translate } from './usage-format.js';
export type SubscriptionsPageTab = 'usage' | 'settings';
/** Injected dependencies of {@link SubscriptionsPage} (slot `main` inject). */
export interface SubscriptionsPageInjected {
    rpc: ConnectionHandle['rpc'];
    t: Translate;
}
export type SubscriptionsPageProps = Partial<SubscriptionsPageInjected> & {
    /** Initial active top tab (defaults to `'usage'`). */
    initialTab?: SubscriptionsPageTab;
};
/**
 * Unified Subscriptions sidebar page with accessible top tabs:
 * - **Usage** (default home): full cross-provider analytics dashboard
 * - **Settings**: OAuth account login, quota limits, account pool & proxy configuration
 */
export declare function SubscriptionsPage(props: SubscriptionsPageProps): import("react").JSX.Element;
