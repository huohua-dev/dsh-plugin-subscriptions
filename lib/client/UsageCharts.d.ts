import type { DashboardDailyBucket, DashboardModelSummary, DashboardProviderBreakdown } from '../usage/usage-dashboard.js';
import type { DistributionMode } from './usage-dashboard-state.js';
import { type Translate } from './usage-format.js';
interface Props {
    daily: readonly DashboardDailyBucket[];
    models: readonly DashboardModelSummary[];
    providerBreakdown: readonly DashboardProviderBreakdown[];
    distributionMode: DistributionMode;
    onDistributionMode: (mode: DistributionMode) => void;
    onSelectDate?: (date: string) => void;
    t: Translate;
}
export declare function UsageCharts({ daily, models, providerBreakdown, distributionMode, onDistributionMode, onSelectDate, t, }: Props): import("react").JSX.Element;
export {};
