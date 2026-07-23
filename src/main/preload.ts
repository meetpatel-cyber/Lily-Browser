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
  clearHistory: (): Promise<void> => ipcRenderer.invoke("browser:clear-history"),
  openDownload: (downloadId: string): Promise<void> => ipcRenderer.invoke("browser:open-download", downloadId),
  revealDownload: (downloadId: string): Promise<void> => ipcRenderer.invoke("browser:reveal-download", downloadId),
  pauseDownload: (downloadId: string): Promise<void> => ipcRenderer.invoke("browser:pause-download", downloadId),
  resumeDownload: (downloadId: string): Promise<void> => ipcRenderer.invoke("browser:resume-download", downloadId),
  cancelDownload: (downloadId: string): Promise<void> => ipcRenderer.invoke("browser:cancel-download", downloadId),
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
