import { useEffect, useState, useRef } from "react";
import type { BrowserTab } from "../../shared/browser";
import { Icon } from "./Icon";

interface TabStripProps {
  tabs: BrowserTab[];
  activeTabId: string;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onCreate: () => void;
}

function TabFavicon({ favicon, isNewTab }: { favicon?: string; isNewTab: boolean }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [favicon]);

  if (favicon && !failed && !isNewTab) {
    return <img className="tab__favicon" src={favicon} alt="" onError={() => setFailed(true)} />;
  }

  return <Icon name={isNewTab ? "globe" : "search"} size={15} />;
}

export function TabStrip({ tabs, activeTabId, onSelect, onClose, onCreate }: TabStripProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector('.tab--active');
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      }
    }
  }, [activeTabId, tabs.length]);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY !== 0 && e.deltaX === 0) {
      e.currentTarget.scrollLeft += e.deltaY;
    }
  };

  return (
    <div className="tab-strip" aria-label="Browser tabs">
      <div 
        className="tab-list" 
        role="tablist" 
        aria-label="Open tabs"
        ref={listRef}
        onWheel={handleWheel}
      >
        {tabs.map((tab) => (
          <div key={tab.id} className={`tab ${tab.id === activeTabId ? "tab--active" : ""}`} role="presentation">
            <button className="tab__target" role="tab" aria-selected={tab.id === activeTabId} onClick={() => onSelect(tab.id)} title={tab.title}>
              <span className="tab__status" aria-hidden="true">
                {tab.isLoading ? <span className="loading-dot" /> : <TabFavicon favicon={tab.favicon} isNewTab={tab.isNewTab} />}
              </span>
              <span className="tab__title">{tab.title}</span>
            </button>
            <button className="tab__close" type="button" aria-label={`Close ${tab.title}`} title="Close tab" onClick={() => onClose(tab.id)}>
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
      </div>
      <button className="new-tab-button" type="button" aria-label="New tab" title="New tab (Ctrl+T)" onClick={onCreate}>
        <Icon name="plus" size={18} />
      </button>
    </div>
  );
}

