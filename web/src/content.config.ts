import { readdirSync } from 'node:fs';
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * Blog posts: Markdown files in src/content/blog. Files starting with "_" are
 * ignored (see _EJEMPLO-articulo.md for the format). Only real articles.
 */
const BLOG_DIR = './src/content/blog';
// Top level only: the file name is the URL and /blog/[slug] takes one segment
// (a post in a subfolder would break the build with "Missing parameter: slug").
const blogGlob = glob({ pattern: '[^_]*.md', base: BLOG_DIR });

function hasMarkdownPosts(): boolean {
  try {
    return readdirSync(BLOG_DIR).some((name) => name.endsWith('.md') && !name.startsWith('_'));
  } catch {
    return false;
  }
}

const blog = defineCollection({
  loader: {
    name: 'blog-loader',
    load: async (context) => {
      // While the blog is empty, skip the glob loader (it logs a "no files" warning).
      // Restart `npm run dev` after adding the first article.
      if (!hasMarkdownPosts()) {
        context.store.clear();
        return;
      }
      return blogGlob.load(context);
    },
  },
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    draft: z.boolean().default(false),
    /** Path under /public, e.g. /images/blog/mi-articulo.jpg */
    cover: z.string().optional(),
    coverAlt: z.string().optional(),
  }),
});

export const collections = { blog };
