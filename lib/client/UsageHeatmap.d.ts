import type { DashboardDailyBucket } from '../usage/usage-dashboard.js';
import { type Translate } from './usage-format.js';
interface Props {
    days: readonly DashboardDailyBucket[];
    selectedDate?: string;
    onSelectDate: (date?: string) => void;
    t: Translate;
}
export declare function UsageHeatmap({ days, selectedDate, onSelectDate, t }: Props): import("react").JSX.Element;
export {};
