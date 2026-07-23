import { useCallback, useEffect, useRef, useState } from "react";
import type { BrowserCommand, BrowserState } from "../shared/browser";
import { LibraryPanel, type LibrarySection } from "./components/LibraryPanel";
import { NewTabPage } from "./components/NewTabPage";
import { TabStrip } from "./components/TabStrip";
import { Toolbar } from "./components/Toolbar";
import { addressLabel, toNavigationUrl } from "./lib/navigation";

const emptyState: BrowserState = { tabs: [], activeTabId: "", bookmarks: [], history: [], downloads: [] };

export default function App() {
  const [browserState, setBrowserState] = useState<BrowserState>(emptyState);
  const [address, setAddress] = useState("");
  const [librarySection, setLibrarySection] = useState<LibrarySection | null>(null);
  const browserSurfaceRef = useRef<HTMLElement | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);

  const activeTab = browserState.tabs.find((tab) => tab.id === browserState.activeTabId);
  const isBookmarked = Boolean(activeTab?.url && browserState.bookmarks.some((bookmark) => bookmark.url === activeTab.url));

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

  const submitAddress = useCallback((value = address) => {
    if (!activeTab) return;
    const destination = toNavigationUrl(value);
    if (destination) {
      void window.lilyBrowser.navigate(activeTab.id, destination);
    }
  }, [activeTab, address]);

  const openLibraryUrl = useCallback((url: string) => {
    closeLibrary();
    void window.lilyBrowser.createTab().then((tabId) => window.lilyBrowser.navigate(tabId, url));
  }, [closeLibrary]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (modifier && key === "l") {
        event.preventDefault();
        void window.lilyBrowser.runCommand("focus-address");
      } else if (modifier && key === "t") {
        event.preventDefault();
        executeCommand("new-tab");
      } else if (modifier && key === "w") {
        event.preventDefault();
        executeCommand("close-tab");
      } else if (modifier && key === "r") {
        event.preventDefault();
        executeCommand("reload");
      } else if (event.key === "F5") {
        event.preventDefault();
        executeCommand("reload");
      } else if (event.altKey && event.key === "ArrowLeft") {
        event.preventDefault();
        executeCommand("back");
      } else if (event.altKey && event.key === "ArrowRight") {
        event.preventDefault();
        executeCommand("forward");
      } else if (event.altKey && event.key === "Home") {
        event.preventDefault();
        executeCommand("home");
      } else if (event.key === "Escape" && librarySection) {
        event.preventDefault();
        closeLibrary();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeLibrary, executeCommand, librarySection]);

  return (
    <main className="browser-shell">
      <header className="browser-chrome">
        <TabStrip
          tabs={browserState.tabs}
          activeTabId={browserState.activeTabId}
          onSelect={(tabId) => void window.lilyBrowser.selectTab(tabId)}
          onClose={(tabId) => void window.lilyBrowser.closeTab(tabId)}
          onCreate={() => void window.lilyBrowser.createTab()}
        />
        <Toolbar
          address={address}
          isLoading={Boolean(activeTab?.isLoading)}
          canGoBack={Boolean(activeTab?.canGoBack)}
          canGoForward={Boolean(activeTab?.canGoForward)}
          addressRef={addressInputRef}
          onAddressChange={setAddress}
          onSubmit={() => submitAddress()}
          onBack={() => executeCommand("back")}
          onForward={() => executeCommand("forward")}
          onReload={() => executeCommand("reload")}
          onHome={() => executeCommand("home")}
          canBookmark={Boolean(activeTab && !activeTab.isNewTab && !activeTab.isLoading && !activeTab.error && activeTab.url)}
          isBookmarked={isBookmarked}
          onToggleBookmark={() => activeTab && void window.lilyBrowser.toggleBookmark(activeTab.id)}
          onOpenLibrary={() => openLibrary()}
        />
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
          onOpenDownload={(downloadId) => void window.lilyBrowser.openDownload(downloadId)}
          onRevealDownload={(downloadId) => void window.lilyBrowser.revealDownload(downloadId)}
        /> : activeTab?.isNewTab && <NewTabPage onNavigate={submitAddress} />}
      </section>
    </main>
  );
}
