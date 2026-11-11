/**
 * Clickjacking guard. GitHub Pages can't send X-Frame-Options or a frame-ancestors policy (and a
 * <meta> Content-Security-Policy ignores frame-ancestors), so the page checks for itself: inside
 * another site's frame it refuses to start, and only offers a link that opens it on its own.
 */
export function isFramed(w: { top: unknown; self: unknown }): boolean {
  try {
    return w.top !== w.self
  } catch {
    // Some browsers throw when a cross-origin parent is touched; that means we are framed
    return true
  }
}

export function showFramedNotice(root: HTMLElement, href: string) {
  const p = document.createElement('p')
  p.style.cssText = 'font: 16px system-ui, sans-serif; padding: 24px; max-width: 32rem'
  p.textContent = 'Local Ledger only runs in its own tab, not inside another website. '
  const a = document.createElement('a')
  a.href = href
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  a.textContent = 'Open Local Ledger on its own'
  p.append(a)
  root.replaceChildren(p)
}
