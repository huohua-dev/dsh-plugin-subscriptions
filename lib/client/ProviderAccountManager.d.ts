import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client';
import type { SubscriptionProvider } from './SubscriptionsSection.js';
import type { SubscriptionsKey } from './locales.js';
interface Props {
    provider: SubscriptionProvider;
    name: string;
    /** Changes when the connected account set changes while the dialog is open. */
    accountsVersion?: string;
    rpc: ConnectionHandle['rpc'];
    t: (key: SubscriptionsKey, params?: Record<string, unknown>) => string;
    onClose: () => void;
}
/** Native top-layer dialog provides keyboard containment, Escape and focus restoration. */
export declare function ProviderAccountManager({ provider, name, accountsVersion, rpc, t, onClose }: Props): import("react").JSX.Element;
export {};
