import type { CSSProperties, RefObject } from 'react';
/** Viewport-relative box of the trigger, as `getBoundingClientRect()` reports it. */
export interface AnchorRect {
    left: number;
    right: number;
    top: number;
    bottom: number;
}
/** Everything {@link placePanel} needs; all lengths are CSS pixels. */
export interface PanelPlacement {
    /** The trigger the panel hangs from. */
    anchor: AnchorRect;
    /** Measured panel size; a zero side means "not laid out yet" and skips that clamp. */
    panel: {
        width: number;
        height: number;
    };
    /** Layout viewport size. */
    viewport: {
        width: number;
        height: number;
    };
    /** Which trigger edge the panel hangs from: below it (`bottom`) or above it (`top`). */
    side: 'top' | 'bottom';
    /** Which trigger edge the panel lines up with: its left edge (`start`) or its right edge (`end`). */
    align: 'start' | 'end';
    /** Distance kept between the trigger edge named by `side` and the panel. */
    gap: number;
    /** Distance kept between the panel and the left, right and bottom viewport edges. */
    margin: number;
    /** Distance kept from the top viewport edge; the desktop frame widens it past `margin`. */
    topMargin: number;
}
/** Fixed coordinates for the panel. */
export interface PanelPosition {
    left: number;
    top: number;
}
/**
 * Place a panel against its trigger and keep it inside the viewport.
 * @param input - trigger box, measured panel size, viewport, side/alignment and distances.
 * @returns fixed `left`/`top` for the panel.
 */
export declare function placePanel(input: PanelPlacement): PanelPosition;
/**
 * Top inset an overlay keeps from the viewport edge. The desktop frame reserves
 * a strip at the top (traffic lights / caption) and publishes its height as
 * `--dsh-frame-top-clearance`; overlays stay 20px below it, or 20px from the
 * edge in native fullscreen. Without a published clearance (plain browser) only
 * the overlay's own margin applies.
 * @param min - the overlay's own viewport margin, used as the floor.
 * @param clearance - the raw `--dsh-frame-top-clearance` value (`'48px'`, `''` when unset).
 * @param fullscreen - whether the frame reports native fullscreen (`data-fullscreen` on the root).
 * @returns the top margin in px.
 */
export declare function topMarginFor(min: number, clearance: string, fullscreen: boolean): number;
/**
 * Read the live top inset from the document root.
 * @param min - the overlay's own viewport margin, used as the floor.
 * @returns the top margin in px.
 */
export declare function overlayTopMargin(min: number): number;
/** Inputs for {@link useAnchoredPanelPosition}. */
export interface AnchoredPanelOptions {
    /** Whether the panel is mounted and should track its trigger. */
    open: boolean;
    /** The trigger element the panel is placed from. */
    anchorRef: RefObject<HTMLElement | null>;
    /** The portaled panel, measured so the clamp uses its real size. */
    panelRef: RefObject<HTMLElement | null>;
    /** Trigger edge the panel hangs from; defaults to below the trigger. */
    side?: 'top' | 'bottom';
    /** Trigger edge the panel lines up with; defaults to its left edge. */
    align?: 'start' | 'end';
    /** Distance kept between the trigger and the panel. */
    gap: number;
    /** Distance kept between the panel and each viewport edge. */
    margin: number;
}
/**
 * Track a trigger and return the fixed coordinates of its panel: measured
 * before paint when the panel opens, then again on scroll (capture phase, so
 * scrollers nested inside the page count), on resize, and whenever the panel
 * or the trigger changes size.
 * @param options - open state, the two refs, placement side/alignment and distances.
 * @returns `left`/`top` for the panel, or `null` until the first measurement.
 */
export declare function useAnchoredPanelPosition(options: AnchoredPanelOptions): CSSProperties | null;
/**
 * Close an open popover when the pointer goes down outside it. The portaled
 * panel counts as inside, and so does the trigger root. A click outside closes
 * too, in the capture phase: keyboard activation of a sibling control fires
 * `click` without `pointerdown`, and the sibling's own dialog must not open
 * beside this one (the host's stat pills close each other the same way).
 * @param root - element holding the trigger.
 * @param open - whether the surface is showing; false detaches the listeners.
 * @param setOpen - state setter invoked with `false` on an outside interaction.
 * @param portal - the panel portaled outside `root`, if any.
 */
export declare function useDismissOnOutsidePointer(root: RefObject<Element | null>, open: boolean, setOpen: (open: boolean) => void, portal?: RefObject<Element | null>): void;
