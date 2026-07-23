export type BrowserCommand =
  | "new-tab"
  | "close-tab"
  | "back"
  | "forward"
  | "reload"
  | "home"
  | "focus-address";

export interface BrowserTab {
  id: string;
  title: string;
  url: string;
  isNewTab: boolean;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  error?: string;
}

export interface BrowserState {
  tabs: BrowserTab[];
  activeTabId: string;
  bookmarks: Bookmark[];
  history: HistoryEntry[];
  downloads: DownloadRecord[];
}

export interface BrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  createdAt: number;
}

export interface HistoryEntry {
  id: string;
  title: string;
  url: string;
  visitedAt: number;
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

