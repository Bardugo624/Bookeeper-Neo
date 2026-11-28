/**
 * An iPhone (or an iPad that says it is a Mac) in Safari, not opened from the Home Screen:
 * there the browser may clear the saved books after a few days.
 */
export function needsHomeScreen(): boolean {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!ios) return false;
  const standalone =
    (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return !standalone;
}
