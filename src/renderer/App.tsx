import { useCallback, useEffect, useRef, useState } from "react";
import type { BrowserCommand, BrowserState } from "../shared/browser";
import { LibraryPanel, type LibrarySection } from "./components/LibraryPanel";
import { NewTabPage } from "./components/NewTabPage";
import { TabStrip } from "./components/TabStrip";
import { Toolbar } from "./components/Toolbar";
import { FindInPage } from "./components/FindInPage";
import { addressLabel, toNavigationUrl } from "./lib/navigation";

const emptyState: BrowserState = { tabs: [], activeTabId: "", bookmarks: [], history: [], downloads: [] };

export default function App() {
  const [browserState, setBrowserState] = useState<BrowserState>(emptyState);
  const [address, setAddress] = useState("");
  const [librarySection, setLibrarySection] = useState<LibrarySection | null>(null);
  const browserSurfaceRef = useRef<HTMLElement | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const findInputRef = useRef<HTMLInputElement | null>(null);

  const activeTab = browserState.tabs.find((tab) => tab.id === browserState.activeTabId);
  const isBookmarked = Boolean(activeTab?.url && browserState.bookmarks.some((bookmark) => bookmark.url === activeTab.url));

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const librarySectionRef = useRef(librarySection);
  librarySectionRef.current = librarySection;

  useEffect(() => {
    let live = true;
    void window.lilyBrowser.getState().then((state) => {
      if (live) setBrowserState(state);
    });
    const removeStateListener = window.lilyBrowser.onStateChanged(setBrowserState);
    const removeCommandListener = window.lilyBrowser.onCommand((command) => {
      if (command === "focus-address") {
        addressInputRef.current?.focus();
        addressInputRef.current?.select();
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

  useEffect(() => () => window.lilyBrowser.setLibraryVisible(false), []);

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
    window.lilyBrowser.setLibraryVisible(false);
  }, []);

  const openLibrary = useCallback((section: LibrarySection = "bookmarks") => {
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

  const submitAddress = useCallback((value = address) => {
    if (!activeTab) return;
    const destination = toNavigationUrl(value);
    if (destination) {
      closeLibrary();
      void window.lilyBrowser.navigate(activeTab.id, destination);
    }
  }, [activeTab, address, closeLibrary]);

  const openLibraryUrl = useCallback((url: string) => {
    closeLibrary();
    void window.lilyBrowser.createTab().then((tabId) => window.lilyBrowser.navigate(tabId, url));
  }, [closeLibrary]);

  const handleRemoveHistory = useCallback((historyId: string) => {
    void window.lilyBrowser.removeHistoryEntry(historyId);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && librarySection) {
        event.preventDefault();
        closeLibrary();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeLibrary, executeCommand, handleCreateTab, handleHome, librarySection]);

  useEffect(() => {
    if (librarySectionRef.current) {
      closeLibrary();
    }
  }, [activeTab?.id, closeLibrary]);

  return (
    <main className="browser-shell">
      <header className="browser-chrome">
        <TabStrip
          tabs={browserState.tabs}
          activeTabId={browserState.activeTabId}
          onSelect={handleSelectTab}
          onClose={(tabId) => void window.lilyBrowser.closeTab(tabId)}
          onCreate={handleCreateTab}
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
        />
        {activeTab?.findState?.visible && (
          <FindInPage 
            tabId={activeTab.id} 
            findState={activeTab.findState}
            inputRef={findInputRef}
            onClose={() => void window.lilyBrowser.setFindVisible(activeTab.id, false)} 
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
          onClearHistory={() => {
            if (window.confirm("Clear all browsing history?")) void window.lilyBrowser.clearHistory();
          }}
          onRemoveHistory={handleRemoveHistory}
          onOpenDownload={(downloadId) => void window.lilyBrowser.openDownload(downloadId)}
          onRevealDownload={(downloadId) => void window.lilyBrowser.revealDownload(downloadId)}
          onPauseDownload={(downloadId) => void window.lilyBrowser.pauseDownload(downloadId)}
          onResumeDownload={(downloadId) => void window.lilyBrowser.resumeDownload(downloadId)}
          onCancelDownload={(downloadId) => void window.lilyBrowser.cancelDownload(downloadId)}
        /> : activeTab?.isNewTab && <NewTabPage key={activeTab.id} onNavigate={submitAddress} />}
      </section>
    </main>
  );
}
