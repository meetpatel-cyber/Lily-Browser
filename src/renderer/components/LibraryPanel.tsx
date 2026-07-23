import type { Bookmark, DownloadRecord, HistoryEntry } from "../../shared/browser";
import { Icon } from "./Icon";

export type LibrarySection = "bookmarks" | "history" | "downloads";

interface LibraryPanelProps {
  section: LibrarySection;
  bookmarks: Bookmark[];
  history: HistoryEntry[];
  downloads: DownloadRecord[];
  onSectionChange: (section: LibrarySection) => void;
  onClose: () => void;
  onOpenUrl: (url: string) => void;
  onRemoveBookmark: (bookmarkId: string) => void;
  onClearHistory: () => void;
  onOpenDownload: (downloadId: string) => void;
  onRevealDownload: (downloadId: string) => void;
}

function relativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1_000));
  if (seconds < 60) return "Just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1_024;
    unit += 1;
  } while (value >= 1_024 && unit < units.length - 1);
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="library-empty">{children}</p>;
}

function BookmarkList({ bookmarks, onOpenUrl, onRemoveBookmark }: Pick<LibraryPanelProps, "bookmarks" | "onOpenUrl" | "onRemoveBookmark">) {
  if (bookmarks.length === 0) return <EmptyState>Pages you save will appear here.</EmptyState>;
  return (
    <div className="library-list">
      {bookmarks.map((bookmark) => (
        <div className="library-entry" key={bookmark.id}>
          <button className="library-entry__open" type="button" onClick={() => onOpenUrl(bookmark.url)} title={bookmark.url}>
            <Icon name="star" size={16} filled />
            <span><strong>{bookmark.title}</strong><small>{bookmark.url}</small></span>
          </button>
          <button className="library-entry__action" type="button" title="Delete bookmark" aria-label={`Delete ${bookmark.title}`} onClick={() => onRemoveBookmark(bookmark.id)}><Icon name="trash" size={16} /></button>
        </div>
      ))}
    </div>
  );
}

function HistoryList({ history, onOpenUrl }: Pick<LibraryPanelProps, "history" | "onOpenUrl">) {
  if (history.length === 0) return <EmptyState>Pages you visit will appear here.</EmptyState>;
  return (
    <div className="library-list">
      {history.map((entry) => (
        <div className="library-entry" key={entry.id}>
          <button className="library-entry__open" type="button" onClick={() => onOpenUrl(entry.url)} title={entry.url}>
            <Icon name="history" size={16} />
            <span><strong>{entry.title}</strong><small>{entry.url}</small></span>
          </button>
          <time className="library-entry__time" dateTime={new Date(entry.visitedAt).toISOString()}>{relativeTime(entry.visitedAt)}</time>
        </div>
      ))}
    </div>
  );
}

function downloadStatus(download: DownloadRecord): string {
  if (download.status === "completed") return `${formatBytes(download.receivedBytes)} · Complete`;
  if (download.status === "cancelled") return "Cancelled";
  if (download.status === "failed") return "Failed";
  if (download.totalBytes > 0) return `${formatBytes(download.receivedBytes)} of ${formatBytes(download.totalBytes)}`;
  return `${formatBytes(download.receivedBytes)} downloaded`;
}

function DownloadList({ downloads, onOpenDownload, onRevealDownload }: Pick<LibraryPanelProps, "downloads" | "onOpenDownload" | "onRevealDownload">) {
  if (downloads.length === 0) return <EmptyState>Downloads started from websites will appear here.</EmptyState>;
  return (
    <div className="library-list">
      {downloads.map((download) => (
        <div className="library-entry library-entry--download" key={download.id}>
          <span className={`download-icon download-icon--${download.status}`}><Icon name="download" size={17} /></span>
          <span className="library-entry__download-copy"><strong title={download.filename}>{download.filename}</strong><small>{downloadStatus(download)}</small>{download.error && <em>{download.error}</em>}</span>
          {download.status === "in-progress" && <span className="download-progress" aria-label="Download in progress"><i style={{ width: download.totalBytes ? `${Math.min(100, (download.receivedBytes / download.totalBytes) * 100)}%` : "35%" }} /></span>}
          {download.status === "completed" && <span className="download-actions">
            <button className="library-entry__action" type="button" title="Open downloaded file" aria-label={`Open ${download.filename}`} onClick={() => onOpenDownload(download.id)}><Icon name="open" size={16} /></button>
            <button className="library-entry__action" type="button" title="Show in folder" aria-label={`Show ${download.filename} in folder`} onClick={() => onRevealDownload(download.id)}><Icon name="folder" size={16} /></button>
          </span>}
        </div>
      ))}
    </div>
  );
}

export function LibraryPanel({ section, bookmarks, history, downloads, onSectionChange, onClose, onOpenUrl, onRemoveBookmark, onClearHistory, onOpenDownload, onRevealDownload }: LibraryPanelProps) {
  return (
    <section className="library-panel" aria-label="Library">
      <div className="library-panel__header">
        <div><span className="library-panel__eyebrow">Lily Browser</span><h2>Library</h2></div>
        <button className="library-close" type="button" aria-label="Close library" title="Close library" onClick={onClose}><Icon name="close" /></button>
      </div>
      <div className="library-tabs" role="tablist" aria-label="Library sections">
        {(["bookmarks", "history", "downloads"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={section === item} className={section === item ? "library-tab library-tab--active" : "library-tab"} onClick={() => onSectionChange(item)}>{item}</button>)}
      </div>
      <div className="library-panel__content">
        <div className="library-panel__section-heading">
          <h3>{section === "bookmarks" ? "Bookmarks" : section === "history" ? "History" : "Downloads"}</h3>
          {section === "history" && history.length > 0 && <button className="library-clear" type="button" onClick={onClearHistory}>Clear history</button>}
        </div>
        {section === "bookmarks" && <BookmarkList bookmarks={bookmarks} onOpenUrl={onOpenUrl} onRemoveBookmark={onRemoveBookmark} />}
        {section === "history" && <HistoryList history={history} onOpenUrl={onOpenUrl} />}
        {section === "downloads" && <DownloadList downloads={downloads} onOpenDownload={onOpenDownload} onRevealDownload={onRevealDownload} />}
      </div>
    </section>
  );
}
