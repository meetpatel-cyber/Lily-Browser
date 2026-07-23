import { app, BrowserWindow, dialog, ipcMain, Menu, type MenuItemConstructorOptions, session, shell, WebContentsView } from "electron";
import path from "node:path";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { BrowserBounds, BrowserCommand, BrowserState, BrowserTab, DownloadRecord } from "../shared/browser";
import { BrowserDataStore, type SessionSnapshot, type StoredDownload } from "./storage";

interface TabRecord {
  state: BrowserTab;
  view?: WebContentsView;
  lastHistoryVisit?: { id: string; url: string; recordedAt: number };
  lastFailedUrl?: string;
}

const MAX_URL_LENGTH = 8_192;
const HISTORY_DEDUPLICATION_WINDOW = 15_000;
const validCommands = new Set<BrowserCommand>(["new-tab", "close-tab", "back", "forward", "reload", "home", "focus-address"]);

let mainWindow: BrowserWindow | null = null;
let browserBounds: BrowserBounds | null = null;
let activeTabId = "";
let libraryVisible = false;
let isRestoringSession = false;
let sessionSaved = false;
let forceCloseForActiveDownloads = false;
let dataStore: BrowserDataStore;
let downloads: StoredDownload[] = [];
const tabs = new Map<string, TabRecord>();
const recentHistoryUrls = new Map<string, number>();

const isDevelopment = Boolean(process.env.ELECTRON_RENDERER_URL);

interface ActiveDownloadTracker {
  item: Electron.DownloadItem;
  lastBytes: number;
  lastTime: number;
}

const activeDownloads = new Map<string, ActiveDownloadTracker>();

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0 || !Number.isFinite(bytesPerSec)) return "";
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
  const units = ["KB/s", "MB/s", "GB/s"];
  let value = bytesPerSec / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function toPublicDownload(download: StoredDownload): DownloadRecord {
  return {
    id: download.id,
    filename: download.filename,
    url: download.url,
    receivedBytes: download.receivedBytes,
    totalBytes: download.totalBytes,
    status: download.status,
    startedAt: download.startedAt,
    completedAt: download.completedAt,
    error: download.error,
    speed: download.status === "in-progress" && !download.isPaused ? download.speed : undefined,
    isPaused: download.isPaused,
    canResume: download.canResume
  };
}

function getSnapshot(): BrowserState {
  return {
    tabs: [...tabs.values()].map(({ state }) => ({ ...state })),
    activeTabId,
    bookmarks: dataStore.getBookmarks(),
    history: dataStore.getHistory(),
    downloads: downloads.map(toPublicDownload)
  };
}

function publishState(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("browser:state-changed", getSnapshot());
  }
}

function activeRecord(): TabRecord | undefined {
  return tabs.get(activeTabId);
}

function isAllowedNavigation(url: string): boolean {
  if (url.length > MAX_URL_LENGTH) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isAllowedFaviconUrl(url: string): boolean {
  if (typeof url !== "string" || !url || url.length > 8_192) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "data:";
  } catch {
    return false;
  }
}

function fallbackTitle(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || "Untitled";
  } catch {
    return "Untitled";
  }
}

function updateNavigationAvailability(record: TabRecord): void {
  const contents = record.view?.webContents;
  if (!contents || contents.isDestroyed()) {
    record.state.canGoBack = false;
    record.state.canGoForward = false;
    return;
  }
  record.state.canGoBack = contents.canGoBack();
  record.state.canGoForward = contents.canGoForward();
}

function applyViewLayout(): void {
  const active = activeRecord();
  for (const record of tabs.values()) {
    record.view?.setVisible(record === active && !record.state.isNewTab && !libraryVisible);
  }
  if (!libraryVisible && active?.view && browserBounds) {
    active.view.setBounds(browserBounds);
  }
}

function syncVisibleState(): void {
  const record = activeRecord();
  if (record) updateNavigationAvailability(record);
  applyViewLayout();
  publishState();
}

function makeNewTab(): TabRecord {
  return {
    state: {
      id: randomUUID(),
      title: "New Tab",
      url: "",
      favicon: undefined,
      isNewTab: true,
      isLoading: false,
      canGoBack: false,
      canGoForward: false
    }
  };
}

function sessionSnapshot(): SessionSnapshot {
  const sessionTabs: Array<{ url: string }> = [];
  let activeIndex = 0;
  for (const record of tabs.values()) {
    const url = record.state.isNewTab ? "" : record.state.error || !isAllowedNavigation(record.state.url) ? undefined : record.state.url;
    if (url === undefined) continue;
    if (record.state.id === activeTabId) activeIndex = sessionTabs.length;
    sessionTabs.push({ url });
  }
  return { tabs: sessionTabs, activeIndex };
}

function persistSession(): void {
  if (dataStore && !isRestoringSession && !sessionSaved) dataStore.saveSession(sessionSnapshot());
}

function releaseView(record: TabRecord): void {
  if (!record.view) return;
  const view = record.view;
  record.view = undefined;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.contentView.removeChildView(view);
  if (!view.webContents.isDestroyed()) view.webContents.close();
}

function showNavigationFailure(record: TabRecord, message: string): void {
  record.state.isLoading = false;
  record.state.favicon = undefined;
  record.state.error = message;
  record.state.title = "Page unavailable";
  record.lastFailedUrl = record.state.url;
  updateNavigationAvailability(record);
  persistSession();
  publishState();
}

function recordHistoryVisit(record: TabRecord): void {
  const { url, title, error, isNewTab } = record.state;
  if (isNewTab || error || record.lastFailedUrl === url || !isAllowedNavigation(url)) return;
  const now = Date.now();
  const lastVisit = record.lastHistoryVisit;
  const recentlyVisited = recentHistoryUrls.get(url) ?? 0;
  if ((lastVisit?.url === url && now - lastVisit.recordedAt < HISTORY_DEDUPLICATION_WINDOW) || now - recentlyVisited < HISTORY_DEDUPLICATION_WINDOW) {
    return;
  }
  const entry = dataStore.recordHistory(url, title || fallbackTitle(url));
  record.lastHistoryVisit = { id: entry.id, url, recordedAt: now };
  recentHistoryUrls.set(url, now);
  if (recentHistoryUrls.size > 200) {
    const oldest = [...recentHistoryUrls.entries()].sort((a, b) => a[1] - b[1]).slice(0, 50);
    oldest.forEach(([historyUrl]) => recentHistoryUrls.delete(historyUrl));
  }
  publishState();
}

function updateHistoryTitle(record: TabRecord): void {
  const lastVisit = record.lastHistoryVisit;
  if (lastVisit?.url === record.state.url) {
    dataStore.updateHistoryTitle(lastVisit.id, record.state.title || fallbackTitle(record.state.url));
  }
}

function attachBrowserEvents(record: TabRecord, view: WebContentsView): void {
  const contents = view.webContents;
  contents.setWindowOpenHandler(({ url }) => {
    if (isAllowedNavigation(url)) createTab(url, true);
    return { action: "deny" };
  });
  contents.on("will-navigate", (event, url) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault();
      showNavigationFailure(record, "Lily Browser only opens web addresses over HTTP or HTTPS.");
    }
  });
  contents.on("did-start-loading", () => {
    record.state.isLoading = true;
    record.state.favicon = undefined;
    if (record.lastFailedUrl !== record.state.url) record.state.error = undefined;
    publishState();
  });
  contents.on("did-stop-loading", () => {
    record.state.isLoading = false;
    updateNavigationAvailability(record);
    publishState();
  });
  contents.on("page-favicon-updated", (_event, favicons) => {
    if (Array.isArray(favicons) && favicons.length > 0 && isAllowedFaviconUrl(favicons[0])) {
      record.state.favicon = favicons[0];
      publishState();
    }
  });
  const updateUrl = (_event: Electron.Event, url: string) => {
    record.state.url = url;
    record.state.isNewTab = false;
    record.state.error = undefined;
    if (record.lastFailedUrl !== url) record.lastFailedUrl = undefined;
    updateNavigationAvailability(record);
    persistSession();
    publishState();
  };
  contents.on("did-navigate", updateUrl);
  contents.on("did-navigate-in-page", updateUrl);
  contents.on("page-title-updated", (event, title) => {
    event.preventDefault();
    record.state.title = title.trim() || fallbackTitle(record.state.url);
    updateHistoryTitle(record);
    publishState();
  });
  contents.on("did-finish-load", () => recordHistoryVisit(record));
  contents.on("did-fail-load", (_event, errorCode, errorDescription, _validatedUrl, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) showNavigationFailure(record, errorDescription);
  });
  contents.on("render-process-gone", () => showNavigationFailure(record, "The page process stopped unexpectedly."));
  contents.on("before-input-event", (event, input) => {
    const command = commandFromInput(input);
    if (command) {
      event.preventDefault();
      runBrowserCommand(command);
    }
  });
}

function ensureView(record: TabRecord): WebContentsView {
  if (record.view) return record.view;
  const view = new WebContentsView({
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true }
  });
  record.view = view;
  mainWindow?.contentView.addChildView(view);
  view.setVisible(false);
  attachBrowserEvents(record, view);
  return view;
}

function navigateTab(tabId: string, url: string): void {
  const record = tabs.get(tabId);
  if (!record || !isAllowedNavigation(url)) return;
  const view = ensureView(record);
  record.lastFailedUrl = undefined;
  record.state = { ...record.state, url, title: fallbackTitle(url), favicon: undefined, isNewTab: false, isLoading: true, error: undefined };
  if (tabId === activeTabId) applyViewLayout();
  persistSession();
  publishState();
  void view.webContents.loadURL(url).catch((error: Error) => {
    if (!view.webContents.isDestroyed()) showNavigationFailure(record, error.message || "The page could not be loaded.");
  });
}

function createTab(url?: string, activate = true): string {
  libraryVisible = false;
  const record = makeNewTab();
  tabs.set(record.state.id, record);
  if (activate || !activeTabId) activeTabId = record.state.id;
  if (url) navigateTab(record.state.id, url);
  else {
    persistSession();
    syncVisibleState();
  }
  return record.state.id;
}

function selectTab(tabId: string): void {
  if (!tabs.has(tabId)) return;
  libraryVisible = false;
  activeTabId = tabId;
  persistSession();
  syncVisibleState();
}

function closeTab(tabId: string): void {
  const orderedTabs = [...tabs.values()];
  const index = orderedTabs.findIndex((record) => record.state.id === tabId);
  const record = tabs.get(tabId);
  if (!record || index === -1) return;
  releaseView(record);
  tabs.delete(tabId);
  if (tabs.size === 0) {
    activeTabId = "";
    createTab();
    return;
  }
  if (activeTabId === tabId) activeTabId = (orderedTabs[index - 1] ?? orderedTabs[index + 1]).state.id;
  persistSession();
  syncVisibleState();
}

function openHome(tabId: string): void {
  const record = tabs.get(tabId);
  if (!record) return;
  releaseView(record);
  record.state = { ...record.state, title: "New Tab", url: "", favicon: undefined, isNewTab: true, isLoading: false, canGoBack: false, canGoForward: false, error: undefined };
  persistSession();
  if (tabId === activeTabId) syncVisibleState();
  else publishState();
}

function toggleBookmark(tabId: string): void {
  const record = tabs.get(tabId);
  if (!record || record.state.isNewTab || record.state.isLoading || record.state.error || !isAllowedNavigation(record.state.url)) return;
  dataStore.toggleBookmark(record.state.url, record.state.title || fallbackTitle(record.state.url));
  publishState();
}

function runBrowserCommand(command: BrowserCommand): void {
  const active = activeRecord();
  switch (command) {
    case "new-tab": createTab(); break;
    case "close-tab": if (active) closeTab(active.state.id); break;
    case "back": if (active?.view?.webContents.canGoBack()) active.view.webContents.goBack(); break;
    case "forward": if (active?.view?.webContents.canGoForward()) active.view.webContents.goForward(); break;
    case "reload": if (active?.view && !active.state.isNewTab) active.view.webContents.reload(); break;
    case "home": if (active) openHome(active.state.id); break;
    case "focus-address": mainWindow?.webContents.send("browser:command", command); break;
  }
}

function commandFromInput(input: Electron.Input): BrowserCommand | undefined {
  const commandModifier = input.control || input.meta;
  if (commandModifier && input.key.toLowerCase() === "t") return "new-tab";
  if (commandModifier && input.key.toLowerCase() === "w") return "close-tab";
  if (commandModifier && input.key.toLowerCase() === "l") return "focus-address";
  if (commandModifier && input.key.toLowerCase() === "r") return "reload";
  if (input.key === "F5") return "reload";
  if (input.alt && input.key === "Left") return "back";
  if (input.alt && input.key === "Right") return "forward";
  if (input.alt && input.key === "Home") return "home";
  return undefined;
}

function registerDownloadHandler(): void {
  session.defaultSession.on("will-download", (_event, item) => {
    const downloadId = randomUUID();
    const now = Date.now();
    const download: StoredDownload = {
      id: downloadId,
      filename: item.getFilename() || "download",
      url: item.getURL(),
      receivedBytes: item.getReceivedBytes(),
      totalBytes: item.getTotalBytes(),
      status: "in-progress",
      startedAt: now,
      isPaused: false,
      canResume: item.canResume()
    };

    activeDownloads.set(downloadId, {
      item,
      lastBytes: item.getReceivedBytes(),
      lastTime: now
    });

    downloads.unshift(download);
    publishState();

    item.on("updated", (_updateEvent, state) => {
      const tracker = activeDownloads.get(downloadId);
      download.receivedBytes = item.getReceivedBytes();
      download.totalBytes = item.getTotalBytes();
      download.isPaused = item.isPaused();
      download.canResume = item.canResume();

      if (tracker && !download.isPaused && state !== "interrupted") {
        const currentTime = Date.now();
        const deltaTime = (currentTime - tracker.lastTime) / 1000;
        if (deltaTime >= 0.5) {
          const deltaBytes = download.receivedBytes - tracker.lastBytes;
          if (deltaBytes >= 0 && deltaTime > 0) {
            download.speed = formatSpeed(deltaBytes / deltaTime);
          }
          tracker.lastBytes = download.receivedBytes;
          tracker.lastTime = currentTime;
        }
      } else {
        download.speed = undefined;
      }

      if (state === "interrupted") {
        download.error = "Download interrupted; Chromium is attempting to resume it.";
      } else if (download.error && !download.isPaused) {
        download.error = undefined;
      }
      publishState();
    });

    item.once("done", (_doneEvent, state) => {
      activeDownloads.delete(downloadId);
      download.receivedBytes = item.getReceivedBytes();
      download.totalBytes = item.getTotalBytes();
      download.completedAt = Date.now();
      download.speed = undefined;
      download.isPaused = false;
      download.canResume = false;

      if (state === "completed") {
        download.status = "completed";
        download.savePath = item.getSavePath();
        download.error = undefined;
      } else if (state === "cancelled") {
        download.status = "cancelled";
        download.error = "Download cancelled.";
      } else {
        download.status = "failed";
        download.error = item.getLastModifiedTime() ? "Download failed before completion." : "Download failed.";
      }
      dataStore.saveDownloads(downloads);
      publishState();
    });
  });
}

function pauseDownload(downloadId: string): void {
  const tracker = activeDownloads.get(downloadId);
  if (tracker && !tracker.item.isPaused()) {
    tracker.item.pause();
    const download = downloads.find((item) => item.id === downloadId);
    if (download) {
      download.isPaused = true;
      download.canResume = tracker.item.canResume();
      download.speed = undefined;
      publishState();
    }
  }
}

function resumeDownload(downloadId: string): void {
  const tracker = activeDownloads.get(downloadId);
  if (tracker && tracker.item.isPaused() && tracker.item.canResume()) {
    tracker.item.resume();
    const download = downloads.find((item) => item.id === downloadId);
    if (download) {
      download.isPaused = false;
      download.canResume = true;
      tracker.lastBytes = tracker.item.getReceivedBytes();
      tracker.lastTime = Date.now();
      publishState();
    }
  }
}

function cancelDownload(downloadId: string): void {
  const tracker = activeDownloads.get(downloadId);
  if (tracker) {
    tracker.item.cancel();
  }
}

function updateDownloadError(download: StoredDownload, message: string): void {
  download.error = message;
  dataStore.saveDownloads(downloads);
  publishState();
}

function openCompletedDownload(downloadId: string): void {
  const download = downloads.find((item) => item.id === downloadId);
  if (!download || download.status !== "completed" || !download.savePath) return;
  void shell.openPath(download.savePath).then((error) => {
    if (error) updateDownloadError(download, "The downloaded file could not be opened.");
  });
}

function revealCompletedDownload(downloadId: string): void {
  const download = downloads.find((item) => item.id === downloadId);
  if (!download || download.status !== "completed" || !download.savePath) return;
  if (!existsSync(download.savePath)) {
    updateDownloadError(download, "The downloaded file is no longer available at its saved location.");
    return;
  }
  shell.showItemInFolder(download.savePath);
}

function restoreSession(): void {
  const restored = dataStore.getSession();
  if (restored.tabs.length === 0) {
    createTab();
    return;
  }
  isRestoringSession = true;
  try {
    const records = restored.tabs.map((sessionTab) => {
      const record = makeNewTab();
      tabs.set(record.state.id, record);
      return { record, url: sessionTab.url };
    });
    activeTabId = records[Math.min(restored.activeIndex, records.length - 1)].record.state.id;
    for (const { record, url } of records) {
      if (url) navigateTab(record.state.id, url);
    }
  } finally {
    isRestoringSession = false;
  }
  persistSession();
  syncVisibleState();
}

function buildApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    { label: "Lily Browser", submenu: [{ role: "about" }, { type: "separator" }, { role: "quit", label: "Quit Lily Browser" }] },
    { label: "File", submenu: [
      { label: "New Tab", accelerator: "CmdOrCtrl+T", click: () => runBrowserCommand("new-tab") },
      { label: "Close Tab", accelerator: "CmdOrCtrl+W", click: () => runBrowserCommand("close-tab") }
    ] },
    { label: "Navigate", submenu: [
      { label: "Back", accelerator: "Alt+Left", click: () => runBrowserCommand("back") },
      { label: "Forward", accelerator: "Alt+Right", click: () => runBrowserCommand("forward") },
      { label: "Reload", accelerator: "CmdOrCtrl+R", click: () => runBrowserCommand("reload") },
      { type: "separator" },
      { label: "Home", accelerator: "Alt+Home", click: () => runBrowserCommand("home") }
    ] },
    { label: "View", submenu: [{ label: "Focus Address Bar", accelerator: "CmdOrCtrl+L", click: () => runBrowserCommand("focus-address") }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(): void {
  sessionSaved = false;
  forceCloseForActiveDownloads = false;
  mainWindow = new BrowserWindow({
    width: 1240, height: 820, minWidth: 760, minHeight: 540, title: "Lily Browser", backgroundColor: "#f7f7f8", show: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("close", (event) => {
    if (!forceCloseForActiveDownloads) {
      const activeCount = downloads.filter((item) => item.status === "in-progress").length;
      if (activeCount > 0) {
        event.preventDefault();
        const choice = dialog.showMessageBoxSync(mainWindow!, {
          type: "warning",
          title: "Active Downloads",
          message: activeCount === 1 ? "1 download is currently in progress." : `${activeCount} downloads are currently in progress.`,
          detail: "Exiting now will cancel active downloads. What would you like to do?",
          buttons: ["Keep Browser Open", "Exit and Cancel Downloads"],
          defaultId: 0,
          cancelId: 0,
          noLink: true
        });

        if (choice === 1) {
          forceCloseForActiveDownloads = true;
          persistSession();
          sessionSaved = true;
          mainWindow?.close();
        }
        return;
      }
    }
    persistSession();
    sessionSaved = true;
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
    browserBounds = null;
    libraryVisible = false;
    tabs.clear();
    activeTabId = "";
  });
  if (isDevelopment) void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL!);
  else void mainWindow.loadFile(path.join(__dirname, "../../dist/index.html"));
  restoreSession();
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function registerIpcHandlers(): void {
  ipcMain.handle("browser:get-state", () => getSnapshot());
  ipcMain.handle("browser:create-tab", () => createTab());
  ipcMain.handle("browser:select-tab", (_event, tabId: unknown) => { if (isIdentifier(tabId)) selectTab(tabId); });
  ipcMain.handle("browser:close-tab", (_event, tabId: unknown) => { if (isIdentifier(tabId)) closeTab(tabId); });
  ipcMain.handle("browser:navigate", (_event, tabId: unknown, url: unknown) => {
    if (isIdentifier(tabId) && typeof url === "string" && isAllowedNavigation(url)) navigateTab(tabId, url);
  });
  ipcMain.handle("browser:run-command", (_event, command: unknown) => { if (typeof command === "string" && validCommands.has(command as BrowserCommand)) runBrowserCommand(command as BrowserCommand); });
  ipcMain.handle("browser:toggle-bookmark", (_event, tabId: unknown) => { if (isIdentifier(tabId)) toggleBookmark(tabId); });
  ipcMain.handle("browser:remove-bookmark", (_event, bookmarkId: unknown) => {
    if (isIdentifier(bookmarkId)) {
      dataStore.removeBookmark(bookmarkId);
      publishState();
    }
  });
  ipcMain.handle("browser:clear-history", () => {
    dataStore.clearHistory();
    recentHistoryUrls.clear();
    publishState();
  });
  ipcMain.handle("browser:open-download", (_event, downloadId: unknown) => { if (isIdentifier(downloadId)) openCompletedDownload(downloadId); });
  ipcMain.handle("browser:reveal-download", (_event, downloadId: unknown) => { if (isIdentifier(downloadId)) revealCompletedDownload(downloadId); });
  ipcMain.handle("browser:pause-download", (_event, downloadId: unknown) => { if (isIdentifier(downloadId)) pauseDownload(downloadId); });
  ipcMain.handle("browser:resume-download", (_event, downloadId: unknown) => { if (isIdentifier(downloadId)) resumeDownload(downloadId); });
  ipcMain.handle("browser:cancel-download", (_event, downloadId: unknown) => { if (isIdentifier(downloadId)) cancelDownload(downloadId); });
  ipcMain.on("browser:set-library-visible", (_event, visible: unknown) => {
    if (typeof visible === "boolean") {
      libraryVisible = visible;
      applyViewLayout();
    }
  });
  ipcMain.on("browser:set-content-bounds", (_event, bounds: BrowserBounds) => {
    if (bounds && [bounds.x, bounds.y, bounds.width, bounds.height].every((value) => typeof value === "number" && Number.isFinite(value))) {
      browserBounds = { x: Math.max(0, Math.round(bounds.x)), y: Math.max(0, Math.round(bounds.y)), width: Math.max(0, Math.round(bounds.width)), height: Math.max(0, Math.round(bounds.height)) };
      applyViewLayout();
    }
  });
}

app.whenReady().then(() => {
  dataStore = new BrowserDataStore(app.getPath("userData"));
  downloads = dataStore.getDownloads();
  registerIpcHandlers();
  registerDownloadHandler();
  buildApplicationMenu();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => persistSession());
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
