/**
 * Host-independent placement and dismissal for the usage badge's portaled
 * dialog.
 *
 * The badge used to import `useAnchoredPosition` (and
 * `useDismissOnOutsidePointer`) from `@deepseek-ai/dsh-client-ui-primitives`.
 * DSH 0.2.2-alpha.2 ("CSS-anchored menus" upgrade guide) removed
 * `useAnchoredPosition` from that module. A client bundle reads host modules
 * at runtime, so the named import silently became `undefined` and calling it
 * threw on EVERY render of the badge: the slot entry crashed, the framework
 * retired it, and the pill vanished from under the composer with no visible
 * error. The two small behaviours the badge needs live here instead, so a host
 * that reshuffles its primitives can no longer take the pill down (the host
 * icon glyphs stay a by-name lookup in `host-icons.ts`, which degrades to
 * nothing rather than crashing).
 *
 * The placement math is the removed hook's, kept as a pure function so it can
 * be tested without a DOM: anchor the panel above or below a trigger, align it
 * to one trigger edge, and clamp it inside the viewport.
 */
import { useEffect, useLayoutEffect, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'

/** Viewport-relative box of the trigger, as `getBoundingClientRect()` reports it. */
export interface AnchorRect {
  left: number
  right: number
  top: number
  bottom: number
}

/** Everything {@link placePanel} needs; all lengths are CSS pixels. */
export interface PanelPlacement {
  /** The trigger the panel hangs from. */
  anchor: AnchorRect
  /** Measured panel size; a zero side means "not laid out yet" and skips that clamp. */
  panel: { width: number; height: number }
  /** Layout viewport size. */
  viewport: { width: number; height: number }
  /** Which trigger edge the panel hangs from: below it (`bottom`) or above it (`top`). */
  side: 'top' | 'bottom'
  /** Which trigger edge the panel lines up with: its left edge (`start`) or its right edge (`end`). */
  align: 'start' | 'end'
  /** Distance kept between the trigger edge named by `side` and the panel. */
  gap: number
  /** Distance kept between the panel and the left, right and bottom viewport edges. */
  margin: number
  /** Distance kept from the top viewport edge; the desktop frame widens it past `margin`. */
  topMargin: number
}

/** Fixed coordinates for the panel. */
export interface PanelPosition {
  left: number
  top: number
}

/**
 * Place a panel against its trigger and keep it inside the viewport.
 * @param input - trigger box, measured panel size, viewport, side/alignment and distances.
 * @returns fixed `left`/`top` for the panel.
 */
export function placePanel(input: PanelPlacement): PanelPosition {
  const { anchor, panel, viewport, side, align, gap, margin, topMargin } = input
  let left = align === 'end' ? anchor.right - panel.width : anchor.left
  let top = side === 'top' ? anchor.top - gap - panel.height : anchor.bottom + gap
  if (panel.width > 0) left = Math.min(Math.max(left, margin), viewport.width - panel.width - margin)
  if (panel.height > 0) top = Math.min(Math.max(top, topMargin), viewport.height - panel.height - margin)
  return { left, top }
}

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
export function topMarginFor(min: number, clearance: string, fullscreen: boolean): number {
  const reserved = Number.parseFloat(clearance)
  if (Number.isNaN(reserved)) return min
  return Math.max(min, (fullscreen ? 0 : reserved) + 20)
}

/**
 * Read the live top inset from the document root.
 * @param min - the overlay's own viewport margin, used as the floor.
 * @returns the top margin in px.
 */
export function overlayTopMargin(min: number): number {
  const root = document.documentElement
  const clearance = getComputedStyle(root).getPropertyValue('--dsh-frame-top-clearance')
  return topMarginFor(min, clearance, root.hasAttribute('data-fullscreen'))
}

/** Inputs for {@link useAnchoredPanelPosition}. */
export interface AnchoredPanelOptions {
  /** Whether the panel is mounted and should track its trigger. */
  open: boolean
  /** The trigger element the panel is placed from. */
  anchorRef: RefObject<HTMLElement | null>
  /** The portaled panel, measured so the clamp uses its real size. */
  panelRef: RefObject<HTMLElement | null>
  /** Trigger edge the panel hangs from; defaults to below the trigger. */
  side?: 'top' | 'bottom'
  /** Trigger edge the panel lines up with; defaults to its left edge. */
  align?: 'start' | 'end'
  /** Distance kept between the trigger and the panel. */
  gap: number
  /** Distance kept between the panel and each viewport edge. */
  margin: number
}

/**
 * Layout effects warn when React renders on the server; the browser bundle
 * never does, but the markup tests do, and a plain effect is equivalent there
 * because nothing is open yet.
 */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/**
 * Track a trigger and return the fixed coordinates of its panel: measured
 * before paint when the panel opens, then again on scroll (capture phase, so
 * scrollers nested inside the page count), on resize, and whenever the panel
 * or the trigger changes size.
 * @param options - open state, the two refs, placement side/alignment and distances.
 * @returns `left`/`top` for the panel, or `null` until the first measurement.
 */
export function useAnchoredPanelPosition(options: AnchoredPanelOptions): CSSProperties | null {
  const { open, anchorRef, panelRef, side = 'bottom', align = 'start', gap, margin } = options
  const [position, setPosition] = useState<PanelPosition | null>(null)
  useIsomorphicLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }
    const place = (): void => {
      const anchor = anchorRef.current
      if (anchor === null) return
      const panel = panelRef.current
      const next = placePanel({
        anchor: anchor.getBoundingClientRect(),
        panel: { width: panel?.offsetWidth ?? 0, height: panel?.offsetHeight ?? 0 },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        side,
        align,
        gap,
        margin,
        topMargin: overlayTopMargin(margin),
      })
      // Scroll events fire continuously; only a real move re-renders.
      setPosition(previous => previous !== null && previous.left === next.left && previous.top === next.top ? previous : next)
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(place)
      if (panelRef.current !== null) observer.observe(panelRef.current)
      if (anchorRef.current !== null) observer.observe(anchorRef.current)
    }
    return () => {
      observer?.disconnect()
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, anchorRef, panelRef, side, align, gap, margin])
  return position
}

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
export function useDismissOnOutsidePointer(
  root: RefObject<Element | null>,
  open: boolean,
  setOpen: (open: boolean) => void,
  portal?: RefObject<Element | null>,
): void {
  useEffect(() => {
    if (!open) return
    const closeOutside = (event: Event): void => {
      const target = event.target
      if (target instanceof Node && root.current?.contains(target) !== true && portal?.current?.contains(target) !== true) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('click', closeOutside, true)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('click', closeOutside, true)
    }
  }, [root, open, setOpen, portal])
}
