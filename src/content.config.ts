import { defineCollection } from 'astro:content';
import { file } from 'astro/loaders';
import { z } from 'astro/zod';
import { projectCategoryNames } from './lib/project-categories';

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
/** Release date as YYYY-MM-DD: Games rows and Projects groups list newest first. */
const releaseDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date as YYYY-MM-DD');
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

const cta = z.object({ label: z.string(), href, variant: z.enum(['primary', 'secondary']) });

/** Start page (pages/index.astro): one entry — the hero, then the explore row. */
const start = defineCollection({
  loader: file('src/content/start.json', {
    parser: (text) => [{ id: 'start', ...(JSON.parse(text) as Record<string, unknown>) }],
  }),
  schema: z.object({
    hero: z.object({
      /** Slider images (StartHero.astro), shown in this order. */
      images: z.array(assetPath).min(1),
      imageAlt: z.string(),
      /** CSS object-position per layout. */
      imagePosition: z.object({ desktop: z.string(), tablet: z.string(), mobile: z.string() }),
      name: z.string(),
      tagline: z.string(),
      handle: z.string(),
      bio: z.string(),
      joinPrompt: z.string(),
      ctas: z.array(cta).length(2),
    }),
    explore: z.object({
      title: z.string(),
      items: z
        .array(
          z.object({
            number: z.number().int().positive(),
            icon: z.string(),
            title: z.string(),
            description: z.string(),
            image: assetPath,
            href,
            linkLabel: z.string(),
          }),
        )
        .min(1),
    }),
    /** "About me" section (StartAbout.astro): image, headline, lead paragraphs, body and link. */
    about: z.object({
      title: z.string(),
      /** 16:9 image at the top of the panel. */
      image: assetPath,
      imageAlt: z.string(),
      /** First line: the container's headline; each further line ("\n") a lead paragraph. */
      lead: z.string(),
      /** Button to the links (Community page) with a short caption beside it ("\n": line break). */
      body: z.string(),
      href,
      linkLabel: z.string(),
    }),
  }),
});

const games = defineCollection({
  loader: file('src/content/games.json', { parser: itemsParser }),
  schema: z.object({
    order: z.number(),
    /**
     * One row per category, headed by it (pages/games.astro); a game in several
     * categories shows in each of their rows. Listed at the bottom of the game card.
     */
    categories: z.array(z.string()).min(1),
    title: z.string(),
    releaseDate,
    description: z.string(),
    platform: z.string(),
    status: z.string(),
    href,
    buttonLabel: z.string(),
    /** First line of the caption beside the button; `platform` is the second line. */
    caption: z.string().optional(),
    image: assetPath,
  }),
});

const projects = defineCollection({
  loader: file('src/content/projects.json', { parser: itemsParser }),
  schema: z.object({
    order: z.number(),
    /** Group and filter on the Projects page (pages/projects.astro). */
    category: z.enum(projectCategoryNames),
    title: z.string(),
    releaseDate,
    description: z.string(),
    /** Shown beside the button as "Tech used:" / stack. */
    stack: z.string(),
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
      /** Headline above the container (pages/community.astro). */
      title: z.string(),
      links: z.array(z.object({ icon: z.string().optional(), label: z.string(), href })),
    }),
    z.object({
      order: z.number(),
      type: z.literal('link').default('link'),
      platform: z.string(),
      icon: z.string(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
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
