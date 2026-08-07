import { contextBridge, ipcRenderer } from "electron";
import type { BrowserBounds, BrowserCommand, BrowserState, ClearBrowsingDataOptions } from "../shared/browser";

contextBridge.exposeInMainWorld("lilyBrowser", {
  getState: (): Promise<BrowserState> => ipcRenderer.invoke("browser:get-state"),
  createTab: (): Promise<string> => ipcRenderer.invoke("browser:create-tab"),
  selectTab: (tabId: string): Promise<void> => ipcRenderer.invoke("browser:select-tab", tabId),
  closeTab: (tabId: string): Promise<void> => ipcRenderer.invoke("browser:close-tab", tabId),
  navigate: (tabId: string, url: string): Promise<void> => ipcRenderer.invoke("browser:navigate", tabId, url),
  showTabContextMenu: (tabId: string): Promise<void> => ipcRenderer.invoke("browser:show-tab-context-menu", tabId),
  showTabGroupContextMenu: (groupId: string): Promise<void> => ipcRenderer.invoke("browser:show-tab-group-context-menu", groupId),
  updateTabGroup: (groupId: string, updates: Partial<import("../shared/browser").TabGroup>): Promise<void> => ipcRenderer.invoke("browser:update-tab-group", groupId, updates),
  runCommand: (command: BrowserCommand): Promise<void> => ipcRenderer.invoke("browser:run-command", command),
  toggleBookmark: (tabId: string): Promise<void> => ipcRenderer.invoke("browser:toggle-bookmark", tabId),
  removeBookmark: (bookmarkId: string): Promise<void> => ipcRenderer.invoke("browser:remove-bookmark", bookmarkId),
  updateBookmark: (bookmarkId: string, url: string, title: string, folderId?: string): Promise<void> => ipcRenderer.invoke("browser:update-bookmark", bookmarkId, url, title, folderId),
  createBookmarkFolder: (name: string): Promise<string> => ipcRenderer.invoke("browser:create-bookmark-folder", name),
  renameBookmarkFolder: (folderId: string, name: string): Promise<void> => ipcRenderer.invoke("browser:rename-bookmark-folder", folderId, name),
  deleteBookmarkFolder: (folderId: string): Promise<boolean> => ipcRenderer.invoke("browser:delete-bookmark-folder", folderId),
  clearHistory: (): Promise<void> => ipcRenderer.invoke("browser:clear-history"),
  clearBrowsingData: (options: ClearBrowsingDataOptions) => ipcRenderer.invoke("browser:clear-browsing-data", options),
  resolvePermission: (reqId: string, decision: "allow" | "block" | "dismiss") => ipcRenderer.invoke("browser:resolve-permission", reqId, decision),
  removePermission: (origin: string, category: string) => ipcRenderer.invoke("browser:remove-permission", origin, category),
  clearAllPermissions: () => ipcRenderer.invoke("browser:clear-all-permissions"),
  removeHistoryEntry: (historyId: string): Promise<void> => ipcRenderer.invoke("browser:remove-history-entry", historyId),
  openDownload: (downloadId: string): Promise<void> => ipcRenderer.invoke("browser:open-download", downloadId),
  revealDownload: (downloadId: string): Promise<void> => ipcRenderer.invoke("browser:reveal-download", downloadId),
  pauseDownload: (downloadId: string): Promise<void> => ipcRenderer.invoke("browser:pause-download", downloadId),
  resumeDownload: (downloadId: string): Promise<void> => ipcRenderer.invoke("browser:resume-download", downloadId),
  cancelDownload: (downloadId: string): Promise<void> => ipcRenderer.invoke("browser:cancel-download", downloadId),
  removeDownload: (downloadId: string): Promise<void> => ipcRenderer.invoke("browser:remove-download", downloadId),
  retryDownload: (downloadId: string): Promise<void> => ipcRenderer.invoke("browser:retry-download", downloadId),
  clearCompletedDownloads: (): Promise<void> => ipcRenderer.invoke("browser:clear-completed-downloads"),
  findInPage: (tabId: string, text: string, forward?: boolean, findNext?: boolean) => ipcRenderer.invoke("browser:find-in-page", tabId, text, forward, findNext),
  stopFindInPage: (tabId: string, keepSelection: boolean): Promise<void> => ipcRenderer.invoke("browser:stop-find-in-page", tabId, keepSelection),
  setFindVisible: (tabId: string, visible: boolean): Promise<void> => ipcRenderer.invoke("browser:set-find-visible", tabId, visible),
  updatePreferences: (updates: Partial<import("../shared/browser").BrowserPreferences>): Promise<void> => ipcRenderer.invoke("browser:update-preferences", updates),
  chooseDownloadLocation: (): Promise<string | undefined> => ipcRenderer.invoke("browser:choose-download-location"),
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
