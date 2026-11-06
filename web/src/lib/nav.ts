export interface NavItem {
  href: string;
  label: string;
  /** Longer label for the phone menu, where there is room. */
  menuLabel?: string;
}

/**
 * Main menu (client guide, 2026-11): three stops of the Home page. The other
 * pages (talleres, blog, preguntas frecuentes) are linked from the footer.
 */
export function mainNav(): NavItem[] {
  return [
    { href: '/#hilda', label: 'Sobre mí' },
    { href: '/#test', label: 'Test', menuLabel: 'Test de crianza' },
    { href: '/#gratis', label: 'Ebooks' },
  ];
}

/**
 * Clean route path: "/agenda.html" (build.format "file"), "/agenda/" and
 * "/index.html" become "/agenda" and "/".
 */
export function routePath(pathname: string): string {
  const path = pathname
    .replace(/\.html$/, '')
    .replace(/\/index$/, '')
    .replace(/\/+$/, '');
  return path || '/';
}

export function isCurrent(pathname: string, href: string): boolean {
  const path = routePath(pathname);
  if (href === '/') return path === '/';
  return path === href || path.startsWith(`${href}/`);
}

/** Wraps the first occurrence of `accent` in the title with the italic accent style. */
export function splitAccent(title: string, accent?: string): [string, string, string] {
  if (!accent) return [title, '', ''];
  const index = title.indexOf(accent);
  if (index < 0) return [title, '', ''];
  return [title.slice(0, index), accent, title.slice(index + accent.length)];
}
