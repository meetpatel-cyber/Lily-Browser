/// <reference types="vite/client" />

import type { BrowserBounds, BrowserCommand, BrowserState } from "../shared/browser";

declare global {
  interface Window {
    lilyBrowser: {
      getState: () => Promise<BrowserState>;
      createTab: () => Promise<string>;
      selectTab: (tabId: string) => Promise<void>;
      closeTab: (tabId: string) => Promise<void>;
      navigate: (tabId: string, url: string) => Promise<void>;
      runCommand: (command: BrowserCommand) => Promise<void>;
      toggleBookmark: (tabId: string) => Promise<void>;
      removeBookmark: (bookmarkId: string) => Promise<void>;
      clearHistory: () => Promise<void>;
      openDownload: (downloadId: string) => Promise<void>;
      revealDownload: (downloadId: string) => Promise<void>;
      pauseDownload: (downloadId: string) => Promise<void>;
      resumeDownload: (downloadId: string) => Promise<void>;
      cancelDownload: (downloadId: string) => Promise<void>;
      setLibraryVisible: (visible: boolean) => void;
      setContentBounds: (bounds: BrowserBounds) => void;
      onStateChanged: (callback: (state: BrowserState) => void) => () => void;
      onCommand: (callback: (command: BrowserCommand) => void) => () => void;
    };
  }
}

export {};
