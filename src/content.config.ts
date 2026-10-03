import { defineCollection } from 'astro:content';
import { file } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * Each handoff JSON file is `{ page, items: [...] }`. The file() loader needs
 * one entry per item with a unique id, so the parser unwraps `items` and adds
 * `order` (array index) — container numbers are `order + 1`.
 */
const itemsParser = (text: string) =>
  (JSON.parse(text) as { items: Record<string, unknown>[] }).items.map((item, order) => ({
    id: String(order + 1).padStart(2, '0'),
    order,
    ...item,
  }));

/** Asset paths are relative to the public folder, e.g. "assets/placeholder-render.jpg". */
const assetPath = z.string().regex(/^assets\//, 'must start with "assets/"');
/** Real URL, site route, mailto — or a "[PLACEHOLDER]" that renders as a disabled button. */
const href = z.string().min(1);

const site = defineCollection({
  loader: file('src/content/site.json', {
    parser: (text) => [{ id: 'site', ...(JSON.parse(text) as Record<string, unknown>) }],
  }),
  schema: z.object({
    name: z.string(),
    handle: z.string(),
    tagline: z.string(),
    bio: z.string(),
    joinPrompt: z.string(),
    ctas: z
      .array(z.object({ label: z.string(), href, variant: z.enum(['primary', 'secondary']) }))
      .length(2),
    sidebarSocials: z.array(z.object({ icon: z.string(), label: z.string(), href })),
    pages: z.array(z.object({ id: z.enum(['start', 'games', 'projects', 'community']), label: z.string() })),
    footer: z.object({ copyright: z.string(), legalLabel: z.string(), legalHref: href }),
  }),
});

const action = z.object({ label: z.string(), href, variant: z.enum(['primary', 'secondary']) });

const start = defineCollection({
  loader: file('src/content/start.json', { parser: itemsParser }),
  schema: z.discriminatedUnion('type', [
    z.object({
      order: z.number(),
      type: z.literal('intro'),
      eyebrow: z.string(),
      title: z.string(),
      description: z.string(),
      media: assetPath,
      mediaNote: z.string().optional(),
      actions: z.array(action),
    }),
    z.object({
      order: z.number(),
      type: z.literal('explore'),
      eyebrow: z.string(),
      title: z.string(),
      columns: z.array(
        z.object({
          icon: z.string(),
          title: z.string(),
          description: z.string(),
          href,
          linkLabel: z.string(),
        }),
      ),
    }),
  ]),
});

const games = defineCollection({
  loader: file('src/content/games.json', { parser: itemsParser }),
  schema: z.object({
    order: z.number(),
    eyebrow: z.string(),
    title: z.string(),
    description: z.string(),
    platform: z.string(),
    status: z.string(),
    href,
    buttonLabel: z.string(),
    caption: z.string().optional(),
    image: assetPath,
  }),
});

const projects = defineCollection({
  loader: file('src/content/projects.json', { parser: itemsParser }),
  schema: z.object({
    order: z.number(),
    eyebrow: z.string(),
    title: z.string(),
    description: z.string(),
    stack: z.string(),
    year: z.string(),
    href,
    buttonLabel: z.string(),
    image: assetPath,
  }),
});

const community = defineCollection({
  loader: file('src/content/community.json', { parser: itemsParser }),
  schema: z.union([
    z.object({
      order: z.number(),
      type: z.literal('linkGrid'),
      eyebrow: z.string(),
      title: z.string(),
      links: z.array(z.object({ icon: z.string().optional(), label: z.string(), href })),
    }),
    z.object({
      order: z.number(),
      type: z.literal('link').default('link'),
      platform: z.string(),
      icon: z.string(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      eyebrow: z.string(),
      title: z.string(),
      description: z.string(),
      caption: z.string(),
      /** null = not published yet → button renders disabled (HANDOFF §11). */
      href: href.nullable(),
      image: assetPath,
      buttonLabel: z.string(),
      todo: z.string().optional(),
    }),
  ]),
});

export const collections = { site, start, games, projects, community };
