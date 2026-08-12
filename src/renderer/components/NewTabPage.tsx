import { type FormEvent, useState, useRef, useEffect, useMemo } from "react";
import { Icon } from "./Icon";
import { FaviconIcon } from "./FaviconIcon";
import type { HistoryEntry } from "../../shared/browser";

export function NewTabPage({ onNavigate, history }: { onNavigate: (value: string) => void; history?: HistoryEntry[] }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Explicitly focus the input when this New Tab becomes active/rendered.
    // This provides deterministic focus that doesn't rely solely on native autoFocus timing.
    inputRef.current?.focus();
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onNavigate(query);
  };

  const topSites = useMemo(() => {
    if (!history) return [];
    
    const counts = new Map<string, { count: number; url: string; title: string }>();

    for (const entry of history) {
      try {
        const urlObj = new URL(entry.url);
        if (urlObj.protocol !== "http:" && urlObj.protocol !== "https:") continue;
        
        const host = urlObj.hostname;
        
        if (counts.has(host)) {
          counts.get(host)!.count++;
        } else {
          counts.set(host, { count: 1, url: entry.url, title: entry.title });
        }
      } catch {
        continue;
      }
    }

    return Array.from(counts.values())
      .sort((a, b) => b.count !== a.count ? b.count - a.count : a.title.localeCompare(b.title))
      .slice(0, 8);
  }, [history]);

  return (
    <section className="new-tab-page" aria-label="New tab">
      <div className="new-tab-page__content">
        <div className="lily-mark" aria-hidden="true">L</div>
        <h1>Lily</h1>
        <p>Search the web or enter a site address.</p>
        <form className="new-tab-search" onSubmit={submit}>
          <Icon name="search" size={19} />
          <input ref={inputRef} aria-label="Search the web" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="What would you like to find?" />
          <button type="submit" aria-label="Search"><Icon name="forward" size={18} /></button>
        </form>
        <span className="new-tab-hint">Tip: press Ctrl+L to focus the address bar.</span>
        
        {topSites.length > 0 && (
          <div className="new-tab-top-sites" aria-label="Frequently visited">
            {topSites.map(site => (
              <button key={site.url} className="new-tab-top-site" onClick={() => onNavigate(site.url)} title={site.title || site.url} type="button">
                <div className="new-tab-top-site__icon">
                  <FaviconIcon url={site.url} fallback="globe" size={24} />
                </div>
                <span>{site.title || new URL(site.url).hostname}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

