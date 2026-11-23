import { getCollection, getEntry, type CollectionKey } from 'astro:content';

export type PageId = 'start' | 'games' | 'projects' | 'community';

/** The live site's address (share previews and canonical URLs must be absolute). */
export const SITE_URL = 'https://www.raydentec.com';
/** Share preview image (Open Graph / X), 1200×630, in public/: Shell.astro, pages/links.astro. */
export const SHARE_IMAGE = {
  path: '/og-image.png',
  width: 1200,
  height: 630,
  alt: 'RAYDENTEC logo beside the name RAYDEN and the tagline Creator of Virtual Worlds, on black with a blue lightning strike',
};

export const ROUTES: Record<PageId, string> = {
  start: '/',
  games: '/games',
  projects: '/projects',
  community: '/community',
};

/** Items of a page collection in JSON array order. */
export async function getItems<C extends Exclude<CollectionKey, 'site' | 'start' | 'legal'>>(collection: C) {
  const entries = await getCollection(collection);
  return entries.sort((a, b) => a.data.order - b.data.order);
}

export async function getSite() {
  const entry = await getEntry('site', 'site');
  if (!entry) throw new Error('src/content/site.json is missing');
  return entry.data;
}

export async function getStart() {
  const entry = await getEntry('start', 'start');
  if (!entry) throw new Error('src/content/start.json is missing');
  return entry.data;
}

/** Sort comparator: newest release date first (dates are YYYY-MM-DD, so they sort as text). */
export const newestFirst = (a: { releaseDate: string }, b: { releaseDate: string }) =>
  b.releaseDate.localeCompare(a.releaseDate);

/** Content paths are relative to public/ ("assets/…"); make them root-absolute. */
export const asset = (path: string) => (path.startsWith('/') ? path : `/${path}`);

/** "[URL]"-style placeholders and null hrefs render as disabled buttons. */
export const isPlaceholder = (href: string | null | undefined): href is null | undefined =>
  !href || /^\[.*\]$/.test(href.trim());

export const isExternal = (href: string) => /^https?:\/\//.test(href);

/** Attributes for a link: external links open in a new tab (HANDOFF §10). */
export const linkAttrs = (href: string) =>
  isExternal(href) ? { href, target: '_blank', rel: 'noopener' } : { href };
