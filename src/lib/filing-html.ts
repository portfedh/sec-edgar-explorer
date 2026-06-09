// Server-side loader for a single filing document: fetches it from sec.gov,
// classifies it (html / pdf / other), and for HTML sanitizes it while
// preserving the filing's own inline formatting so it still looks like the
// real document when rendered inline in our app.

import "server-only";
import sanitizeHtml from "sanitize-html";
import { parseCik, accessionNoDashes } from "./cik";

const USER_AGENT =
  process.env.SEC_USER_AGENT || "EDGAR Browser (set SEC_USER_AGENT) example@example.com";

export type FilingKind = "html" | "pdf" | "other";

export interface LoadedFiling {
  kind: FilingKind;
  contentType: string;
  /** Sanitized HTML, present only when kind === "html". */
  html?: string;
  /** Absolute URL of the document on sec.gov. */
  sourceUrl: string;
}

/** Absolute base + document URLs for a filing document on sec.gov. */
export function filingFolderBase(cik: string | number, accession: string): string {
  const cikInt = parseCik(cik);
  const noDash = accessionNoDashes(accession);
  return `https://www.sec.gov/Archives/edgar/data/${cikInt}/${noDash}/`;
}

export function filingDocumentUrl(
  cik: string | number,
  accession: string,
  doc: string,
): string {
  return filingFolderBase(cik, accession) + doc;
}

// --- tiny in-memory LRU so big docs (Intel 10-K ~3.3MB) aren't re-sanitized ---
const CACHE_MAX = 24;
const cache = new Map<string, LoadedFiling>();

function cacheGet(key: string): LoadedFiling | undefined {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key); // refresh recency
    cache.set(key, hit);
  }
  return hit;
}

function cacheSet(key: string, val: LoadedFiling): void {
  cache.set(key, val);
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

function absolutize(url: string | undefined, base: string): string | undefined {
  if (!url) return url;
  const u = url.trim();
  if (!u || u.startsWith("#")) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return u; // already has a scheme
  try {
    return new URL(u, base).toString();
  } catch {
    return u;
  }
}

function sanitize(raw: string, base: string): string {
  return sanitizeHtml(raw, {
    allowedTags: [
      "div", "span", "p", "br", "hr", "a", "img", "b", "i", "u", "s", "strong",
      "em", "font", "small", "big", "sub", "sup", "center", "blockquote", "pre",
      "code", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "dl", "dt",
      "dd", "table", "caption", "colgroup", "col", "thead", "tbody", "tfoot",
      "tr", "td", "th", "abbr",
    ],
    allowedAttributes: {
      "*": [
        "style", "class", "id", "name", "title", "dir", "lang", "align", "valign",
        "width", "height", "colspan", "rowspan", "bgcolor", "color", "nowrap",
        "cellpadding", "cellspacing", "border", "scope", "abbr",
      ],
      a: ["href", "target", "rel"],
      img: ["src", "alt", "title", "width", "height"],
      font: ["color", "size", "face"],
    },
    // Keep all inline CSS (don't pass allowedStyles, which would filter properties).
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      img: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, src: absolutize(attribs.src, base) ?? "" },
      }),
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          href: absolutize(attribs.href, base) ?? "",
          target: "_blank",
          rel: "noreferrer noopener",
        },
      }),
    },
  });
}

export async function loadFilingHtml(
  cik: string | number,
  accession: string,
  doc: string,
): Promise<LoadedFiling> {
  const sourceUrl = filingDocumentUrl(cik, accession, doc);
  const cached = cacheGet(sourceUrl);
  if (cached) return cached;

  const res = await fetch(sourceUrl, {
    headers: { "User-Agent": USER_AGENT, "Accept-Encoding": "gzip, deflate" },
    next: { revalidate: 86400 },
  });
  if (!res.ok) {
    throw new Error(`Failed to load filing document (${res.status})`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  let kind: FilingKind = "other";
  if (/html|xml/i.test(contentType)) kind = "html";
  else if (/pdf/i.test(contentType)) kind = "pdf";

  let html: string | undefined;
  if (kind === "html") {
    const raw = await res.text();
    html = sanitize(raw, filingFolderBase(cik, accession));
  }

  const loaded: LoadedFiling = { kind, contentType, html, sourceUrl };
  cacheSet(sourceUrl, loaded);
  return loaded;
}
