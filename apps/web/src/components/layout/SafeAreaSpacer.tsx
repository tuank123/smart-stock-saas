/**
 * Fixed, non-interactive strip that always covers the iOS status-bar / notch
 * area with the page background.
 *
 * We can't rely on `body { padding-top: env(safe-area-inset-top) }` because
 * Radix Dialog's scroll-lock rewrites inline styles on <body> while a
 * dialog/sheet is open, which drops that padding and lets headers slide under
 * the status bar. A fixed element is immune to that.
 *
 * It only paints the strip — each scroll container adds its own
 * `pt-[env(safe-area-inset-top)]` so real content starts below the strip.
 */
export function SafeAreaSpacer() {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] bg-background"
      style={{ height: 'env(safe-area-inset-top)' }}
    />
  );
}
