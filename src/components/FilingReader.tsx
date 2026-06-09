"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import styles from "./FilingReader.module.css";

// The document HTML is rendered in a memoized node so parent re-renders (TOC,
// search, font/width state) never re-apply dangerouslySetInnerHTML — which would
// otherwise wipe the anchor ids, table wrappers, and search marks we add to the
// live DOM after mount.
const FilingContent = memo(function FilingContent({
  html,
  innerRef,
}: {
  html: string;
  innerRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={innerRef}
      className={styles.filingContent}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

interface ReaderMeta {
  cik: string;
  form: string;
  date: string;
  sourceUrl: string;
  downloadUrl: string;
  prevHref: string | null;
  nextHref: string | null;
}

interface TocItem {
  id: string;
  label: string;
  level: number; // 0 = Part, 1 = Item
}
interface TocGroup {
  header: TocItem | null; // a Part (or null for items before the first part)
  items: TocItem[];
}

const WIDTHS: Record<string, string> = {
  narrow: "680px",
  medium: "880px",
  wide: "100%",
};

const MARKER_RE = /^(part\s+[ivxlc]+|item\s+\d+[a-z]?)\b/i;

export default function FilingReader({ html, meta }: { html: string; meta: ReaderMeta }) {
  const contentRef = useRef<HTMLDivElement>(null);

  const [fontScale, setFontScale] = useState(1);
  const [width, setWidth] = useState<keyof typeof WIDTHS>("medium");
  const [toc, setToc] = useState<TocGroup[]>([]);
  const [tocOpen, setTocOpen] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});

  const [query, setQuery] = useState("");
  const [matchCount, setMatchCount] = useState(0);
  const [activeMatch, setActiveMatch] = useState(0);

  // --- After the document mounts: wrap tables for scroll + build the TOC. ---
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;

    // Wrap wide tables so they scroll horizontally instead of overflowing.
    root.querySelectorAll("table").forEach((table) => {
      if (table.parentElement?.classList.contains(styles.tableScroll)) return;
      const wrap = document.createElement("div");
      wrap.className = styles.tableScroll;
      table.parentNode?.insertBefore(wrap, table);
      wrap.appendChild(table);
    });

    // Build a best-effort outline from PART / Item markers (10-K/10-Q structure).
    const candidates = Array.from(
      root.querySelectorAll<HTMLElement>("p, div, h1, h2, h3, h4, h5, h6, b, strong, span"),
    );
    const seen = new Set<string>();
    const flat: { el: HTMLElement; item: TocItem }[] = [];

    for (const el of candidates) {
      const text = (el.textContent || "").trim().replace(/\s+/g, " ");
      if (!text || text.length > 140 || !MARKER_RE.test(text)) continue;
      if (el.closest("a")) continue; // skip the filing's own clickable TOC entries
      // Skip if an ancestor already qualified (avoid nested duplicates).
      if (flat.some((f) => f.el.contains(el))) continue;

      const weight = parseInt(getComputedStyle(el).fontWeight || "400", 10);
      const heading = /^h[1-6]$/i.test(el.tagName) || weight >= 600;
      if (!heading) continue;

      const norm = text.toLowerCase();
      if (seen.has(norm)) continue;
      seen.add(norm);

      const level = /^part/i.test(text) ? 0 : 1;
      const id = `sec-${flat.length}`;
      el.id = id;
      flat.push({ el, item: { id, label: text, level } });
    }

    // Group Items under their preceding Part.
    const groups: TocGroup[] = [];
    let current: TocGroup | null = null;
    for (const { item } of flat) {
      if (item.level === 0) {
        current = { header: item, items: [] };
        groups.push(current);
      } else {
        if (!current) {
          current = { header: null, items: [] };
          groups.push(current);
        }
        current.items.push(item);
      }
    }
    setToc(groups);
  }, [html]);

  // --- In-document search: wrap matches in <mark>, support stepping. ---
  const clearMarks = useCallback(() => {
    const root = contentRef.current;
    if (!root) return;
    root.querySelectorAll("mark[data-search-match]").forEach((m) => {
      const parent = m.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(m.textContent || ""), m);
      parent.normalize();
    });
  }, []);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    clearMarks();
    const q = query.trim();
    if (q.length < 2) {
      setMatchCount(0);
      setActiveMatch(0);
      return;
    }

    const needle = q.toLowerCase();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.toLowerCase().includes(needle)) {
          return NodeFilter.FILTER_REJECT;
        }
        const tag = node.parentElement?.tagName;
        if (tag === "MARK" || tag === "SCRIPT" || tag === "STYLE") {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const textNodes: Text[] = [];
    let n = walker.nextNode();
    while (n) {
      textNodes.push(n as Text);
      n = walker.nextNode();
    }

    let count = 0;
    for (const textNode of textNodes) {
      const value = textNode.nodeValue || "";
      const lower = value.toLowerCase();
      const frag = document.createDocumentFragment();
      let last = 0;
      let idx = lower.indexOf(needle, 0);
      while (idx !== -1) {
        if (idx > last) frag.appendChild(document.createTextNode(value.slice(last, idx)));
        const mark = document.createElement("mark");
        mark.setAttribute("data-search-match", "");
        mark.textContent = value.slice(idx, idx + needle.length);
        frag.appendChild(mark);
        count++;
        last = idx + needle.length;
        idx = lower.indexOf(needle, last);
      }
      if (last < value.length) frag.appendChild(document.createTextNode(value.slice(last)));
      textNode.parentNode?.replaceChild(frag, textNode);
    }

    setMatchCount(count);
    setActiveMatch(count > 0 ? 1 : 0);
  }, [query, clearMarks]);

  // Highlight + scroll the active match.
  useEffect(() => {
    const root = contentRef.current;
    if (!root || matchCount === 0) return;
    const marks = root.querySelectorAll<HTMLElement>("mark[data-search-match]");
    marks.forEach((m, i) => {
      if (i === activeMatch - 1) {
        m.setAttribute("data-search-active", "");
        m.scrollIntoView({ block: "center", behavior: "smooth" });
      } else {
        m.removeAttribute("data-search-active");
      }
    });
  }, [activeMatch, matchCount]);

  const stepMatch = (dir: 1 | -1) => {
    if (matchCount === 0) return;
    setActiveMatch((a) => ((a - 1 + dir + matchCount) % matchCount) + 1);
  };

  const scrollTo = (id: string) => {
    const el = contentRef.current?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    el?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const contentStyle = useMemo(
    () => ({ maxWidth: WIDTHS[width], zoom: fontScale, margin: "0 auto" }) as React.CSSProperties,
    [width, fontScale],
  );

  return (
    <div>
      {/* Toolbar */}
      <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <Link href={`/company/${meta.cik}`} className="text-blue-600 hover:underline">
            ← Back
          </Link>
          <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-medium text-slate-700">
            {meta.form}
          </span>
          <span className="text-slate-500">{meta.date}</span>

          {/* Search */}
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  stepMatch(e.shiftKey ? -1 : 1);
                }
              }}
              placeholder="Search in document…"
              className="w-44 rounded border border-slate-300 px-2 py-1 outline-none focus:border-blue-500"
            />
            <span className="w-14 text-center text-xs text-slate-500">
              {matchCount ? `${activeMatch}/${matchCount}` : query.trim().length >= 2 ? "0" : ""}
            </span>
            <button
              onClick={() => stepMatch(-1)}
              disabled={matchCount === 0}
              className="rounded border border-slate-300 px-1.5 disabled:opacity-40"
              aria-label="Previous match"
            >
              ↑
            </button>
            <button
              onClick={() => stepMatch(1)}
              disabled={matchCount === 0}
              className="rounded border border-slate-300 px-1.5 disabled:opacity-40"
              aria-label="Next match"
            >
              ↓
            </button>
          </div>

          {/* Font + width controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setFontScale((s) => Math.max(0.7, +(s - 0.1).toFixed(2)))}
              className="rounded border border-slate-300 px-2"
              aria-label="Decrease font size"
            >
              A−
            </button>
            <button
              onClick={() => setFontScale((s) => Math.min(1.8, +(s + 0.1).toFixed(2)))}
              className="rounded border border-slate-300 px-2"
              aria-label="Increase font size"
            >
              A+
            </button>
            <select
              value={width}
              onChange={(e) => setWidth(e.target.value as keyof typeof WIDTHS)}
              className="rounded border border-slate-300 px-1 py-1 text-xs"
              aria-label="Reading width"
            >
              <option value="narrow">Narrow</option>
              <option value="medium">Medium</option>
              <option value="wide">Wide</option>
            </select>
          </div>

          {/* Prev/next + external */}
          <div className="ml-auto flex items-center gap-3">
            {meta.prevHref ? (
              <Link href={meta.prevHref} className="text-blue-600 hover:underline">
                ← Newer
              </Link>
            ) : (
              <span className="text-slate-300">← Newer</span>
            )}
            {meta.nextHref ? (
              <Link href={meta.nextHref} className="text-blue-600 hover:underline">
                Older →
              </Link>
            ) : (
              <span className="text-slate-300">Older →</span>
            )}
            <a href={meta.sourceUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
              Original ↗
            </a>
            <a href={meta.downloadUrl} className="text-blue-600 hover:underline">
              Download
            </a>
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        {/* TOC sidebar */}
        {toc.length > 0 && (
          <aside className="hidden w-60 shrink-0 lg:block">
            <div className="sticky top-16 max-h-[calc(100vh-5rem)] overflow-auto rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Contents
                </span>
                <button
                  onClick={() => setTocOpen((o) => !o)}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  {tocOpen ? "Hide" : "Show"}
                </button>
              </div>
              {tocOpen && (
                <nav className="space-y-1">
                  {toc.map((group, gi) => (
                    <div key={gi}>
                      {group.header && (
                        <button
                          onClick={() => {
                            scrollTo(group.header!.id);
                            setCollapsed((c) => ({ ...c, [gi]: !c[gi] }));
                          }}
                          className="flex w-full items-center gap-1 text-left font-medium text-slate-700 hover:text-blue-600"
                        >
                          <span className="text-slate-400">{collapsed[gi] ? "▸" : "▾"}</span>
                          <span className="truncate">{group.header.label}</span>
                        </button>
                      )}
                      {!collapsed[gi] && (
                        <ul className={group.header ? "ml-4 space-y-0.5" : "space-y-0.5"}>
                          {group.items.map((it) => (
                            <li key={it.id}>
                              <button
                                onClick={() => scrollTo(it.id)}
                                className="block w-full truncate text-left text-slate-600 hover:text-blue-600"
                                title={it.label}
                              >
                                {it.label}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </nav>
              )}
            </div>
          </aside>
        )}

        {/* Document */}
        <div className="min-w-0 flex-1">
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div style={contentStyle}>
              <FilingContent html={html} innerRef={contentRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
