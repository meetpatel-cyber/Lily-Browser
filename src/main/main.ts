import { app, BrowserWindow, dialog, ipcMain, Menu, type MenuItemConstructorOptions, nativeTheme, session, shell, WebContentsView, Notification, protocol } from "electron";
import path from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { BrowserBounds, BrowserCommand, BrowserState, BrowserTab, DownloadRecord, PendingPermission, PermissionCategory, Bookmark } from "../shared/browser";
import { BrowserDataStore, type SessionSnapshot, type StoredDownload } from "./storage";
import { parseBookmarkHtml, generateBookmarkHtml } from "./bookmarks-parser";
import { initFaviconCache, fetchAndCacheFavicon } from "./favicon-cache";

protocol.registerSchemesAsPrivileged([
  { scheme: 'lily-favicon', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true } },
  { scheme: 'lily-bg', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true } }
]);

interface TabRecord {
  state: BrowserTab;
  view?: WebContentsView;
  lastHistoryVisit?: { id: string; url: string; recordedAt: number };
  lastFailedUrl?: string;
  isShowingError?: boolean;
  currentFindRequestId?: number;
  isRestoredNavigation?: boolean;
}

const MAX_URL_LENGTH = 8_192;
const HISTORY_DEDUPLICATION_WINDOW = 15_000;
const validCommands = new Set<BrowserCommand>(["new-tab", "close-tab", "back", "forward", "reload", "home", "focus-address", "find", "zoom-in", "zoom-out", "zoom-reset"]);

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
const tabGroups = new Map<string, import("../shared/browser").TabGroup>();

const pendingPermissions: PendingPermission[] = [];
const pendingPermissionCallbacks = new Map<string, Array<(allowed: boolean) => void>>();
interface DismissalBurst {
  lastActivity: number;
  categories: Set<PermissionCategory>;
}
const recentDismissals = new Map<string, DismissalBurst>();
const recentHistoryUrls = new Map<string, number>();
interface ClosedTabState {
  url: string;
  title: string;
  favicon?: string;
  zoomFactor?: number;
  originalIndex: number;
  isNewTab: boolean;
  isPinned?: boolean;
}
const recentlyClosedTabs: ClosedTabState[] = [];
const MAX_CLOSED_TABS = 15;
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
  const prefs = dataStore.getPreferences();
  let effectiveTheme: "light" | "dark" = prefs.appearance === "dark" ? "dark" : "light";
  if (prefs.appearance === "system") {
    effectiveTheme = nativeTheme.shouldUseDarkColors ? "dark" : "light";
  }

  return {
    tabs: [...tabs.values()].map(({ state }) => ({ ...state })),
    tabGroups: Object.fromEntries(tabGroups.entries()),
    activeTabId,
    bookmarks: dataStore.getBookmarks(),
    bookmarkFolders: dataStore.getBookmarkFolders(),
    history: dataStore.getHistory(),
    downloads: downloads.map(toPublicDownload),
    shortcuts: dataStore.getShortcuts(),
    preferences: prefs,
    permissions: dataStore.getPermissions(),
    pendingPermissions: [...pendingPermissions],
    effectiveTheme
  };
}

function enforceTabOrder(): void {
  const ordered = [...tabs.values()];
  const pinned = ordered.filter(t => t.state.isPinned);
  const unpinned = ordered.filter(t => !t.state.isPinned);
  
  const groupedUnpinned: typeof unpinned = [];
  const seenIds = new Set<string>();
  for (const t of unpinned) {
    if (seenIds.has(t.state.id)) continue;
    groupedUnpinned.push(t);
    seenIds.add(t.state.id);
    
    if (t.state.groupId) {
      const others = unpinned.filter(o => o.state.groupId === t.state.groupId && o.state.id !== t.state.id);
      for (const o of others) {
        groupedUnpinned.push(o);
        seenIds.add(o.state.id);
      }
    }
  }

  tabs.clear();
  for (const r of [...pinned, ...groupedUnpinned]) {
    tabs.set(r.state.id, r);
  }

  const activeGroups = new Set(unpinned.map(t => t.state.groupId).filter(Boolean));
  for (const id of tabGroups.keys()) {
    if (!activeGroups.has(id)) tabGroups.delete(id);
  }
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
  if (active?.view && active.state.zoomFactor !== undefined && active.state.zoomFactor !== active.view.webContents.zoomFactor) {
    active.view.webContents.zoomFactor = active.state.zoomFactor;
  }
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
  const sessionTabs: Array<{ url: string; zoomFactor?: number }> = [];
  let activeIndex = 0;
  for (const record of tabs.values()) {
    const url = record.state.isNewTab ? "" : record.state.error || !isAllowedNavigation(record.state.url) ? undefined : record.state.url;
    if (url === undefined) continue;
    if (record.state.id === activeTabId) activeIndex = sessionTabs.length;
    sessionTabs.push({ url, zoomFactor: record.state.zoomFactor });
  }
  return { tabs: sessionTabs, activeIndex };
}

function persistSession(): void {
  if (dataStore && !isRestoringSession && !sessionSaved) {
    if (dataStore.getPreferences().startupBehavior === "new-tab") return;
    dataStore.saveSession(sessionSnapshot());
  }
}

function releaseView(record: TabRecord): void {
  if (!record.view) return;
  const view = record.view;
  record.view = undefined;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.contentView.removeChildView(view);
  if (!view.webContents.isDestroyed()) view.webContents.close();
}

interface FriendlyError {
  heading: string;
  explanation: string;
  guidance: string[];
  isSecurity: boolean;
  codeOrDesc: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatNavigationError(rawMessage: string, errorCode?: number): FriendlyError {
  const desc = (rawMessage || "").toUpperCase();
  const codeStr = errorCode !== undefined ? `${rawMessage} (${errorCode})` : rawMessage;

  if (desc.includes("ERR_NAME_NOT_RESOLVED") || desc.includes("ERR_NAME_AFTER_PARSE_FAIL") || errorCode === -105) {
    return {
      heading: "Server Not Found",
      explanation: "Lily Browser couldn't find the server for this web address.",
      guidance: [
        "Check the address for typos",
        "Verify your internet or Wi-Fi connection",
        "Check if network DNS settings are working"
      ],
      isSecurity: false,
      codeOrDesc: codeStr
    };
  }

  if (desc.includes("ERR_CONNECTION_REFUSED") || errorCode === -102) {
    return {
      heading: "Unable to Connect",
      explanation: "The server refused the connection request.",
      guidance: [
        "The web server may be offline or undergoing maintenance",
        "Verify the port and address are correct",
        "Try reloading in a few moments"
      ],
      isSecurity: false,
      codeOrDesc: codeStr
    };
  }

  if (desc.includes("ERR_INTERNET_DISCONNECTED") || desc.includes("ERR_NETWORK_CHANGED") || errorCode === -106 || errorCode === -21) {
    return {
      heading: "No Internet Connection",
      explanation: "Your computer is currently offline.",
      guidance: [
        "Check your Wi-Fi, Ethernet cable, or router",
        "Reconnect to your network and try again"
      ],
      isSecurity: false,
      codeOrDesc: codeStr
    };
  }

  if (desc.includes("ERR_CONNECTION_RESET") || desc.includes("ERR_INTERRUPTED") || errorCode === -101 || errorCode === -14) {
    return {
      heading: "Connection Interrupted",
      explanation: "The connection to the server was reset while loading.",
      guidance: [
        "Check network stability",
        "Try reloading the page"
      ],
      isSecurity: false,
      codeOrDesc: codeStr
    };
  }

  if (desc.includes("TIMED_OUT") || errorCode === -7 || errorCode === -118) {
    return {
      heading: "Connection Timed Out",
      explanation: "The server took too long to respond.",
      guidance: [
        "The site may be experiencing high traffic",
        "Try reloading the page later"
      ],
      isSecurity: false,
      codeOrDesc: codeStr
    };
  }

  if (desc.includes("ERR_ADDRESS_UNREACHABLE") || errorCode === -109) {
    return {
      heading: "Address Unreachable",
      explanation: "The specified network address cannot be reached.",
      guidance: [
        "Verify network routing and internet access",
        "Confirm the server address is available"
      ],
      isSecurity: false,
      codeOrDesc: codeStr
    };
  }

  if (desc.includes("ERR_CERT_") || desc.includes("SSL_PROTOCOL_ERROR") || (errorCode !== undefined && errorCode <= -200 && errorCode >= -299)) {
    return {
      heading: "Security Connection Failed",
      explanation: "Lily Browser cannot establish a secure connection to this site.",
      guidance: [
        "The website's security certificate is invalid, expired, or untrusted",
        "Your connection may not be private",
        "Verify your device system date and time"
      ],
      isSecurity: true,
      codeOrDesc: codeStr
    };
  }

  return {
    heading: "Page Unavailable",
    explanation: rawMessage || "The requested webpage could not be loaded.",
    guidance: [
      "Check the web address for errors",
      "Try reloading the page"
    ],
    isSecurity: false,
    codeOrDesc: codeStr || "UNKNOWN_ERROR"
  };
}

function renderErrorHtml(friendly: FriendlyError, failedUrl: string): string {
  const iconSvg = friendly.isSecurity
    ? '<rect x="5" y="11" width="14" height="10" rx="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" />'
    : '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(friendly.heading)}</title>
<style>
  :root { color: #202124; background: #f7f7f8; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  body { display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 24px; box-sizing: border-box; }
  .card { max-width: 480px; width: 100%; background: #ffffff; border: 1px solid #e7e7e9; border-radius: 16px; padding: 32px 28px; box-shadow: 0 4px 20px rgba(0,0,0,0.04); }
  .icon { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 11px; background: #fff2f2; color: #dc2626; margin-bottom: 18px; }
  .icon--security { background: #fff7ed; color: #d97706; }
  h1 { margin: 0 0 8px; font-size: 20px; font-weight: 650; letter-spacing: -0.3px; color: #1f2937; }
  .url { font-size: 12px; color: #6b7280; word-break: break-all; margin-bottom: 14px; font-family: ui-monospace, monospace; background: #f8fafc; padding: 6px 10px; border-radius: 6px; border: 1px solid #f1f5f9; }
  p { margin: 0 0 16px; font-size: 13.5px; line-height: 1.5; color: #4b5563; }
  ul { margin: 0 0 20px; padding-left: 18px; font-size: 13px; color: #4b5563; line-height: 1.55; }
  li { margin-bottom: 4px; }
  .tech { font-size: 11px; color: #9ca3af; border-top: 1px solid #f3f4f6; padding-top: 12px; margin-top: 18px; font-family: ui-monospace, monospace; }
  @media (prefers-color-scheme: dark) {
    :root { color: #f7f7f8; background: #1e1e20; }
    .card { background: #27282b; border-color: #3f3f46; box-shadow: 0 4px 20px rgba(0,0,0,0.2); }
    .icon { background: #451a1a; color: #f87171; }
    .icon--security { background: #452910; color: #fbbf24; }
    h1 { color: #f3f4f6; }
    .url { background: #1f2937; color: #9ca3af; border-color: #374151; }
    p, ul { color: #d1d5db; }
    .tech { color: #9ca3af; border-color: #3f3f46; }
  }
</style>
</head>
<body>
  <div class="card">
    <div class="icon ${friendly.isSecurity ? 'icon--security' : ''}">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        ${iconSvg}
      </svg>
    </div>
    <h1>${escapeHtml(friendly.heading)}</h1>
    ${failedUrl ? `<div class="url">${escapeHtml(failedUrl)}</div>` : ''}
    <p>${escapeHtml(friendly.explanation)}</p>
    <ul>
      ${friendly.guidance.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
    </ul>
    <div class="tech">Error code: ${escapeHtml(friendly.codeOrDesc)}</div>
  </div>
</body>
</html>`;
}

function showNavigationFailure(record: TabRecord, rawMessage: string, errorCode?: number, validatedUrl?: string): void {
  if (record.isShowingError) return;
  record.isShowingError = true;

  const failedUrl = (validatedUrl && isAllowedNavigation(validatedUrl)) ? validatedUrl : record.state.url;
  record.state.url = failedUrl;
  const friendly = formatNavigationError(rawMessage, errorCode);
  record.state.isLoading = false;
  record.state.favicon = undefined;
  record.state.error = friendly.heading;
  record.state.title = friendly.heading;
  record.lastFailedUrl = failedUrl;
  updateNavigationAvailability(record);
  persistSession();
  publishState();

  if (record.view && !record.view.webContents.isDestroyed()) {
    const html = renderErrorHtml(friendly, failedUrl);
    record.view.webContents
      .executeJavaScript(`document.open(); document.write(${JSON.stringify(html)}); document.close(); true;`)
      .catch(() => { /* error page DOM injection fallback */ });
  }
}

function recordHistoryVisit(record: TabRecord): void {
  if (record.isRestoredNavigation) {
    record.isRestoredNavigation = false;
    return;
  }
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
      showNavigationFailure(record, "Lily Browser only opens web addresses over HTTP or HTTPS.", undefined, url);
    }
  });
  contents.on("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) {
      if (record.state.findState) {
        contents.stopFindInPage("clearSelection");
        record.state.findState = undefined;
        record.currentFindRequestId = undefined;
        publishState();
      }
    }
  });
  contents.on("did-start-loading", () => {
    record.isShowingError = false;
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
      
      const isBookmarked = dataStore.getBookmarks().some((b: Bookmark) => {
        try { return new URL(b.url).hostname === new URL(record.state.url).hostname; }
        catch { return false; }
      });
      if (isBookmarked) {
        try { fetchAndCacheFavicon(new URL(record.state.url).hostname, favicons[0]); }
        catch { /* ignore */ }
      }
    }
  });
  const updateUrl = (_event: Electron.Event, url: string) => {
    record.state.url = url;
    record.state.isNewTab = false;
    record.state.error = undefined;
    record.isShowingError = false;
    if (record.lastFailedUrl !== url) record.lastFailedUrl = undefined;
    if (record.state.zoomFactor !== undefined && record.state.zoomFactor !== contents.zoomFactor) {
      contents.zoomFactor = record.state.zoomFactor;
    }
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
  contents.on("found-in-page", (_event, result) => {
    if (record.state.findState && record.currentFindRequestId !== undefined && result.requestId >= record.currentFindRequestId) {
      record.state.findState.activeMatchOrdinal = result.activeMatchOrdinal;
      record.state.findState.matches = result.matches;
      publishState();
    }
  });
  contents.on("did-finish-load", () => {
    recordHistoryVisit(record);
    if (record.state.isAudible !== contents.isCurrentlyAudible()) {
      record.state.isAudible = contents.isCurrentlyAudible();
      publishState();
    }
  });
  contents.on("audio-state-changed", (event) => {
    if (contents.isDestroyed()) return;
    record.state.isAudible = event.audible;
    publishState();
  });
  contents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) { // ERR_ABORTED is -3
      record.isRestoredNavigation = false;
      showNavigationFailure(record, errorDescription, errorCode, validatedUrl);
    }
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
  if (record.state.zoomFactor !== undefined) {
    view.webContents.zoomFactor = record.state.zoomFactor;
  }
  mainWindow?.contentView.addChildView(view);
  view.setVisible(false);
  attachBrowserEvents(record, view);
  return view;
}

function navigateTab(tabId: string, url: string, isRestoring = false): void {
  const record = tabs.get(tabId);
  if (!record || !isAllowedNavigation(url)) return;
  const view = ensureView(record);
  record.lastFailedUrl = undefined;
  record.isShowingError = false;
  record.isRestoredNavigation = isRestoring;
  record.state = { ...record.state, url, title: fallbackTitle(url), favicon: undefined, isNewTab: false, isLoading: true, error: undefined, findState: undefined };
  if (tabId === activeTabId) applyViewLayout();
  persistSession();
  publishState();
  void view.webContents.loadURL(url).catch(() => {
    // Rejections here are expected when showNavigationFailure loads the data: error
    // page, which aborts the original loadURL. The error is already handled by
    // did-fail-load + showNavigationFailure, so we safely swallow this rejection.
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
    if (activate) mainWindow?.webContents.focus();
  }
  return record.state.id;
}

function selectTab(tabId: string): void {
  if (!tabs.has(tabId)) return;
  libraryVisible = false;
  activeTabId = tabId;
  persistSession();
  syncVisibleState();
  const record = tabs.get(tabId);
  if (record?.view && !record.state.isNewTab) {
    record.view.webContents.focus();
  } else {
    mainWindow?.webContents.focus();
  }
}

function closeTab(tabId: string): void {
  const orderedTabs = [...tabs.values()];
  const index = orderedTabs.findIndex((record) => record.state.id === tabId);
  const record = tabs.get(tabId);
  if (!record || index === -1) return;
  recentlyClosedTabs.push({
    url: record.state.url,
    title: record.state.title,
    favicon: record.state.favicon,
    zoomFactor: record.state.zoomFactor,
    originalIndex: index,
    isNewTab: record.state.isNewTab,
    isPinned: record.state.isPinned
  });
  if (recentlyClosedTabs.length > MAX_CLOSED_TABS) {
    recentlyClosedTabs.shift();
  }

  const tabPending = pendingPermissions.filter(p => p.tabId === tabId);
  for (const p of tabPending) {
    const callbacks = pendingPermissionCallbacks.get(p.id);
    if (callbacks) {
      for (const callback of callbacks) {
        callback(false);
      }
      pendingPermissionCallbacks.delete(p.id);
    }
  }
  pendingPermissions.splice(0, pendingPermissions.length, ...pendingPermissions.filter(p => p.tabId !== tabId));
  
  for (const key of recentDismissals.keys()) {
    if (key.startsWith(`${tabId}:`)) {
      recentDismissals.delete(key);
    }
  }
  
  releaseView(record);
  tabs.delete(tabId);
  enforceTabOrder();
  
  if (tabs.size === 0) {
    activeTabId = "";
    createTab();
    return;
  }
  if (activeTabId === tabId) activeTabId = (orderedTabs[index - 1] ?? orderedTabs[index + 1]).state.id;
  persistSession();
  syncVisibleState();
  const active = activeRecord();
  if (active?.view && !active.state.isNewTab) {
    active.view.webContents.focus();
  } else {
    mainWindow?.webContents.focus();
  }
}

function duplicateTab(tabId: string): void {
  const original = tabs.get(tabId);
  if (!original || original.state.isNewTab || !original.state.url) return;
  
  const newRecord = makeNewTab();
  newRecord.state.isPinned = original.state.isPinned;
  if (original.state.zoomFactor !== undefined) {
    newRecord.state.zoomFactor = original.state.zoomFactor;
  }
  
  const ordered = [...tabs.values()];
  const targetIndex = ordered.findIndex(r => r.state.id === tabId);
  if (targetIndex !== -1) {
    ordered.splice(targetIndex + 1, 0, newRecord);
    tabs.clear();
    for (const r of ordered) {
      tabs.set(r.state.id, r);
    }
  } else {
    tabs.set(newRecord.state.id, newRecord);
  }
  
  enforceTabOrder();
  
  activeTabId = newRecord.state.id;
  navigateTab(newRecord.state.id, original.state.url);
}

function reopenTab(): void {
  if (recentlyClosedTabs.length === 0) return;
  const state = recentlyClosedTabs.pop()!;
  
  const record = makeNewTab();
  record.state.isPinned = state.isPinned;
  if (state.zoomFactor !== undefined) {
    record.state.zoomFactor = state.zoomFactor;
  }
  
  const ordered = [...tabs.values()];
  const targetIndex = Math.min(Math.max(0, state.originalIndex), ordered.length);
  ordered.splice(targetIndex, 0, record);
  
  tabs.clear();
  for (const r of ordered) {
    tabs.set(r.state.id, r);
  }
  
  enforceTabOrder();
  
  activeTabId = record.state.id;
  
  if (state.isNewTab && !state.url) {
    persistSession();
    syncVisibleState();
    mainWindow?.webContents.focus();
  } else {
    navigateTab(record.state.id, state.url);
  }
}

function togglePinTab(tabId: string): void {
  const original = tabs.get(tabId);
  if (!original) return;
  original.state.isPinned = !original.state.isPinned;
  enforceTabOrder();
  persistSession();
  syncVisibleState();
  publishState();
}

function setTabGroup(tabId: string, groupId: string | undefined): void {
  const record = tabs.get(tabId);
  if (!record || record.state.isPinned) return;
  record.state.groupId = groupId;
  enforceTabOrder();
  persistSession();
  publishState();
}

function createTabGroup(tabId: string): void {
  const record = tabs.get(tabId);
  if (!record || record.state.isPinned) return;
  const groupId = randomUUID();
  tabGroups.set(groupId, { id: groupId, name: "", color: "grey" });
  setTabGroup(tabId, groupId);
}

function updateTabGroup(groupId: string, updates: Partial<import("../shared/browser").TabGroup>): void {
  const group = tabGroups.get(groupId);
  if (!group) return;
  Object.assign(group, updates);
  persistSession();
  publishState();
}

function toggleMuteTab(tabId: string): void {
  const record = tabs.get(tabId);
  if (!record || !record.view) return;
  const isMuted = record.view.webContents.isAudioMuted();
  record.view.webContents.setAudioMuted(!isMuted);
  record.state.isMuted = !isMuted;
  publishState();
}

function openHome(tabId: string): void {
  const record = tabs.get(tabId);
  if (!record) return;
  releaseView(record);
  record.state = { ...record.state, title: "New Tab", url: "", favicon: undefined, isNewTab: true, isLoading: false, canGoBack: false, canGoForward: false, error: undefined };
  persistSession();
  if (tabId === activeTabId) {
    syncVisibleState();
    mainWindow?.webContents.focus();
  }
  else publishState();
}

function toggleBookmark(tabId: string): void {
  const record = tabs.get(tabId);
  if (!record || record.state.isNewTab || record.state.isLoading || record.state.error || !isAllowedNavigation(record.state.url)) return;
  const added = dataStore.toggleBookmark(record.state.url, record.state.title || fallbackTitle(record.state.url));
  publishState();
  if (added && record.state.favicon) {
    try { fetchAndCacheFavicon(new URL(record.state.url).hostname, record.state.favicon); }
    catch { /* ignore */ }
  }
}

const ZOOM_FACTORS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0, 5.0];

function runBrowserCommand(command: BrowserCommand): void {
  const active = activeRecord();
  switch (command) {
    case "new-tab": createTab(); break;
    case "close-tab": if (active) closeTab(active.state.id); break;
    case "reopen-tab": reopenTab(); break;
    case "back": if (active?.view?.webContents.canGoBack()) active.view.webContents.goBack(); break;
    case "forward": if (active?.view?.webContents.canGoForward()) active.view.webContents.goForward(); break;
    case "reload":
      if (active?.view) {
        if (active.isShowingError && active.lastFailedUrl) {
          navigateTab(active.state.id, active.lastFailedUrl);
        } else {
          active.view.webContents.reload();
        }
      }
      break;
    case "next-tab":
    case "previous-tab": {
      const orderedTabs = [...tabs.values()];
      if (orderedTabs.length > 1) {
        const index = orderedTabs.findIndex((record) => record.state.id === activeTabId);
        if (index !== -1) {
          const newIndex = command === "next-tab" 
            ? (index + 1) % orderedTabs.length 
            : (index - 1 + orderedTabs.length) % orderedTabs.length;
          selectTab(orderedTabs[newIndex].state.id);
        }
      }
      break;
    }
    case "home": if (active) openHome(active.state.id); break;
    case "focus-address": mainWindow?.webContents.send("browser:command", command); break;
    case "find": mainWindow?.webContents.send("browser:command", command); break;
    case "tab-search": mainWindow?.webContents.send("browser:command", command); break;
    case "zoom-in":
    case "zoom-out":
    case "zoom-reset":
      if (active?.view) {
        let current = active.view.webContents.zoomFactor;
        if (command === "zoom-reset") {
          current = 1.0;
        } else if (command === "zoom-in") {
          const next = ZOOM_FACTORS.find(f => f > current + 0.01);
          if (next) current = next;
        } else if (command === "zoom-out") {
          const prev = [...ZOOM_FACTORS].reverse().find(f => f < current - 0.01);
          if (prev) current = prev;
        }
        active.view.webContents.zoomFactor = current;
        active.state.zoomFactor = current;
        publishState();
        persistSession();
      }
      break;
  }
}

function commandFromInput(input: Electron.Input): BrowserCommand | undefined {
  if (input.type !== "keyDown") return undefined;
  const commandModifier = input.control || input.meta;
  if (commandModifier) {
    if (input.key === "Tab") return input.shift ? "previous-tab" : "next-tab";
    if (input.key.toLowerCase() === "t") return input.shift ? "reopen-tab" : "new-tab";
    if (input.key.toLowerCase() === "a" && input.shift) return "tab-search";
    if (input.key.toLowerCase() === "w") return "close-tab";
    if (input.key.toLowerCase() === "l") return "focus-address";
    if (input.key.toLowerCase() === "f") return "find";
    if (input.key.toLowerCase() === "r") return "reload";
    if (input.key === "=" || input.key === "+" || input.key === "NumpadAdd") return "zoom-in";
    if (input.key === "-" || input.key === "NumpadSubtract") return "zoom-out";
    if (input.key === "0" || input.key === "Numpad0") return "zoom-reset";
  }
  if (input.key === "F5") return "reload";
  if (input.alt && input.key === "Left") return "back";
  if (input.alt && input.key === "Right") return "forward";
  if (input.alt && input.key === "Home") return "home";
  return undefined;
}

function getSafeDownloadPath(baseDir: string, filename: string): string {
  let safePath = path.join(baseDir, filename);
  if (!existsSync(safePath)) return safePath;

  const ext = path.extname(filename);
  const name = path.basename(filename, ext);
  
  let i = 1;
  while (true) {
    safePath = path.join(baseDir, `${name} (${i})${ext}`);
    if (!existsSync(safePath)) return safePath;
    i++;
  }
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

    const prefs = dataStore.getPreferences();
    if (prefs.askWhereToSave) {
      item.setSaveDialogOptions({
        defaultPath: path.join(prefs.downloadLocation, download.filename)
      });
    } else {
      const safePath = getSafeDownloadPath(prefs.downloadLocation, download.filename);
      item.setSavePath(safePath);
      download.filename = path.basename(safePath);
    }

    activeDownloads.set(downloadId, {
      item,
      lastBytes: item.getReceivedBytes(),
      lastTime: now
    });

    downloads.unshift(download);
    dataStore.saveDownloads(downloads);
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
        if (Notification.isSupported()) {
          new Notification({ title: "Download Complete", body: download.filename }).show();
        }
      } else if (state === "cancelled") {
        if (!item.getSavePath()) {
          const idx = downloads.findIndex(d => d.id === downloadId);
          if (idx !== -1) downloads.splice(idx, 1);
        } else {
          download.status = "cancelled";
          download.error = "Download cancelled.";
        }
      } else {
        download.status = "failed";
        download.error = item.getLastModifiedTime() ? "Download failed before completion." : "Download failed.";
        if (Notification.isSupported()) {
          new Notification({ title: "Download Failed", body: download.filename }).show();
        }
      }
      dataStore.saveDownloads(downloads);
      publishState();
    });
  });
}

function updateDownloadConfig(): void {
  const prefs = dataStore.getPreferences();
  session.defaultSession.setDownloadPath(prefs.downloadLocation);
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

function removeDownload(downloadId: string): void {
  const index = downloads.findIndex((d) => d.id === downloadId);
  if (index === -1) return;
  
  const download = downloads[index];
  if (download.status === "in-progress") return;
  
  downloads.splice(index, 1);
  dataStore.saveDownloads(downloads);
  publishState();
}

function clearCompletedDownloads(): void {
  const initialLength = downloads.length;
  downloads = downloads.filter((d) => d.status !== "completed");
  
  if (downloads.length !== initialLength) {
    dataStore.saveDownloads(downloads);
    publishState();
  }
}

function retryDownload(downloadId: string): void {
  const download = downloads.find((d) => d.id === downloadId);
  if (!download || download.status !== "failed" || !download.url) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.downloadURL(download.url);
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
  const prefs = dataStore.getPreferences();
  const restored = dataStore.getSession();
  if (prefs.startupBehavior === "new-tab" || restored.tabs.length === 0) {
    createTab();
    return;
  }
  isRestoringSession = true;
  try {
    const records = restored.tabs.map((sessionTab) => {
      const record = makeNewTab();
      if (sessionTab.zoomFactor) record.state.zoomFactor = sessionTab.zoomFactor;
      tabs.set(record.state.id, record);
      return { record, url: sessionTab.url };
    });
    activeTabId = records[Math.min(restored.activeIndex, records.length - 1)].record.state.id;
    for (const { record, url } of records) {
      if (url) navigateTab(record.state.id, url, true);
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
    { label: "View", submenu: [
      { label: "Focus Address Bar", accelerator: "CmdOrCtrl+L", click: () => runBrowserCommand("focus-address") },
      { label: "Search Tabs", accelerator: "CmdOrCtrl+Shift+A", click: () => runBrowserCommand("tab-search") }
    ] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(): void {
  sessionSaved = false;
  forceCloseForActiveDownloads = false;
  
  nativeTheme.themeSource = dataStore.getPreferences().appearance;
  
  mainWindow = new BrowserWindow({
    width: 1240, height: 820, minWidth: 760, minHeight: 540, title: "Lily Browser", backgroundColor: nativeTheme.shouldUseDarkColors ? "#1e1e20" : "#f7f7f8", show: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  mainWindow.webContents.on("before-input-event", (event, input) => {
    const command = commandFromInput(input);
    if (command) {
      event.preventDefault();
      runBrowserCommand(command);
    }
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

  ipcMain.handle("browser:update-tab-group", (_event, groupId: unknown, updates: unknown) => {
    if (typeof groupId === "string" && updates && typeof updates === "object") {
      updateTabGroup(groupId, updates as Partial<import("../shared/browser").TabGroup>);
    }
  });

  ipcMain.handle("browser:show-tab-group-context-menu", (_event, groupId: unknown) => {
    if (typeof groupId !== "string" || !tabGroups.has(groupId)) return;
    const colors: import("../shared/browser").TabGroupColor[] = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];
    const template: MenuItemConstructorOptions[] = colors.map(color => ({
      label: color.charAt(0).toUpperCase() + color.slice(1),
      type: "radio",
      checked: tabGroups.get(groupId)?.color === color,
      click: () => updateTabGroup(groupId, { color })
    }));
    Menu.buildFromTemplate(template).popup();
  });

  ipcMain.handle("browser:show-tab-context-menu", (_event, tabId: unknown) => {
    if (!isIdentifier(tabId) || !tabs.has(tabId)) return;
    const template: MenuItemConstructorOptions[] = [
      {
        label: "New Tab",
        accelerator: "CmdOrCtrl+T",
        click: () => createTab()
      },
      {
        label: "Reload",
        accelerator: "CmdOrCtrl+R",
        click: () => {
          const record = tabs.get(tabId);
          if (record?.view) {
            if (record.isShowingError && record.lastFailedUrl) {
              navigateTab(tabId, record.lastFailedUrl);
            } else {
              record.view.webContents.reload();
            }
          }
        }
      },
      {
        label: "Duplicate Tab",
        click: () => duplicateTab(tabId)
      },
      { type: "separator" },
      {
        label: tabs.get(tabId)?.state.isPinned ? "Unpin Tab" : "Pin Tab",
        click: () => togglePinTab(tabId)
      },
      {
        label: tabs.get(tabId)?.state.isMuted ? "Unmute Tab" : "Mute Tab",
        click: () => toggleMuteTab(tabId)
      },
      { type: "separator" },
      {
        label: "Add Tab to New Group",
        enabled: !tabs.get(tabId)?.state.isPinned,
        click: () => createTabGroup(tabId)
      },
      ...(tabs.get(tabId)?.state.groupId ? [{
        label: "Remove from Group",
        click: () => setTabGroup(tabId, undefined)
      }] : []),
      ...(tabGroups.size > 0 ? [{
        label: "Add Tab to Group",
        enabled: !tabs.get(tabId)?.state.isPinned,
        submenu: Array.from(tabGroups.values()).map(g => ({
          label: g.name || "Unnamed Group",
          click: () => setTabGroup(tabId, g.id)
        }))
      }] : []),
      { type: "separator" },
      {
        label: "Close Tab",
        accelerator: "CmdOrCtrl+W",
        click: () => closeTab(tabId)
      },
      {
        label: "Close Other Tabs",
        click: () => {
          const toClose = [...tabs.values()].filter(t => t.state.id !== tabId);
          toClose.forEach(t => closeTab(t.state.id));
        }
      },
      {
        label: "Close Tabs to the Right",
        click: () => {
          const ordered = [...tabs.values()];
          const index = ordered.findIndex(t => t.state.id === tabId);
          if (index !== -1) {
            ordered.slice(index + 1).forEach(t => closeTab(t.state.id));
          }
        }
      }
    ];
    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: mainWindow ?? undefined });
  });

  ipcMain.handle("browser:toggle-bookmark", (_event, tabId: unknown) => { if (isIdentifier(tabId)) toggleBookmark(tabId); });
  ipcMain.handle("browser:remove-bookmark", (_event, bookmarkId: unknown) => {
    if (isIdentifier(bookmarkId)) {
      dataStore.removeBookmark(bookmarkId);
      publishState();
    }
  });
  ipcMain.handle("browser:update-bookmark", (_event, bookmarkId: unknown, url: unknown, title: unknown, folderId: unknown) => {
    if (typeof bookmarkId === "string" && typeof url === "string" && typeof title === "string") {
      dataStore.updateBookmark(bookmarkId, url, title, typeof folderId === "string" ? folderId : undefined);
      publishState();
    }
  });

  ipcMain.handle("browser:add-shortcut", (_event, url: unknown, title: unknown) => {
    if (typeof url === "string" && typeof title === "string") {
      dataStore.addShortcut(url, title);
      publishState();
    }
  });

  ipcMain.handle("browser:update-shortcut", (_event, shortcutId: unknown, url: unknown, title: unknown) => {
    if (typeof shortcutId === "string" && typeof url === "string" && typeof title === "string") {
      dataStore.updateShortcut(shortcutId, url, title);
      publishState();
    }
  });

  ipcMain.handle("browser:remove-shortcut", (_event, shortcutId: unknown) => {
    if (isIdentifier(shortcutId)) {
      dataStore.removeShortcut(shortcutId);
      publishState();
    }
  });
  
  ipcMain.handle("browser:create-bookmark-folder", (_event, name: unknown) => {
    if (typeof name === "string") {
      const id = dataStore.createBookmarkFolder(name);
      publishState();
      return id;
    }
    return "";
  });

  ipcMain.handle("browser:rename-bookmark-folder", (_event, folderId: unknown, name: unknown) => {
    if (typeof folderId === "string" && typeof name === "string") {
      dataStore.renameBookmarkFolder(folderId, name);
      publishState();
    }
  });

  ipcMain.handle("browser:delete-bookmark-folder", (_event, folderId: unknown) => {
    if (typeof folderId === "string") {
      const success = dataStore.deleteBookmarkFolder(folderId);
      if (success) publishState();
      return success;
    }
    return false;
  });

  ipcMain.handle("browser:import-bookmarks", async () => {
    if (!mainWindow) return;
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: "Import Bookmarks",
      properties: ["openFile"],
      filters: [{ name: "HTML Files", extensions: ["html", "htm"] }],
    });
    
    if (canceled || filePaths.length === 0) return;
    
    try {
      const html = readFileSync(filePaths[0], "utf8");
      const parsedBookmarks = parseBookmarkHtml(html);
      
      if (parsedBookmarks.length === 0) {
        dialog.showMessageBox(mainWindow, {
          type: "info",
          title: "Invalid Bookmark File",
          message: "No bookmarks found.",
          detail: "The selected file does not contain a supported bookmark format or is empty.",
          buttons: ["OK"]
        });
        return;
      }
      
      const count = dataStore.addImportedBookmarks(parsedBookmarks);
      if (count > 0) publishState();
    } catch (e) {
      console.error("Failed to import bookmarks:", e);
    }
  });

  ipcMain.handle("browser:export-bookmarks", async () => {
    if (!mainWindow) return;
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: "Export Bookmarks",
      defaultPath: "bookmarks.html",
      filters: [{ name: "HTML Files", extensions: ["html", "htm"] }],
    });
    
    if (canceled || !filePath) return;
    
    try {
      const bookmarks = dataStore.getBookmarks();
      const folders = dataStore.getBookmarkFolders();
      const html = generateBookmarkHtml(bookmarks, folders);
      writeFileSync(filePath, html, "utf8");
    } catch (e) {
      console.error("Failed to export bookmarks:", e);
    }
  });
  ipcMain.handle("browser:update-preferences", (_event, updates: unknown) => {
    if (typeof updates === "object" && updates !== null) {
      dataStore.updatePreferences(updates);
      nativeTheme.themeSource = dataStore.getPreferences().appearance;
      updateDownloadConfig();
      publishState();
    }
  });

  ipcMain.handle("browser:choose-new-tab-background", async () => {
    if (!mainWindow) return;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "gif"] }]
    });
    if (!result.canceled && result.filePaths.length > 0) {
      try {
        const src = result.filePaths[0];
        const dest = path.join(app.getPath("userData"), "custom-background");
        import("node:fs").then(fs => fs.copyFileSync(src, dest));
        dataStore.updatePreferences({ newTabBackground: `lily-bg://image?t=${Date.now()}` });
        publishState();
      } catch (e) {
        console.error("Failed to copy background image", e);
      }
    }
  });
  ipcMain.handle("browser:clear-history", () => {
    dataStore.clearHistory();
    recentHistoryUrls.clear();
    publishState();
  });
  ipcMain.handle("browser:clear-browsing-data", async (_event, options: { history: boolean; cookies: boolean; cache: boolean }) => {
    if (!options || typeof options !== "object") return;
    try {
      if (options.history) {
        dataStore.clearHistory();
        recentHistoryUrls.clear();
      }
      if (options.cookies) {
        await session.defaultSession.clearStorageData({
          storages: ["cookies", "filesystem", "indexdb", "localstorage", "serviceworkers", "cachestorage"]
        });
      }
      if (options.cache) {
        await session.defaultSession.clearCache();
      }
      if (options.history) {
        publishState();
      }
    } catch (error) {
      console.error("Failed to clear browsing data:", error);
      throw error;
    }
  });

  function cleanStaleDismissals() {
    const now = Date.now();
    for (const [key, burst] of recentDismissals.entries()) {
      if (now - burst.lastActivity > 5000) {
        recentDismissals.delete(key);
      }
    }
  }

  ipcMain.handle("browser:resolve-permission", (_event, reqId: unknown, decision: unknown) => {
    if (typeof reqId !== "string" || (decision !== "allow" && decision !== "block" && decision !== "dismiss")) return;
    
    cleanStaleDismissals();
    
    const index = pendingPermissions.findIndex(p => p.id === reqId);
    if (index === -1) return;
    
    const pending = pendingPermissions[index];
    pendingPermissions.splice(index, 1);
    
    const burstKey = `${pending.tabId}:${pending.origin}`;
    let burst = recentDismissals.get(burstKey);
    if (!burst) {
      burst = { lastActivity: Date.now(), categories: new Set() };
      recentDismissals.set(burstKey, burst);
    }
    burst.lastActivity = Date.now();
    
    if (decision === "dismiss") {
      burst.categories.add(pending.category);
    }
    
    const callbacks = pendingPermissionCallbacks.get(reqId);
    if (callbacks) {
      pendingPermissionCallbacks.delete(reqId);
      if (decision === "allow" || decision === "block") {
        if (pending.category === "cameraAndMicrophone") {
          dataStore.setPermission(pending.origin, "camera", decision);
          dataStore.setPermission(pending.origin, "microphone", decision);
        } else {
          dataStore.setPermission(pending.origin, pending.category, decision);
        }
        for (const cb of callbacks) cb(decision === "allow");
      } else {
        for (const cb of callbacks) cb(false);
      }
    }
    publishState();
  });

  ipcMain.handle("browser:remove-permission", (_event, origin: unknown, category: unknown) => {
    if (typeof origin === "string" && typeof category === "string") {
      dataStore.removePermission(origin, category as PermissionCategory);
      publishState();
    }
  });

  ipcMain.handle("browser:clear-all-permissions", () => {
    dataStore.clearAllPermissions();
    publishState();
  });

  ipcMain.handle("browser:remove-history-entry", (_event, historyId: unknown) => {
    if (isIdentifier(historyId)) {
      dataStore.removeHistoryEntry(historyId);
      publishState();
    }
  });
  ipcMain.handle("browser:open-download", (_event, downloadId: unknown) => { if (isIdentifier(downloadId)) openCompletedDownload(downloadId); });
  ipcMain.handle("browser:reveal-download", (_event, downloadId: unknown) => { if (isIdentifier(downloadId)) revealCompletedDownload(downloadId); });
  ipcMain.handle("browser:pause-download", (_event, downloadId: unknown) => { if (isIdentifier(downloadId)) pauseDownload(downloadId); });
  ipcMain.handle("browser:resume-download", (_event, downloadId: unknown) => { if (isIdentifier(downloadId)) resumeDownload(downloadId); });
  ipcMain.handle("browser:cancel-download", (_event, downloadId: unknown) => { if (isIdentifier(downloadId)) cancelDownload(downloadId); });
  ipcMain.handle("browser:remove-download", (_event, downloadId: unknown) => { if (isIdentifier(downloadId)) removeDownload(downloadId); });
  ipcMain.handle("browser:retry-download", (_event, downloadId: unknown) => { if (isIdentifier(downloadId)) retryDownload(downloadId); });
  ipcMain.handle("browser:clear-completed-downloads", () => clearCompletedDownloads());
  ipcMain.handle("browser:choose-download-location", async () => {
    if (!mainWindow) return undefined;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"]
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return undefined;
  });
  ipcMain.on("browser:set-library-visible", (_event, visible: unknown) => {
    if (typeof visible === "boolean") {
      libraryVisible = visible;
      applyViewLayout();
    }
  });
  ipcMain.handle("browser:find-in-page", (_event, tabId: unknown, text: unknown, forward: unknown, findNext: unknown) => {
    if (isIdentifier(tabId) && typeof text === "string" && typeof forward === "boolean" && typeof findNext === "boolean") {
      const record = tabs.get(tabId);
      if (record?.view) {
        if (!record.state.findState) record.state.findState = { visible: true, text: "", activeMatchOrdinal: 0, matches: 0 };
        record.state.findState.text = text;
        if (findNext) {
          record.state.findState.activeMatchOrdinal = 0;
          record.state.findState.matches = 0;
        }
        const requestId = record.view.webContents.findInPage(text, { forward, findNext });
        record.currentFindRequestId = requestId;
        publishState();
      }
    }
  });
  ipcMain.handle("browser:stop-find-in-page", (_event, tabId: unknown, keepSelection: unknown) => {
    if (isIdentifier(tabId) && typeof keepSelection === "boolean") {
      const record = tabs.get(tabId);
      if (record?.view) {
        record.view.webContents.stopFindInPage(keepSelection ? "keepSelection" : "clearSelection");
        record.currentFindRequestId = undefined;
        if (record.state.findState) {
          record.state.findState.text = "";
          record.state.findState.activeMatchOrdinal = 0;
          record.state.findState.matches = 0;
          publishState();
        }
      }
    }
  });
  ipcMain.handle("browser:set-find-visible", (_event, tabId: unknown, visible: unknown) => {
    if (isIdentifier(tabId) && typeof visible === "boolean") {
      const record = tabs.get(tabId);
      if (record) {
        if (!record.state.findState) record.state.findState = { visible: false, text: "", activeMatchOrdinal: 0, matches: 0 };
        record.state.findState.visible = visible;
        if (visible) {
          mainWindow?.webContents.focus();
        } else {
          record.state.findState.text = "";
          record.state.findState.activeMatchOrdinal = 0;
          record.state.findState.matches = 0;
          record.currentFindRequestId = undefined;
          if (record.view) record.view.webContents.stopFindInPage("clearSelection");
        }
        publishState();
      }
    }
  });
  ipcMain.on("browser:set-content-bounds", (_event, bounds: BrowserBounds) => {
    if (bounds && [bounds.x, bounds.y, bounds.width, bounds.height].every((value) => typeof value === "number" && Number.isFinite(value))) {
      browserBounds = { x: Math.max(0, Math.round(bounds.x)), y: Math.max(0, Math.round(bounds.y)), width: Math.max(0, Math.round(bounds.width)), height: Math.max(0, Math.round(bounds.height)) };
      applyViewLayout();
    }
  });
}

function setupPermissions(): void {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    let category: PermissionCategory | null = null;
    let isCombinedMedia = false;
    
    if (permission === "media") {
      const mediaReq = details as Electron.MediaAccessPermissionRequest;
      const hasVideo = mediaReq.mediaTypes?.includes("video");
      const hasAudio = mediaReq.mediaTypes?.includes("audio");
      if (hasVideo && hasAudio) {
        category = "cameraAndMicrophone";
        isCombinedMedia = true;
      } else if (hasVideo) {
        category = "camera";
      } else if (hasAudio) {
        category = "microphone";
      }
    } else if (permission === "notifications") {
      category = "notifications";
    } else if (permission === "geolocation") {
      category = "geolocation";
    }
    
    if (!category) return callback(false);
    
    const rawOrigin = (details as unknown as Record<string, string>).securityOrigin || details.requestingUrl;
    let origin: string | null = null;
    try {
      const parsed = new URL(rawOrigin || "");
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        origin = parsed.origin;
      }
    } catch {
      origin = null;
    }
    if (!origin) return callback(false);
    
    let promptCategory = category;
    if (isCombinedMedia) {
      const camDecision = dataStore.getPermission(origin, "camera");
      const micDecision = dataStore.getPermission(origin, "microphone");
      if (camDecision === "allow" && micDecision === "allow") return callback(true);
      if (camDecision === "block" || micDecision === "block") return callback(false);
      
      if (camDecision === "allow" && micDecision === undefined) {
        promptCategory = "microphone";
      } else if (micDecision === "allow" && camDecision === undefined) {
        promptCategory = "camera";
      }
    } else {
      const decision = dataStore.getPermission(origin, category);
      if (decision === "allow") return callback(true);
      if (decision === "block") return callback(false);
    }
    
    const record = Array.from(tabs.values()).find(t => t.view && t.view.webContents.id === webContents.id);
    if (!record) return callback(false);
    
    const burstKey = `${record.state.id}:${origin}`;
    const burst = recentDismissals.get(burstKey);
    
    if (burst) {
      if (Date.now() - burst.lastActivity < 500) {
        if (burst.categories.has(promptCategory)) {
          // Chromium sequential queue is flushing a previously dismissed category.
          // Auto-dismiss and extend the window.
          burst.lastActivity = Date.now();
          return callback(false);
        }
      } else {
        recentDismissals.delete(burstKey);
      }
    }
    
    // Deduplication logic: Check if there's an exact pending prompt already
    const existingPrompt = pendingPermissions.find(p => p.tabId === record.state.id && p.origin === origin && p.category === promptCategory);
    if (existingPrompt) {
      const callbacks = pendingPermissionCallbacks.get(existingPrompt.id);
      if (callbacks) {
        callbacks.push(callback);
        publishState();
        return; // Suppress creating a new prompt
      }
    }
    
    const reqId = randomUUID();
    pendingPermissionCallbacks.set(reqId, [callback]);
    pendingPermissions.push({ id: reqId, tabId: record.state.id, origin, category: promptCategory });
    publishState();
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    let category: PermissionCategory | null = null;
    if (permission === "media") {
      if (details.mediaType === "video") category = "camera";
      else if (details.mediaType === "audio") category = "microphone";
    } else if (permission === "notifications") {
      category = "notifications";
    } else if (permission === "geolocation") {
      category = "geolocation";
    }
    
    if (!category) return false;
    
    const rawOrigin = details.securityOrigin || details.requestingUrl || requestingOrigin;
    let origin: string | null = null;
    try {
      const parsed = new URL(rawOrigin || "");
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        origin = parsed.origin;
      }
    } catch {
      origin = null;
    }
    if (!origin) return false;
    
    const decision = dataStore.getPermission(origin, category);
    return decision === "allow";
  });
}

app.whenReady().then(() => {
  initFaviconCache();

  protocol.handle("lily-bg", () => {
    const bgPath = path.join(app.getPath("userData"), "custom-background");
    if (existsSync(bgPath)) {
      try {
        const buffer = readFileSync(bgPath);
        return new Response(buffer);
      } catch (e) {
        console.error("Failed to read custom-background", e);
      }
    }
    return new Response(null, { status: 404 });
  });

  dataStore = new BrowserDataStore(app.getPath("userData"));
  downloads = dataStore.getDownloads();
  
  let downloadsModified = false;
  for (const d of downloads) {
    if (d.status === "in-progress") {
      d.status = "failed";
      d.error = "Download was interrupted by application shutdown.";
      d.isPaused = false;
      d.canResume = false;
      d.speed = undefined;
      downloadsModified = true;
    }
  }
  if (downloadsModified) {
    dataStore.saveDownloads(downloads);
  }

  updateDownloadConfig();
  
  nativeTheme.on("updated", () => {
    publishState();
  });
  setupPermissions();
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
