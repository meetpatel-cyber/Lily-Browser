import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { app } from "electron";
import type { Bookmark, BookmarkFolder, BrowserPreferences, DownloadRecord, DownloadStatus, HistoryEntry, PermissionCategory, PermissionDecision, SitePermissions, Shortcut } from "../shared/browser";

const DATA_VERSION = 1;
const MAX_BOOKMARKS = 5000;
const MAX_HISTORY_ENTRIES = 1_000;
const MAX_DOWNLOADS = 100;
const MAX_SESSION_TABS = 20;

export interface SessionSnapshot {
  tabs: Array<{ url: string; zoomFactor?: number }>;
  activeIndex: number;
}

export interface StoredDownload extends DownloadRecord {
  savePath?: string;
}

interface StoredBrowserData {
  version: number;
  bookmarks: Bookmark[];
  bookmarkFolders: BookmarkFolder[];
  history: HistoryEntry[];
  downloads: StoredDownload[];
  shortcuts: Shortcut[];
  session: SessionSnapshot;
  preferences: BrowserPreferences;
  permissions: SitePermissions;
}

function emptyData(): StoredBrowserData {
  return {
    version: DATA_VERSION,
    bookmarks: [],
    bookmarkFolders: [],
    history: [],
    downloads: [],
    shortcuts: [],
    session: { tabs: [], activeIndex: 0 },
    preferences: {
      searchEngine: "duckduckgo",
      startupBehavior: "continue",
      downloadLocation: app.getPath("downloads"),
      askWhereToSave: false,
      appearance: "system",
      newTabShowShortcuts: true,
      newTabShowTopSites: true,
      newTabBackground: ""
    },
    permissions: {}
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 8_192) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function readText(value: unknown, fallback: string, maxLength = 512): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : fallback;
}

function readTimestamp(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function readBytes(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function readStatus(value: unknown): DownloadStatus | undefined {
  return value === "in-progress" || value === "completed" || value === "cancelled" || value === "failed" ? value : undefined;
}

function sanitizeBookmarks(value: unknown): Bookmark[] {
  if (!Array.isArray(value)) return [];
  const seenUrls = new Set<string>();
  return value.reduce<Bookmark[]>((bookmarks, item) => {
    if (!isObject(item) || !isHttpUrl(item.url) || seenUrls.has(item.url)) return bookmarks;
    seenUrls.add(item.url);
    bookmarks.push({
      id: readText(item.id, randomUUID(), 128),
      url: item.url,
      title: readText(item.title, item.url),
      createdAt: readTimestamp(item.createdAt, Date.now()),
      folderId: typeof item.folderId === "string" ? item.folderId : undefined
    });
    return bookmarks;
  }, []).slice(0, MAX_BOOKMARKS);
}

function sanitizeBookmarkFolders(value: unknown): BookmarkFolder[] {
  if (!Array.isArray(value)) return [];
  const seenIds = new Set<string>();
  return value.reduce<BookmarkFolder[]>((folders, item) => {
    if (!isObject(item)) return folders;
    const id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : undefined;
    if (!id || seenIds.has(id)) return folders;
    seenIds.add(id);
    folders.push({
      id,
      name: readText(item.name, "New Folder"),
      createdAt: readTimestamp(item.createdAt, Date.now())
    });
    return folders;
  }, []).slice(0, 50); // limit to 50 folders to be safe
}

function sanitizeHistory(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.reduce<HistoryEntry[]>((history, item) => {
    if (!isObject(item) || !isHttpUrl(item.url)) return history;
    history.push({
      id: readText(item.id, randomUUID(), 128),
      url: item.url,
      title: readText(item.title, item.url),
      visitedAt: readTimestamp(item.visitedAt, Date.now())
    });
    return history;
  }, []).slice(0, MAX_HISTORY_ENTRIES);
}

function sanitizeDownloads(value: unknown): StoredDownload[] {
  if (!Array.isArray(value)) return [];
  return value.reduce<StoredDownload[]>((downloads, item) => {
    if (!isObject(item) || !isHttpUrl(item.url)) return downloads;
    const status = readStatus(item.status);
    if (!status) return downloads;
    downloads.push({
      id: readText(item.id, randomUUID(), 128),
      filename: readText(item.filename, "download", 512),
      url: item.url,
      receivedBytes: readBytes(item.receivedBytes),
      totalBytes: readBytes(item.totalBytes),
      status,
      startedAt: readTimestamp(item.startedAt, Date.now()),
      completedAt: typeof item.completedAt === "number" ? readTimestamp(item.completedAt, Date.now()) : undefined,
      error: typeof item.error === "string" ? item.error.slice(0, 512) : undefined,
      savePath: typeof item.savePath === "string" && item.savePath.length < 4_096 ? item.savePath : undefined
    });
    return downloads;
  }, []).slice(0, MAX_DOWNLOADS);
}

function sanitizeSession(value: unknown): SessionSnapshot {
  if (!isObject(value) || !Array.isArray(value.tabs)) return { tabs: [], activeIndex: 0 };
  const tabs = value.tabs.reduce<Array<{ url: string; zoomFactor?: number }>>((sessionTabs, item) => {
    if (!isObject(item)) return sessionTabs;
    if (item.url === "" || isHttpUrl(item.url)) {
      const zoomFactor = typeof item.zoomFactor === "number" && Number.isFinite(item.zoomFactor) && item.zoomFactor > 0 ? item.zoomFactor : undefined;
      sessionTabs.push({ url: item.url, zoomFactor });
    }
    return sessionTabs;
  }, []).slice(0, MAX_SESSION_TABS);
  const requestedIndex = typeof value.activeIndex === "number" && Number.isInteger(value.activeIndex) ? value.activeIndex : 0;
  return { tabs, activeIndex: Math.max(0, Math.min(requestedIndex, Math.max(0, tabs.length - 1))) };
}

function sanitizePreferences(value: unknown): BrowserPreferences {
  const defaultPrefs = emptyData().preferences;
  if (!isObject(value)) return defaultPrefs;
  
  const searchEngine = value.searchEngine === "google" || value.searchEngine === "bing" ? value.searchEngine : "duckduckgo";
  const startupBehavior = value.startupBehavior === "new-tab" ? "new-tab" : "continue";
  
  let downloadLocation = defaultPrefs.downloadLocation;
  if (typeof value.downloadLocation === "string" && value.downloadLocation.trim() !== "") {
    if (existsSync(value.downloadLocation)) {
      downloadLocation = value.downloadLocation;
    }
  }

  const askWhereToSave = typeof value.askWhereToSave === "boolean" ? value.askWhereToSave : defaultPrefs.askWhereToSave;
  const appearance = value.appearance === "light" || value.appearance === "dark" ? value.appearance : "system";
  const newTabShowShortcuts = typeof value.newTabShowShortcuts === "boolean" ? value.newTabShowShortcuts : defaultPrefs.newTabShowShortcuts;
  const newTabShowTopSites = typeof value.newTabShowTopSites === "boolean" ? value.newTabShowTopSites : defaultPrefs.newTabShowTopSites;
  const newTabBackground = typeof value.newTabBackground === "string" ? value.newTabBackground : defaultPrefs.newTabBackground;

  return {
    searchEngine,
    startupBehavior,
    downloadLocation,
    askWhereToSave,
    appearance,
    newTabShowShortcuts,
    newTabShowTopSites,
    newTabBackground
  };
}

function sanitizeData(value: unknown): StoredBrowserData {
  if (!isObject(value) || value.version !== DATA_VERSION) return emptyData();
  return {
    version: DATA_VERSION,
    bookmarks: sanitizeBookmarks(value.bookmarks),
    bookmarkFolders: sanitizeBookmarkFolders((value as Record<string, unknown>).bookmarkFolders),
    history: sanitizeHistory(value.history),
    downloads: sanitizeDownloads(value.downloads),
    shortcuts: sanitizeShortcuts((value as Record<string, unknown>).shortcuts),
    session: sanitizeSession(value.session),
    preferences: sanitizePreferences(value.preferences),
    permissions: sanitizePermissions((value as Record<string, unknown>).permissions)
  };
}

function sanitizeShortcuts(value: unknown): Shortcut[] {
  if (!Array.isArray(value)) return [];
  return value.reduce<Shortcut[]>((shortcuts, item) => {
    if (!isObject(item) || !isHttpUrl(item.url)) return shortcuts;
    shortcuts.push({
      id: readText(item.id, randomUUID(), 128),
      url: item.url,
      title: readText(item.title, item.url, 256)
    });
    return shortcuts;
  }, []).slice(0, 20); // Limit shortcuts count
}

function sanitizePermissions(value: unknown): SitePermissions {
  if (!isObject(value)) return {};
  const sanitized: SitePermissions = {};
  for (const [origin, perms] of Object.entries(value)) {
    if (typeof origin === "string" && origin.startsWith("http") && isObject(perms)) {
      const safePerms: Partial<Record<PermissionCategory, PermissionDecision>> = {};
      const allowedCategories: PermissionCategory[] = ["camera", "microphone", "notifications", "geolocation"];
      for (const cat of allowedCategories) {
        const decision = (perms as Record<string, unknown>)[cat];
        if (decision === "allow" || decision === "block") {
          safePerms[cat] = decision;
        }
      }
      if (Object.keys(safePerms).length > 0) {
        sanitized[origin] = safePerms;
      }
    }
  }
  return sanitized;
}

export class BrowserDataStore {
  private readonly filePath: string;
  private data: StoredBrowserData;
  private cachedTopSites: { url: string; title: string }[] = [];

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, "lily-browser-data.json");
    this.data = this.read();
    this.recalculateTopSites();
  }

  private recalculateTopSites(): void {
    const counts = new Map<string, { count: number; url: string; title: string }>();

    for (const entry of this.data.history) {
      try {
        const urlObj = new URL(entry.url);
        if (urlObj.protocol !== "http:" && urlObj.protocol !== "https:") continue;
        
        const host = urlObj.hostname;
        
        if (counts.has(host)) {
          counts.get(host)!.count++;
        } else {
          counts.set(host, { count: 1, url: entry.url, title: entry.title });
        }
      } catch {
        continue;
      }
    }

    this.cachedTopSites = Array.from(counts.values())
      .sort((a, b) => b.count !== a.count ? b.count - a.count : a.title.localeCompare(b.title))
      .slice(0, 8)
      .map(item => ({ url: item.url, title: item.title }));
  }

  getTopSites(): { url: string; title: string }[] {
    return this.cachedTopSites;
  }

  getBookmarks(): Bookmark[] {
    return this.data.bookmarks.map((bookmark) => ({ ...bookmark }));
  }

  getBookmarkFolders(): BookmarkFolder[] {
    return this.data.bookmarkFolders.map((folder) => ({ ...folder }));
  }

  getHistory(): HistoryEntry[] {
    return this.data.history.map((entry) => ({ ...entry }));
  }

  getDownloads(): StoredDownload[] {
    return this.data.downloads.map((download) => ({ ...download }));
  }

  getShortcuts(): Shortcut[] {
    return this.data.shortcuts.map((shortcut) => ({ ...shortcut }));
  }

  getSession(): SessionSnapshot {
    return { activeIndex: this.data.session.activeIndex, tabs: this.data.session.tabs.map((tab) => ({ ...tab })) };
  }

  getPreferences(): BrowserPreferences {
    return { ...this.data.preferences };
  }

  getPermissions(): SitePermissions {
    return JSON.parse(JSON.stringify(this.data.permissions));
  }

  getPermission(origin: string, category: PermissionCategory): PermissionDecision | undefined {
    return this.data.permissions[origin]?.[category];
  }

  setPermission(origin: string, category: PermissionCategory, decision: PermissionDecision): void {
    if (!this.data.permissions[origin]) {
      this.data.permissions[origin] = {};
    }
    this.data.permissions[origin][category] = decision;
    this.persist();
  }

  removePermission(origin: string, category: PermissionCategory): void {
    if (this.data.permissions[origin]) {
      delete this.data.permissions[origin][category];
      if (Object.keys(this.data.permissions[origin]).length === 0) {
        delete this.data.permissions[origin];
      }
      this.persist();
    }
  }

  clearAllPermissions(): void {
    this.data.permissions = {};
    this.persist();
  }

  updatePreferences(updates: Partial<BrowserPreferences>): void {
    if (updates.searchEngine && ["duckduckgo", "google", "bing"].includes(updates.searchEngine)) {
      this.data.preferences.searchEngine = updates.searchEngine;
    }
    if (updates.startupBehavior && ["continue", "new-tab"].includes(updates.startupBehavior)) {
      this.data.preferences.startupBehavior = updates.startupBehavior;
    }
    if (typeof updates.downloadLocation === "string" && updates.downloadLocation.trim() !== "") {
      if (existsSync(updates.downloadLocation)) {
        this.data.preferences.downloadLocation = updates.downloadLocation;
      }
    }
    if (typeof updates.askWhereToSave === "boolean") {
      this.data.preferences.askWhereToSave = updates.askWhereToSave;
    }
    if (updates.appearance && ["light", "dark", "system"].includes(updates.appearance)) {
      this.data.preferences.appearance = updates.appearance;
    }
    if (typeof updates.newTabShowShortcuts === "boolean") {
      this.data.preferences.newTabShowShortcuts = updates.newTabShowShortcuts;
    }
    if (typeof updates.newTabShowTopSites === "boolean") {
      this.data.preferences.newTabShowTopSites = updates.newTabShowTopSites;
    }
    if (typeof updates.newTabBackground === "string") {
      this.data.preferences.newTabBackground = updates.newTabBackground;
    }
    this.persist();
  }

  addImportedBookmarks(items: { url: string; title: string; createdAt?: number; folderName?: string }[]): number {
    let importedCount = 0;
    for (const item of items) {
      if (this.data.bookmarks.some((b) => b.url === item.url && b.title === item.title)) {
        continue;
      }

      let folderId: string | undefined;
      if (item.folderName && item.folderName.trim() !== "") {
        const folderName = item.folderName.trim();
        let folder = this.data.bookmarkFolders.find((f) => f.name === folderName);
        if (!folder) {
          folder = { id: randomUUID(), name: folderName, createdAt: Date.now() };
          this.data.bookmarkFolders.push(folder);
        }
        folderId = folder.id;
      }

      this.data.bookmarks.push({
        id: randomUUID(),
        url: item.url,
        title: item.title,
        createdAt: item.createdAt || Date.now(),
        folderId
      });
      importedCount++;
    }

    if (importedCount > 0) {
      // Netscape imports are usually appended to the end or beginning?
      // Since we push, they'll appear at the bottom.
      // But we should limit the array size if it explodes.
      // Easiest is to keep the most recent ones if we slice, but let's just slice from the end to retain imported bookmarks.
      // Wait, toggleBookmark unshifts (puts at top), so the latest bookmarks are at index 0. 
      // If we pushed, the imported ones are at the end (oldest). That's fine.
      if (this.data.bookmarks.length > MAX_BOOKMARKS) {
        this.data.bookmarks = this.data.bookmarks.slice(0, MAX_BOOKMARKS);
      }
      this.persist();
    }
    return importedCount;
  }

  toggleBookmark(url: string, title: string, isPrivateOrigin?: boolean): boolean {
    const existingIndex = this.data.bookmarks.findIndex((bookmark) => bookmark.url === url);
    if (existingIndex >= 0) {
      this.data.bookmarks.splice(existingIndex, 1);
      this.persist();
      return false;
    }
    this.data.bookmarks.unshift({ id: randomUUID(), url, title: readText(title, url), createdAt: Date.now(), isPrivateOrigin });
    if (this.data.bookmarks.length > MAX_BOOKMARKS) {
      this.data.bookmarks = this.data.bookmarks.slice(0, MAX_BOOKMARKS);
    }
    this.persist();
    return true;
  }

  updateBookmark(bookmarkId: string, url: string, title: string, folderId?: string): void {
    const bookmark = this.data.bookmarks.find((b) => b.id === bookmarkId);
    if (bookmark) {
      bookmark.url = url;
      bookmark.title = readText(title, url);
      bookmark.folderId = folderId;
      this.persist();
    }
  }

  createBookmarkFolder(name: string): string {
    const id = randomUUID();
    this.data.bookmarkFolders.push({ id, name: readText(name, "New Folder"), createdAt: Date.now() });
    this.persist();
    return id;
  }

  renameBookmarkFolder(folderId: string, name: string): void {
    const folder = this.data.bookmarkFolders.find((f) => f.id === folderId);
    if (folder) {
      folder.name = readText(name, "New Folder");
      this.persist();
    }
  }

  deleteBookmarkFolder(folderId: string): boolean {
    const hasBookmarks = this.data.bookmarks.some((b) => b.folderId === folderId);
    if (hasBookmarks) return false;
    
    const next = this.data.bookmarkFolders.filter((f) => f.id !== folderId);
    if (next.length !== this.data.bookmarkFolders.length) {
      this.data.bookmarkFolders = next;
      this.persist();
    }
    return true;
  }

  removeBookmark(bookmarkId: string): void {
    const next = this.data.bookmarks.filter((bookmark) => bookmark.id !== bookmarkId);
    if (next.length !== this.data.bookmarks.length) {
      this.data.bookmarks = next;
      this.persist();
    }
  }

  addShortcut(url: string, title: string): void {
    if (this.data.shortcuts.length >= 20) return;
    this.data.shortcuts.push({ id: randomUUID(), url, title: readText(title, url) });
    this.persist();
  }

  updateShortcut(shortcutId: string, url: string, title: string): void {
    const shortcut = this.data.shortcuts.find((s) => s.id === shortcutId);
    if (shortcut) {
      shortcut.url = url;
      shortcut.title = readText(title, url);
      this.persist();
    }
  }

  removeShortcut(shortcutId: string): void {
    const next = this.data.shortcuts.filter((shortcut) => shortcut.id !== shortcutId);
    if (next.length !== this.data.shortcuts.length) {
      this.data.shortcuts = next;
      this.persist();
    }
  }

  recordHistory(url: string, title: string): HistoryEntry {
    const entry: HistoryEntry = { id: randomUUID(), url, title: readText(title, url), visitedAt: Date.now() };
    this.data.history.unshift(entry);
    this.data.history = this.data.history.slice(0, MAX_HISTORY_ENTRIES);
    this.persist();
    this.recalculateTopSites();
    return { ...entry };
  }

  updateHistoryTitle(historyId: string, title: string): void {
    const entry = this.data.history.find((item) => item.id === historyId);
    if (!entry || entry.title === title) return;
    entry.title = readText(title, entry.url);
    this.persist();
    this.recalculateTopSites();
  }

  clearHistory(): void {
    if (this.data.history.length > 0) {
      this.data.history = [];
      this.persist();
      this.recalculateTopSites();
    }
  }

  removeHistoryEntry(historyId: string): void {
    const next = this.data.history.filter((entry) => entry.id !== historyId);
    if (next.length !== this.data.history.length) {
      this.data.history = next;
      this.persist();
      this.recalculateTopSites();
    }
  }

  saveDownloads(downloads: StoredDownload[]): void {
    this.data.downloads = downloads
      .slice(0, MAX_DOWNLOADS)
      .map((download) => ({ ...download }));
    this.persist();
  }

  saveSession(session: SessionSnapshot): void {
    this.data.session = sanitizeSession(session);
    this.persist();
  }

  private read(): StoredBrowserData {
    if (!existsSync(this.filePath)) return emptyData();
    try {
      return sanitizeData(JSON.parse(readFileSync(this.filePath, "utf8")));
    } catch {
      try {
        renameSync(this.filePath, `${this.filePath}.corrupt-${Date.now()}`);
      } catch {
        // A read-only or locked corrupt file should not prevent the browser from starting.
      }
      return emptyData();
    }
  }

  private persist(): void {
    const temporaryPath = `${this.filePath}.tmp`;
    try {
      writeFileSync(temporaryPath, JSON.stringify(this.data), "utf8");
      renameSync(temporaryPath, this.filePath);
    } catch {
      try {
        if (existsSync(temporaryPath)) renameSync(temporaryPath, `${temporaryPath}.failed-${Date.now()}`);
      } catch {
        // Persistence failure must not interrupt navigation or downloads.
      }
    }
  }
}
