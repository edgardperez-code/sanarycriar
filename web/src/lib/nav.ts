export interface NavItem {
  href: string;
  label: string;
}

export function mainNav(options: { hasPosts: boolean }): NavItem[] {
  const items: NavItem[] = [
    { href: '/sobre-mi', label: 'Sobre mí' },
    { href: '/agenda', label: 'Consultas' },
    { href: '/cursos', label: 'Cursos y ebooks' },
    { href: '/talleres', label: 'Talleres' },
    { href: '/test-de-crianza', label: 'Test de crianza' },
  ];
  if (options.hasPosts) items.push({ href: '/blog', label: 'Blog' });
  return items;
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
