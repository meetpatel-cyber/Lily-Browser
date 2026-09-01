import { type FormEvent, useState, useRef, useEffect, useMemo } from "react";
import { Icon } from "./Icon";
import { FaviconIcon } from "./FaviconIcon";
import type { HistoryEntry, Shortcut, BrowserPreferences } from "../../shared/browser";

export function NewTabPage({ onNavigate, history, shortcuts = [], preferences }: { onNavigate: (value: string) => void; history?: HistoryEntry[]; shortcuts?: Shortcut[]; preferences?: BrowserPreferences }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [editingShortcut, setEditingShortcut] = useState<Shortcut | { id: "new", url: string, title: string } | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [isCustomizing, setIsCustomizing] = useState(false);
  const customizationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isCustomizing) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      if (customizationRef.current && !customizationRef.current.contains(e.target as Node)) {
        setIsCustomizing(false);
      }
    };
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsCustomizing(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isCustomizing]);

  useEffect(() => {
    if (!editingShortcut) {
      inputRef.current?.focus();
    }
  }, [editingShortcut]);

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

  const openShortcutModal = (shortcut?: Shortcut) => {
    if (shortcut) {
      setEditingShortcut(shortcut);
      setEditUrl(shortcut.url);
      setEditTitle(shortcut.title);
    } else {
      setEditingShortcut({ id: "new", url: "", title: "" });
      setEditUrl("");
      setEditTitle("");
    }
  };

  const saveShortcut = () => {
    if (!editUrl.trim()) return;
    let finalUrl = editUrl.trim();
    if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://")) {
      finalUrl = "https://" + finalUrl;
    }
    const finalTitle = editTitle.trim() || new URL(finalUrl).hostname;
    
    if (editingShortcut?.id === "new") {
      window.lilyBrowser.addShortcut(finalUrl, finalTitle);
    } else if (editingShortcut) {
      window.lilyBrowser.updateShortcut(editingShortcut.id, finalUrl, finalTitle);
    }
    setEditingShortcut(null);
  };

  const removeShortcut = () => {
    if (editingShortcut && editingShortcut.id !== "new") {
      window.lilyBrowser.removeShortcut(editingShortcut.id);
    }
    setEditingShortcut(null);
  };

  return (
    <section 
      className={`new-tab-page ${preferences?.newTabBackground ? 'has-background' : ''}`} 
      aria-label="New tab"
      style={preferences?.newTabBackground ? { backgroundImage: `url(${preferences.newTabBackground})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
    >
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
        
        {( (preferences?.newTabShowShortcuts !== false) || ((preferences?.newTabShowTopSites !== false) && topSites.length > 0) ) && (
          <div className="new-tab-grids-container">
            {(preferences?.newTabShowShortcuts !== false) && (
              <div className="new-tab-top-sites" aria-label="Shortcuts">
              {shortcuts.map(shortcut => (
                <div key={shortcut.id} className="new-tab-shortcut-wrapper">
                  <button className="new-tab-top-site" onClick={() => onNavigate(shortcut.url)} title={shortcut.title} type="button">
                    <div className="new-tab-top-site__icon">
                      <FaviconIcon url={shortcut.url} fallback="globe" size={24} />
                    </div>
                    <span>{shortcut.title}</span>
                  </button>
                  <button className="new-tab-shortcut-action" title="Edit shortcut" onClick={(e) => { e.stopPropagation(); openShortcutModal(shortcut); }}>
                    <Icon name="edit" size={12} />
                  </button>
                </div>
              ))}
              {shortcuts.length < 10 && (
                <button className="new-tab-top-site" onClick={() => openShortcutModal()} title="Add shortcut" type="button">
                  <div className="new-tab-top-site__icon" style={{ background: "transparent", borderStyle: "dashed", borderColor: "var(--border-subtle)" }}>
                    <Icon name="plus" size={20} />
                  </div>
                  <span>Add</span>
                </button>
              )}
              </div>
            )}

            {(preferences?.newTabShowTopSites !== false) && topSites.length > 0 && (
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
        )}
      </div>

      {editingShortcut && (
        <div className="shortcut-modal-overlay" onClick={() => setEditingShortcut(null)}>
          <div className="shortcut-modal" onClick={e => e.stopPropagation()}>
            <h3>{editingShortcut.id === "new" ? "Add Shortcut" : "Edit Shortcut"}</h3>
            <input 
              type="text" 
              placeholder="Name" 
              value={editTitle} 
              onChange={e => setEditTitle(e.target.value)} 
              autoFocus 
            />
            <input 
              type="text" 
              placeholder="URL" 
              value={editUrl} 
              onChange={e => setEditUrl(e.target.value)} 
              onKeyDown={e => { if (e.key === "Enter") saveShortcut(); }}
            />
            <div className="shortcut-modal-actions">
              {editingShortcut.id !== "new" && (
                <button className="danger" onClick={removeShortcut}>Remove</button>
              )}
              <button className="secondary" onClick={() => setEditingShortcut(null)}>Cancel</button>
              <button className="primary" onClick={saveShortcut}>Save</button>
            </div>
          </div>
        </div>
      )}

      <div className="new-tab-customization-controls" ref={customizationRef}>
        <button 
          className="new-tab-customization-toggle" 
          aria-label="Customize New Tab page" 
          aria-expanded={isCustomizing}
          onClick={() => setIsCustomizing(!isCustomizing)}
        >
          <Icon name="edit" size={20} />
        </button>

        {isCustomizing && (
          <div className="new-tab-customization-popover">
            <button className="menu-item" onClick={() => { setIsCustomizing(false); window.lilyBrowser.chooseNewTabBackground(); }}>
              <Icon name="image" size={16} />
              Change background
            </button>
            {preferences?.newTabBackground && (
              <button className="menu-item" onClick={() => { setIsCustomizing(false); window.lilyBrowser.updatePreferences({ newTabBackground: "" }); }}>
                <Icon name="trash" size={16} />
                Remove background
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
