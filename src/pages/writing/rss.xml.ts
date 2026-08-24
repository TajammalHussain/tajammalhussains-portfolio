import rss from "@astrojs/rss";
import { getCollection, type CollectionEntry } from "astro:content";
import type { APIRoute } from "astro";
import { SITE } from "@/lib/site";

export const GET: APIRoute = async (context) => {
  const posts = await getCollection(
    "writing",
    (entry: CollectionEntry<"writing">) => !entry.data.draft,
  );
  return rss({
    title: `${SITE.name} — Writing`,
    description: SITE.description,
    site: context.site ?? SITE.url,
    items: posts
      .sort(
        (a: CollectionEntry<"writing">, b: CollectionEntry<"writing">) =>
          b.data.publishDate.valueOf() - a.data.publishDate.valueOf(),
      )
      .map((post) => ({
        title: post.data.title,
        description: post.data.excerpt,
        pubDate: post.data.publishDate,
        link: `/writing/${post.slug}/`,
      })),
  });
};
