import type { Metadata } from "next";
import { shop } from "@/config/shop";
import { DEFAULT_LOCALE, HTML_LANG, LOCALES, localePath, type Locale } from "@/i18n/config";
import { parseDescription } from "@/lib/description";

const OG_LOCALE: Record<Locale, string> = { zh: "zh_CN", en: "en_US" };
const MAX_DESCRIPTION = 160;

/** Link preview for pages without a photo of their own (home, lists, info pages): 1200×630, in public/images */
export const SHARE_IMAGE = { url: "/images/share.jpg", width: 1200, height: 630 };

/**
 * Per-page search / sharing metadata: this page's own address in each language (hreflang) and its canonical URL,
 * plus the link preview (Open Graph) shown when the page is shared in iMessage, WeChat, Instagram and so on.
 * `path` is the page without the language prefix ("/styles/some-slug"). Relative URLs resolve against metadataBase (layout).
 */
export function pageSeo(
  locale: Locale,
  path: string,
  { title, description, image }: { title: string; description?: string; image?: string },
): Pick<Metadata, "alternates" | "openGraph" | "description"> {
  const url = localePath(locale, path);
  return {
    ...(description ? { description } : {}),
    alternates: {
      canonical: url,
      languages: {
        ...Object.fromEntries(LOCALES.map((l) => [HTML_LANG[l], localePath(l, path)])),
        "x-default": localePath(DEFAULT_LOCALE, path),
      },
    },
    openGraph: {
      type: "website",
      siteName: shop.name,
      locale: OG_LOCALE[locale],
      title,
      url,
      ...(description ? { description } : {}),
      images: [image ? { url: image } : SHARE_IMAGE],
    },
  };
}

/** A product's intro (the text before the first "## heading" of its description) as a one-line page description */
export function productSummary(description: string | null | undefined): string | undefined {
  const intro = parseDescription(description ?? "").find((section) => section.title === null);
  const text = intro?.blocks
    .map((block) => (block.type === "paragraph" ? block.text : block.items.join("; ")))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return undefined;
  return text.length > MAX_DESCRIPTION ? `${text.slice(0, MAX_DESCRIPTION - 1).trimEnd()}…` : text;
}
