import { contextBridge, ipcRenderer } from "electron";
import type { BrowserBounds, BrowserCommand, BrowserState } from "../shared/browser";

contextBridge.exposeInMainWorld("lilyBrowser", {
  getState: (): Promise<BrowserState> => ipcRenderer.invoke("browser:get-state"),
  createTab: (): Promise<string> => ipcRenderer.invoke("browser:create-tab"),
  selectTab: (tabId: string): Promise<void> => ipcRenderer.invoke("browser:select-tab", tabId),
  closeTab: (tabId: string): Promise<void> => ipcRenderer.invoke("browser:close-tab", tabId),
  navigate: (tabId: string, url: string): Promise<void> => ipcRenderer.invoke("browser:navigate", tabId, url),
  runCommand: (command: BrowserCommand): Promise<void> => ipcRenderer.invoke("browser:run-command", command),
  toggleBookmark: (tabId: string): Promise<void> => ipcRenderer.invoke("browser:toggle-bookmark", tabId),
  removeBookmark: (bookmarkId: string): Promise<void> => ipcRenderer.invoke("browser:remove-bookmark", bookmarkId),
  updateBookmark: (bookmarkId: string, url: string, title: string): Promise<void> => ipcRenderer.invoke("browser:update-bookmark", bookmarkId, url, title),
  clearHistory: (): Promise<void> => ipcRenderer.invoke("browser:clear-history"),
  removeHistoryEntry: (historyId: string): Promise<void> => ipcRenderer.invoke("browser:remove-history-entry", historyId),
  openDownload: (downloadId: string): Promise<void> => ipcRenderer.invoke("browser:open-download", downloadId),
  revealDownload: (downloadId: string): Promise<void> => ipcRenderer.invoke("browser:reveal-download", downloadId),
  pauseDownload: (downloadId: string): Promise<void> => ipcRenderer.invoke("browser:pause-download", downloadId),
  resumeDownload: (downloadId: string): Promise<void> => ipcRenderer.invoke("browser:resume-download", downloadId),
  cancelDownload: (downloadId: string): Promise<void> => ipcRenderer.invoke("browser:cancel-download", downloadId),
  findInPage: (tabId: string, text: string, forward?: boolean, findNext?: boolean) => ipcRenderer.invoke("browser:find-in-page", tabId, text, forward, findNext),
  stopFindInPage: (tabId: string, keepSelection: boolean): Promise<void> => ipcRenderer.invoke("browser:stop-find-in-page", tabId, keepSelection),
  setFindVisible: (tabId: string, visible: boolean): Promise<void> => ipcRenderer.invoke("browser:set-find-visible", tabId, visible),
  setLibraryVisible: (visible: boolean): void => ipcRenderer.send("browser:set-library-visible", visible),
  setContentBounds: (bounds: BrowserBounds): void => ipcRenderer.send("browser:set-content-bounds", bounds),
  onStateChanged: (callback: (state: BrowserState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: BrowserState) => callback(state);
    ipcRenderer.on("browser:state-changed", listener);
    return () => ipcRenderer.removeListener("browser:state-changed", listener);
  },
  onCommand: (callback: (command: BrowserCommand) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: BrowserCommand) => callback(command);
    ipcRenderer.on("browser:command", listener);
    return () => ipcRenderer.removeListener("browser:command", listener);
  }
});
