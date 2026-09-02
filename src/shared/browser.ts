export type BrowserCommand = | 'new-window' | 'new-private-window'
  | "new-tab"
  | "close-tab"
  | "back"
  | "forward"
  | "reload"
  | "home"
  | "focus-address"
  | "find"
  | "zoom-in"
  | "zoom-out"
  | "zoom-reset"
  | "next-tab"
  | "previous-tab"
  | "reopen-tab"
  | "tab-search";

export interface FindState {
  visible: boolean;
  text: string;
  activeMatchOrdinal: number;
  matches: number;
}

export interface BrowserTab {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  isNewTab: boolean;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  error?: string;
  findState?: FindState;
  zoomFactor?: number;
  isPinned?: boolean;
  groupId?: string;
  isAudible?: boolean;
  isMuted?: boolean;
}

export type TabGroupColor = "grey" | "blue" | "red" | "yellow" | "green" | "pink" | "purple" | "cyan" | "orange";
export interface TabGroup {
  id: string;
  name: string;
  color: TabGroupColor;
}

export type SearchEngine = "duckduckgo" | "google" | "bing";
export type StartupBehavior = "continue" | "new-tab";
export type AppearanceMode = "light" | "dark" | "system";

export interface BrowserPreferences {
  searchEngine: SearchEngine;
  startupBehavior: StartupBehavior;
  downloadLocation: string; // read-only property for UI
  askWhereToSave: boolean;
  appearance: AppearanceMode;
  newTabShowShortcuts: boolean;
  newTabShowTopSites: boolean;
  newTabBackground?: string;
}

export interface BrowserState {
  tabs: BrowserTab[];
  tabGroups: Record<string, TabGroup>;
  activeTabId: string;
  bookmarks: Bookmark[];
  bookmarkFolders: BookmarkFolder[];
  history: HistoryEntry[];
  downloads: DownloadRecord[];
  shortcuts: Shortcut[];
  topSites: { url: string; title: string }[];
  preferences: BrowserPreferences;
  permissions: SitePermissions;
  pendingPermissions: PendingPermission[];
  effectiveTheme: "light" | "dark";
  isPrivateWindow?: boolean;
  privateHistoryEnabled?: boolean;
}
export interface BrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ClearBrowsingDataOptions {
  history: boolean;
  cookies: boolean;
  cache: boolean;
}

export type PermissionDecision = "allow" | "block";
export type PermissionCategory = "camera" | "microphone" | "cameraAndMicrophone" | "notifications" | "geolocation";

export type SitePermissions = Record<string, Partial<Record<PermissionCategory, PermissionDecision>>>;

export interface PendingPermission {
  id: string;
  tabId: string;
  origin: string;
  category: PermissionCategory;
}

export interface BookmarkFolder {
  id: string;
  name: string;
  createdAt: number;
}

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  createdAt: number;
  folderId?: string;
  isPrivateOrigin?: boolean;
}

export interface HistoryEntry {
  id: string;
  title: string;
  url: string;
  visitedAt: number;
}

export interface Shortcut {
  id: string;
  title: string;
  url: string;
}

export type DownloadStatus = "in-progress" | "completed" | "cancelled" | "failed";

export interface DownloadRecord {
  id: string;
  filename: string;
  url: string;
  receivedBytes: number;
  totalBytes: number;
  status: DownloadStatus;
  startedAt: number;
  completedAt?: number;
  error?: string;
  speed?: string;
  isPaused?: boolean;
  canResume?: boolean;
}

