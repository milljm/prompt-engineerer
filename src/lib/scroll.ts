/**
 * Helpers for sticky-bottom live transcripts (Child Live, etc.).
 */

/** Pixels of slack before we treat the view as "left the bottom". */
export const SCROLL_PIN_SLOP = 40;

type ScrollBox = {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
};

/**
 * True when `el` is scrolled within {@link SCROLL_PIN_SLOP} of its bottom.
 *
 * @param el - A scrollable element (or a stand-in for tests).
 * @param slop - Extra pixels still counted as "pinned".
 */
export function isPinnedToBottom(el: ScrollBox, slop = SCROLL_PIN_SLOP): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= slop;
}

/**
 * Jump `el` to its bottom so the latest streamed token stays in view.
 *
 * @param el - A scrollable element.
 */
export function pinToBottom(el: { scrollHeight: number; scrollTop: number }): void {
  el.scrollTop = el.scrollHeight;
}
