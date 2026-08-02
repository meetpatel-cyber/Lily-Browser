import { useState, useRef, useEffect, KeyboardEvent as ReactKeyboardEvent } from "react";
import type { BrowserTab } from "../../shared/browser";
import { TabFavicon } from "./TabStrip";
import { Icon } from "./Icon";
import "./TabSearch.css";

interface TabSearchProps {
  tabs: BrowserTab[];
  activeTabId?: string;
  onClose: () => void;
  onSelect: (tabId: string) => void;
}

export function TabSearch({ tabs, activeTabId, onClose, onSelect }: TabSearchProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredTabs = tabs.filter((tab) => {
    if (!query) return true;
    const q = query.toLowerCase();
    const title = tab.title.toLowerCase();
    const url = tab.url ? tab.url.toLowerCase() : "";
    return title.includes(q) || url.includes(q);
  });

  useEffect(() => {
    inputRef.current?.focus();
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filteredTabs.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredTabs.length) % filteredTabs.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredTabs.length > 0) {
        onSelect(filteredTabs[selectedIndex].id);
      }
    }
  };

  return (
    <div className="tab-search-overlay" onClick={onClose}>
      <div className="tab-search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tab-search-input-wrapper">
          <Icon name="search" size={16} />
          <input
            ref={inputRef}
            className="tab-search-input"
            placeholder="Search tabs..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className="tab-search-results">
          {filteredTabs.length === 0 ? (
            <div className="tab-search-empty">No matching tabs</div>
          ) : (
            filteredTabs.map((tab, idx) => (
              <button
                key={tab.id}
                className={`tab-search-result ${idx === selectedIndex ? "selected" : ""} ${tab.id === activeTabId ? "active" : ""}`}
                onClick={() => onSelect(tab.id)}
              >
                <div className="tab-search-result-favicon">
                  <TabFavicon favicon={tab.favicon} isNewTab={tab.isNewTab} />
                </div>
                <div className="tab-search-result-details">
                  <div className="tab-search-result-title">{tab.title}</div>
                  <div className="tab-search-result-url">{tab.url || "New Tab"}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
