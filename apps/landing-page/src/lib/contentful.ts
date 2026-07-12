export interface NewsItem {
  id: string;
  slug: string;
  eyebrow: string;
  title: string;
  summary: string;
  content: string[];
  publishedAt: string;
  ctaLabel: string;
  imageUrl: string | null;
}

export interface NewsFeedResult {
  items: NewsItem[];
}

interface ContentfulEntry {
  fields?: Record<string, unknown>;
  sys?: {
    createdAt?: string;
    id?: string;
  };
}

interface ContentfulAsset {
  fields?: {
    file?: {
      url?: string;
    };
  };
  sys?: {
    id?: string;
  };
}

function createNewsSlug(title: string, id: string) {
  const base = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return base || id;
}

function getStringField(fields: Record<string, unknown>, candidates: string[]) {
  for (const candidate of candidates) {
    const value = fields[candidate];

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return "";
}

function getAssetId(fields: Record<string, unknown>, candidates: string[]) {
  for (const candidate of candidates) {
    const value = fields[candidate] as { sys?: { id?: string } } | undefined;
    const assetId = value?.sys?.id;

    if (assetId) {
      return assetId;
    }
  }

  return null;
}

function normalizeImageUrl(url: string | undefined) {
  if (!url) {
    return null;
  }

  return url.startsWith("//") ? `https:${url}` : url;
}

function getParagraphsField(fields: Record<string, unknown>, candidates: string[]) {
  for (const candidate of candidates) {
    const value = fields[candidate];

    if (typeof value === "string" && value.trim().length > 0) {
      return value
        .split(/\n{2,}|\r\n{2,}/)
        .flatMap((paragraph) => paragraph.split(/\r?\n/))
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);
    }
  }

  return [];
}

export async function fetchNewsFeed(): Promise<NewsFeedResult> {
  const spaceId = import.meta.env.VITE_CONTENTFUL_SPACE_ID;
  const accessToken = import.meta.env.VITE_CONTENTFUL_ACCESS_TOKEN;

  if (!spaceId || !accessToken) {
    return {
      items: [],
    };
  }

  const environment = import.meta.env.VITE_CONTENTFUL_ENVIRONMENT ?? "master";
  const contentType = import.meta.env.VITE_CONTENTFUL_NEWS_CONTENT_TYPE ?? "newsArticle";
  const limit = Number(import.meta.env.VITE_CONTENTFUL_NEWS_LIMIT ?? "12");

  const url = new URL(
    `https://cdn.contentful.com/spaces/${spaceId}/environments/${environment}/entries`,
  );
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("content_type", contentType);
  url.searchParams.set("order", "-sys.createdAt");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("include", "2");

  try {
    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error("Dohvat novosti nije uspio.");
    }

    const payload = (await response.json()) as {
      items?: ContentfulEntry[];
      includes?: {
        Asset?: ContentfulAsset[];
      };
    };

    const assets = new Map(
      (payload.includes?.Asset ?? []).map((asset) => [
        asset.sys?.id,
        normalizeImageUrl(asset.fields?.file?.url),
      ]),
    );

    const items = (payload.items ?? [])
      .map((entry) => {
        const fields = entry.fields ?? {};
        const imageId = getAssetId(fields, ["image", "heroImage", "coverImage", "thumbnail"]);
        const title = getStringField(fields, ["title", "headline", "name"]) || "Novost bez naslova";
        const summary =
          getStringField(fields, ["summary", "excerpt", "description", "body"]) ||
          "Sažetak za ovu objavu još nije dostupan.";
        const content =
          getParagraphsField(fields, ["body", "content", "articleBody", "description", "summary"]) ||
          [];
        const id = entry.sys?.id ?? crypto.randomUUID();

        return {
          id,
          slug: createNewsSlug(title, id),
          eyebrow: getStringField(fields, ["eyebrow", "category", "tag"]) || "Najnovije",
          title,
          summary,
          content: content.length > 0 ? content : [summary],
          publishedAt:
            getStringField(fields, ["publishedAt", "date"]) ||
            entry.sys?.createdAt ||
            new Date().toISOString(),
          ctaLabel: getStringField(fields, ["ctaLabel", "cta", "buttonLabel"]) || "Pročitajte novost",
          imageUrl: imageId ? assets.get(imageId) ?? null : null,
        } satisfies NewsItem;
      })
      .filter((item) => item.title.trim().length > 0);

    return {
      items,
    };
  } catch {
    return {
      items: [],
    };
  }
}
