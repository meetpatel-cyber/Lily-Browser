import { useCallback, useEffect, useRef, useState } from "react";
import type { BrowserCommand, BrowserState } from "../shared/browser";
import { LibraryPanel, type LibrarySection } from "./components/LibraryPanel";
import { NewTabPage } from "./components/NewTabPage";
import { TabStrip } from "./components/TabStrip";
import { Toolbar } from "./components/Toolbar";
import { SettingsPanel } from "./components/SettingsPanel";
import { FindInPage } from "./components/FindInPage";
import { PermissionBanner } from "./components/PermissionBanner";
import { TabSearch } from "./components/TabSearch";
import { addressLabel, toNavigationUrl } from "./lib/navigation";

const emptyState: BrowserState = { tabs: [], tabGroups: {}, activeTabId: "", bookmarks: [], history: [], downloads: [], preferences: { searchEngine: "duckduckgo", startupBehavior: "continue", downloadLocation: "", askWhereToSave: false, appearance: "system" }, permissions: {}, pendingPermissions: [], effectiveTheme: "light" };

export default function App() {
  const [browserState, setBrowserState] = useState<BrowserState>(emptyState);
  const [address, setAddress] = useState("");
  const [librarySection, setLibrarySection] = useState<LibrarySection | null>(null);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [isTabSearchVisible, setIsTabSearchVisible] = useState(false);
  const browserSurfaceRef = useRef<HTMLElement | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const findInputRef = useRef<HTMLInputElement | null>(null);

  const activeTab = browserState.tabs.find((tab) => tab.id === browserState.activeTabId);
  const isBookmarked = Boolean(activeTab?.url && browserState.bookmarks.some((bookmark) => bookmark.url === activeTab.url));

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const librarySectionRef = useRef(librarySection);
  librarySectionRef.current = librarySection;

  const isSettingsVisibleRef = useRef(isSettingsVisible);
  isSettingsVisibleRef.current = isSettingsVisible;

  const isTabSearchVisibleRef = useRef(isTabSearchVisible);
  isTabSearchVisibleRef.current = isTabSearchVisible;

  useEffect(() => {
    let live = true;
    void window.lilyBrowser.getState().then((state) => {
      if (live) setBrowserState(state);
    });
    const removeStateListener = window.lilyBrowser.onStateChanged(setBrowserState);
    const removeCommandListener = window.lilyBrowser.onCommand((command) => {
      if (command === "focus-address") {
        if (isTabSearchVisibleRef.current) setIsTabSearchVisible(false);
        addressInputRef.current?.focus();
        addressInputRef.current?.select();
      } else if (command === "tab-search") {
        setIsTabSearchVisible(true);
      } else if (command === "find") {
        const active = activeTabRef.current;
        if (active && !active.isNewTab && !librarySectionRef.current) {
          if (!active.findState?.visible) {
            void window.lilyBrowser.setFindVisible(active.id, true);
          } else {
            findInputRef.current?.focus();
            findInputRef.current?.select();
          }
        }
      }
    });
    return () => {
      live = false;
      removeStateListener();
      removeCommandListener();
    };
  }, []);

  useEffect(() => {
    window.lilyBrowser.setLibraryVisible(!!librarySection || isSettingsVisible || isTabSearchVisible);
  }, [librarySection, isSettingsVisible, isTabSearchVisible]);

  useEffect(() => {
    setAddress(activeTab?.url ? addressLabel(activeTab.url) : "");
  }, [activeTab?.id, activeTab?.url]);

  useEffect(() => {
    const surface = browserSurfaceRef.current;
    if (!surface) return;

    const reportBounds = () => {
      const bounds = surface.getBoundingClientRect();
      window.lilyBrowser.setContentBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
    };
    const observer = new ResizeObserver(reportBounds);
    observer.observe(surface);
    reportBounds();
    return () => observer.disconnect();
  }, []);

  const executeCommand = useCallback((command: BrowserCommand) => {
    void window.lilyBrowser.runCommand(command);
  }, []);

  const closeLibrary = useCallback(() => {
    setLibrarySection(null);
    setIsSettingsVisible(false);
    setIsTabSearchVisible(false);
    window.lilyBrowser.setLibraryVisible(false);
  }, []);

  const openLibrary = useCallback((section: LibrarySection = "bookmarks") => {
    setIsSettingsVisible(false);
    setLibrarySection(section);
    window.lilyBrowser.setLibraryVisible(true);
  }, []);

  const toggleLibrary = useCallback((section: LibrarySection = "bookmarks") => {
    if (librarySection) {
      closeLibrary();
    } else {
      openLibrary(section);
    }
  }, [closeLibrary, librarySection, openLibrary]);

  const toggleSettings = useCallback(() => {
    if (isSettingsVisible) {
      closeLibrary();
    } else {
      setLibrarySection(null);
      setIsSettingsVisible(true);
      window.lilyBrowser.setLibraryVisible(true);
    }
  }, [closeLibrary, isSettingsVisible]);

  const handleCreateTab = useCallback(() => {
    closeLibrary();
    void window.lilyBrowser.createTab();
  }, [closeLibrary]);

  const handleSelectTab = useCallback((tabId: string) => {
    closeLibrary();
    void window.lilyBrowser.selectTab(tabId);
  }, [closeLibrary]);

  const handleHome = useCallback(() => {
    closeLibrary();
    executeCommand("home");
  }, [closeLibrary, executeCommand]);

  const submitAddress = useCallback(
    (value: string = address) => {
      if (!activeTab || !value.trim()) return;
      const destination = toNavigationUrl(value, browserState.preferences.searchEngine);
      if (destination) {
        closeLibrary();
        void window.lilyBrowser.navigate(activeTab.id, destination);
      }
    },
    [activeTab, address, closeLibrary, browserState.preferences.searchEngine]
  );

  const openLibraryUrl = useCallback((url: string) => {
    closeLibrary();
    void window.lilyBrowser.createTab().then((tabId) => window.lilyBrowser.navigate(tabId, url));
  }, [closeLibrary]);

  const handleRemoveHistory = useCallback((historyId: string) => {
    void window.lilyBrowser.removeHistoryEntry(historyId);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (isTabSearchVisibleRef.current) {
          event.preventDefault();
          setIsTabSearchVisible(false);
        } else if (librarySectionRef.current || isSettingsVisibleRef.current) {
          event.preventDefault();
          closeLibrary();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeLibrary]);

  useEffect(() => {
    if (librarySectionRef.current || isSettingsVisibleRef.current) {
      closeLibrary();
    }
  }, [activeTab?.id, closeLibrary]);

  const activePendingPermission = browserState.pendingPermissions?.find(p => p.tabId === browserState.activeTabId);

  return (
    <main className={`browser-shell theme-${browserState.effectiveTheme || "light"}`}>
      <header className="browser-chrome">
        <TabStrip
          tabs={browserState.tabs}
          tabGroups={browserState.tabGroups}
          activeTabId={browserState.activeTabId}
          onSelect={handleSelectTab}
          onClose={(tabId) => void window.lilyBrowser.closeTab(tabId)}
          onCreate={handleCreateTab}
          onContextMenu={(tabId) => void window.lilyBrowser.showTabContextMenu(tabId)}
        />
        <Toolbar
          address={address}
          activeUrl={activeTab?.url}
          hasError={Boolean(activeTab?.error)}
          isLoading={Boolean(activeTab?.isLoading)}
          canGoBack={Boolean(activeTab?.canGoBack)}
          canGoForward={Boolean(activeTab?.canGoForward)}
          addressRef={addressInputRef}
          onAddressChange={setAddress}
          onSubmit={() => submitAddress()}
          onBack={() => executeCommand("back")}
          onForward={() => executeCommand("forward")}
          onReload={() => executeCommand("reload")}
          onHome={handleHome}
          canBookmark={Boolean(activeTab && !activeTab.isNewTab && !activeTab.isLoading && !activeTab.error && activeTab.url)}
          isBookmarked={isBookmarked}
          onToggleBookmark={() => activeTab && void window.lilyBrowser.toggleBookmark(activeTab.id)}
          onOpenLibrary={() => toggleLibrary()}
          onOpenSettings={() => toggleSettings()}
        />
        {activeTab?.findState?.visible && (
          <FindInPage 
            tabId={activeTab.id} 
            findState={activeTab.findState}
            inputRef={findInputRef}
            onClose={() => void window.lilyBrowser.setFindVisible(activeTab.id, false)} 
          />
        )}
        {activePendingPermission && !librarySection && !isSettingsVisible && (
          <PermissionBanner 
            request={activePendingPermission} 
            onResolve={(reqId, decision) => void window.lilyBrowser.resolvePermission(reqId, decision)} 
          />
        )}
      </header>
      <section className="browser-surface" ref={browserSurfaceRef} aria-label="Browser content">
        {librarySection ? <LibraryPanel
          section={librarySection}
          bookmarks={browserState.bookmarks}
          history={browserState.history}
          downloads={browserState.downloads}
          onSectionChange={setLibrarySection}
          onClose={closeLibrary}
          onOpenUrl={openLibraryUrl}
          onRemoveBookmark={(bookmarkId) => void window.lilyBrowser.removeBookmark(bookmarkId)}
          onUpdateBookmark={(bookmarkId, url, title) => void window.lilyBrowser.updateBookmark(bookmarkId, url, title)}
          onClearHistory={() => {
            if (window.confirm("Clear all browsing history?")) void window.lilyBrowser.clearHistory();
          }}
          onRemoveHistory={handleRemoveHistory}
          onOpenDownload={(downloadId) => void window.lilyBrowser.openDownload(downloadId)}
          onRevealDownload={(downloadId) => void window.lilyBrowser.revealDownload(downloadId)}
          onPauseDownload={(downloadId) => void window.lilyBrowser.pauseDownload(downloadId)}
          onResumeDownload={(downloadId) => void window.lilyBrowser.resumeDownload(downloadId)}
          onCancelDownload={(downloadId) => void window.lilyBrowser.cancelDownload(downloadId)}
        /> : isSettingsVisible && browserState.preferences ? <SettingsPanel
          preferences={browserState.preferences}
          permissions={browserState.permissions}
          onUpdatePreferences={(updates) => void window.lilyBrowser.updatePreferences(updates)}
          onClose={closeLibrary}
        /> : activeTab?.isNewTab && <NewTabPage key={activeTab.id} onNavigate={submitAddress} />}
      </section>

      {isTabSearchVisible && (
        <TabSearch
          tabs={browserState.tabs}
          activeTabId={activeTab?.id}
          onClose={() => setIsTabSearchVisible(false)}
          onSelect={handleSelectTab}
        />
      )}
    </main>
  );
}
