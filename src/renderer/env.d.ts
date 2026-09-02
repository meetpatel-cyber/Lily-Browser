/// <reference types="vite/client" />

import type { BrowserBounds, BrowserCommand, BrowserState, ClearBrowsingDataOptions } from "../shared/browser";

declare global {
  interface Window {
    lilyBrowser: {
      getState: () => Promise<BrowserState>;
      createTab: () => Promise<string>;
      selectTab: (tabId: string) => Promise<void>;
      closeTab: (tabId: string) => Promise<void>;
      navigate: (tabId: string, url: string) => Promise<void>;
      showTabContextMenu: (tabId: string) => Promise<void>;
      showTabGroupContextMenu: (groupId: string) => Promise<void>;
      updateTabGroup: (groupId: string, updates: Partial<import("../shared/browser").TabGroup>) => Promise<void>;
      runCommand: (command: BrowserCommand) => Promise<void>;
      toggleBookmark: (tabId: string) => Promise<void>;
      removeBookmark: (bookmarkId: string) => Promise<void>;
      updateBookmark: (bookmarkId: string, url: string, title: string, folderId?: string) => Promise<void>;
      addShortcut: (url: string, title: string) => Promise<void>;
      updateShortcut: (shortcutId: string, url: string, title: string) => Promise<void>;
      removeShortcut: (shortcutId: string) => Promise<void>;
      createBookmarkFolder: (name: string) => Promise<string>;
      renameBookmarkFolder: (folderId: string, name: string) => Promise<void>;
      deleteBookmarkFolder: (folderId: string) => Promise<boolean>;
      importBookmarks: () => Promise<void>;
      exportBookmarks: () => Promise<void>;
      clearHistory: () => Promise<void>;
      togglePrivateHistory: (enabled: boolean) => Promise<void>;
      clearBrowsingData: (options: ClearBrowsingDataOptions) => Promise<void>;
      resolvePermission: (reqId: string, decision: "allow" | "block" | "dismiss") => Promise<void>;
      removePermission: (origin: string, category: string) => Promise<void>;
      clearAllPermissions: () => Promise<void>;
      removeHistoryEntry: (historyId: string) => Promise<void>;
      openDownload: (downloadId: string) => Promise<void>;
      revealDownload: (downloadId: string) => Promise<void>;
      pauseDownload: (downloadId: string) => Promise<void>;
      resumeDownload: (downloadId: string) => Promise<void>;
      cancelDownload: (downloadId: string) => Promise<void>;
      removeDownload: (downloadId: string) => Promise<void>;
      retryDownload: (downloadId: string) => Promise<void>;
      clearCompletedDownloads: () => Promise<void>;
      findInPage: (tabId: string, text: string, forward?: boolean, findNext?: boolean) => Promise<void>;
      stopFindInPage: (tabId: string, keepSelection: boolean) => Promise<void>;
      setFindVisible: (tabId: string, visible: boolean) => Promise<void>;
      updatePreferences: (updates: Partial<import("../shared/browser").BrowserPreferences>) => Promise<void>;
      chooseNewTabBackground: () => Promise<void>;
      chooseDownloadLocation: () => Promise<string | undefined>;
      setLibraryVisible: (visible: boolean) => void;
      setContentBounds: (bounds: BrowserBounds) => void;
      onStateChanged: (callback: (state: BrowserState) => void) => () => void;
      onCommand: (callback: (command: BrowserCommand) => void) => () => void;
    };
  }
}

export {};
