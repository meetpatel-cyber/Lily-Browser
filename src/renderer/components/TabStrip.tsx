import React, { useEffect, useState, useRef } from "react";
import type { BrowserTab } from "../../shared/browser";
import { Icon } from "./Icon";

interface TabStripProps {
  tabs: BrowserTab[];
  activeTabId: string;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onCreate: () => void;
  onContextMenu?: (tabId: string) => void;
  tabGroups?: Record<string, import("../../shared/browser").TabGroup>;
}

export function TabFavicon({ favicon, isNewTab }: { favicon?: string; isNewTab: boolean }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [favicon]);

  if (favicon && !failed && !isNewTab) {
    return <img className="tab__favicon" src={favicon} alt="" onError={() => setFailed(true)} />;
  }

  return <Icon name={isNewTab ? "globe" : "search"} size={15} />;
}

export function TabStrip({ tabs, tabGroups, activeTabId, onSelect, onClose, onCreate, onContextMenu }: TabStripProps) {
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
        {tabs.map((tab, i) => {
          const prevTab = i > 0 ? tabs[i - 1] : undefined;
          const isNewGroupStart = tab.groupId && tab.groupId !== prevTab?.groupId;
          const group = tab.groupId && tabGroups ? tabGroups[tab.groupId] : undefined;

          return (
            <React.Fragment key={tab.id}>
              {isNewGroupStart && group && (
                <div 
                  className={`tab-group-header tab-group-header--${group.color}`} 
                  title="Group options (right-click to edit)"
                  onContextMenu={(e) => {
                    e.preventDefault();
                    void window.lilyBrowser.showTabGroupContextMenu(group.id);
                  }}
                >
                  <input 
                    type="text" 
                    value={group.name} 
                    placeholder="Group"
                    onChange={(e) => window.lilyBrowser.updateTabGroup(group.id, { name: e.target.value })}
                    className="tab-group-name"
                  />
                </div>
              )}
              <div 
                className={`tab ${tab.id === activeTabId ? "tab--active" : ""} ${tab.isPinned ? "tab--pinned" : ""} ${group ? `tab--in-group tab--group-${group.color}` : ""}`} 
                role="presentation"
                onContextMenu={(e) => {
                  if (onContextMenu) {
                    e.preventDefault();
                    onContextMenu(tab.id);
                  }
                }}
              >
                <button className="tab__target" role="tab" aria-selected={tab.id === activeTabId} onClick={() => onSelect(tab.id)} title={tab.title}>
                  <span className="tab__status" aria-hidden="true">
                    {tab.isLoading ? <span className="loading-dot" /> : <TabFavicon favicon={tab.favicon} isNewTab={tab.isNewTab} />}
                  </span>
                  <span className="tab__title">{tab.title}</span>
                  {tab.isMuted ? (
                    <span className="tab__audio-icon" title="Muted"><Icon name="volume-off" size={13} /></span>
                  ) : tab.isAudible ? (
                    <span className="tab__audio-icon" title="Playing audio"><Icon name="volume-up" size={13} /></span>
                  ) : null}
                </button>
                <button className="tab__close" type="button" aria-label={`Close ${tab.title}`} title="Close tab" onClick={() => onClose(tab.id)}>
                  <Icon name="close" size={14} />
                </button>
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <button className="new-tab-button" type="button" aria-label="New tab" title="New tab (Ctrl+T)" onClick={onCreate}>
        <Icon name="plus" size={18} />
      </button>
    </div>
  );
}

