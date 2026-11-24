import type { DashboardActiveWindow } from '../usage/usage-dashboard.js';
import { type Translate } from './usage-format.js';
export type CycleKindFilter = 'all' | '5h' | 'weekly';
interface Props {
    windows: readonly DashboardActiveWindow[];
    now?: number;
    initialKind?: CycleKindFilter;
    initialSelectedId?: string;
    t: Translate;
}
/**
 * Pure-SVG Dual-Axis Combo Chart for Quota Cycles:
 * - Left Y-axis + rounded bars: Cycle Token Usage (`totalTokens`), colored by provider
 * - Right Y-axis (0–100%) + line & semantic dots: Quota Utilization % (`quotaUsedPercent`), breaking cleanly across missing gaps
 * - Top clickable strip for active (`isCurrent`) cycles + click-to-pin inline Cycle Inspector strip below
 */
export declare function ActiveWindowsPanel({ windows, now, initialKind, initialSelectedId, t }: Props): import("react").JSX.Element;
export {};
