import { getCollection, getEntry, type CollectionKey } from 'astro:content';

export type PageId = 'start' | 'games' | 'projects' | 'community';

export const ROUTES: Record<PageId, string> = {
  start: '/',
  games: '/games',
  projects: '/projects',
  community: '/community',
};

/** Items of a page collection in JSON array order. */
export async function getItems<C extends Exclude<CollectionKey, 'site'>>(collection: C) {
  const entries = await getCollection(collection);
  return entries.sort((a, b) => a.data.order - b.data.order);
}

export async function getSite() {
  const entry = await getEntry('site', 'site');
  if (!entry) throw new Error('src/content/site.json is missing');
  return entry.data;
}

/** Content paths are relative to public/ ("assets/…"); make them root-absolute. */
export const asset = (path: string) => (path.startsWith('/') ? path : `/${path}`);

/** "[URL]"-style placeholders and null hrefs render as disabled buttons. */
export const isPlaceholder = (href: string | null | undefined): href is null | undefined =>
  !href || /^\[.*\]$/.test(href.trim());

export const isExternal = (href: string) => /^https?:\/\//.test(href);

/** Attributes for a link: external links open in a new tab (HANDOFF §10). */
export const linkAttrs = (href: string) =>
  isExternal(href) ? { href, target: '_blank', rel: 'noopener' } : { href };
